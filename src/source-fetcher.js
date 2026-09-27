import { analyzeKeybox, decodeKeyboxBytes } from "./analyzer.js";
import { addKeyboxSkipDuplicate, getAllSources, updateSourceStatus, setMeta, touchLastUpdated } from "./db.js";
import AdmZip from "adm-zip";

const SPECTER_SRC_ALPHABET = "1dgWnocayqxU3r6vA5lCIPYfHmkV08b4tz+KMsp2NQ9LRXihODwSj7BEFJ/ZuGTe";
const SPECTER_DST_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SPECTER_CHAR_MAP = {};
for (let i = 0; i < SPECTER_SRC_ALPHABET.length; i++) {
  SPECTER_CHAR_MAP[SPECTER_SRC_ALPHABET[i]] = SPECTER_DST_ALPHABET[i];
}

/**
 * Normalise body text into standard keybox XML.
 * Handles direct XML, Base64, Hex -> Base64, and Specter scrambled Base64.
 */
export function normaliseKeyboxBody(body) {
  if (!body) return null;
  const str = typeof body === "string" ? body.trim() : decodeKeyboxBytes(body).trim();
  if (str.includes("<AndroidAttestation")) return str;

  const clean = str.replace(/[\s\t\r\n]+/g, "");
  if (!clean) return null;

  // 1. Try standard base64
  try {
    const dec = Buffer.from(clean, "base64").toString("utf-8");
    if (dec.includes("<AndroidAttestation")) return dec;
  } catch {}

  // 2. Try hex -> base64 -> xml
  try {
    const hexClean = clean.replace(/[^0-9a-fA-F]/g, "");
    if (hexClean.length > 20 && hexClean.length % 2 === 0) {
      const b64 = Buffer.from(hexClean, "hex").toString("utf-8");
      const dec2 = Buffer.from(b64.trim(), "base64").toString("utf-8");
      if (dec2.includes("<AndroidAttestation")) return dec2;
      if (b64.includes("<AndroidAttestation")) return b64;
    }
  } catch {}

  // 3. Try Specter scrambled base64
  try {
    let unscrambled = "";
    for (const c of clean) {
      unscrambled += SPECTER_CHAR_MAP[c] || c;
    }
    const dec = Buffer.from(unscrambled, "base64").toString("utf-8");
    if (dec.includes("<AndroidAttestation")) return dec;
  } catch {}

  return null;
}

/**
 * Fetch candidate keyboxes from Specter catalog (rawbin.dpejoh.com)
 */
async function fetchFromSpecter(catalogUrl) {
  const candidates = [];
  try {
    const res = await fetch(`${catalogUrl}?ts=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache", "User-Agent": "KeyBoxChecker/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = await res.json();
    const entries = catalog.entries || [];

    // Filter non-revoked entries (allow both Strong and Softbanned/Device)
    const nonRevoked = entries.filter(e => e.revoked === false && e.source && e.version);

    for (const entry of nonRevoked) {
      try {
        const keyUrl = `https://rawbin.dpejoh.com/key/${encodeURIComponent(entry.source)}/${encodeURIComponent(entry.version)}?ts=${Date.now()}`;
        const keyRes = await fetch(keyUrl, {
          headers: { "Cache-Control": "no-cache", "User-Agent": "KeyBoxChecker/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (!keyRes.ok) continue;
        const text = await keyRes.text();
        const xml = normaliseKeyboxBody(text);
        if (xml) {
          candidates.push({
            sourceName: `Specter:${entry.source}/${entry.version}`,
            xml,
            meta: entry
          });
        }
      } catch (err) {
        console.warn(`[Looter] Failed to fetch Specter key ${entry.source}/${entry.version}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Looter] Error fetching Specter catalog:", err.message);
  }
  return candidates;
}

/**
 * Fetch candidate keybox from a direct raw URL (supports XML, Base64, Hex, and ZIP archives)
 */
async function fetchFromRawUrl(name, url) {
  const candidates = [];
  try {
    const u = url.includes("?") ? `${url}&ts=${Date.now()}` : `${url}?ts=${Date.now()}`;
    const res = await fetch(u, {
      headers: { 
        "Cache-Control": "no-cache", 
        "User-Agent": "Mozilla/5.0 (Linux; Android) KeyboxHub/1.0" 
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if response is a ZIP file (magic bytes PK\x03\x04)
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      try {
        const zip = new AdmZip(buffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory || entry.entryName.includes("__MACOSX")) continue;
          if (entry.entryName.toLowerCase().endsWith(".xml") || entry.entryName.toLowerCase().includes("keybox")) {
            const text = decodeKeyboxBytes(entry.getData());
            const xml = normaliseKeyboxBody(text);
            if (xml) {
              candidates.push({
                sourceName: `${name} [${entry.entryName}]`,
                xml,
                meta: { url, entry: entry.entryName }
              });
            }
          }
        }
      } catch (zipErr) {
        console.warn(`[Looter] Failed to parse zip from "${name}":`, zipErr.message);
      }
    } else {
      const text = decodeKeyboxBytes(buffer);
      const xml = normaliseKeyboxBody(text);
      if (xml) {
        candidates.push({
          sourceName: name,
          xml,
          meta: { url }
        });
      }
    }
  } catch (err) {
    console.warn(`[Looter] Failed to fetch from raw URL source "${name}":`, err.message);
  }
  return candidates;
}

/**
 * Main Looting function:
 * 1. Fetches from all enabled 3rd-party sources
 * 2. Runs KeyBoxChecker against the latest Google CRL
 * 3. IF status is strictly STRONG -> loot (add to DB)
 * 4. IF duplicate -> skip
 */
export async function fetchAndLootThirdPartySources(trustData) {
  console.log("[Looter] Starting 3rd-party keybox fetch & loot cycle (Strong + Device)...");
  const sources = getAllSources().filter(s => s.enabled === 1);
  const results = {
    started_at: new Date().toISOString(),
    sources_checked: sources.length,
    looted_count: 0,
    looted_strong_count: 0,
    looted_device_count: 0,
    skipped_duplicate_count: 0,
    rejected_invalid_count: 0,
    details: []
  };

  for (const src of sources) {
    let candidates = [];
    try {
      if (src.type === "specter") {
        candidates = await fetchFromSpecter(src.url);
      } else {
        candidates = await fetchFromRawUrl(src.name, src.url);
      }
      updateSourceStatus(src.id, `OK (Found ${candidates.length} candidate(s))`);
    } catch (err) {
      updateSourceStatus(src.id, `Error: ${err.message}`);
      continue;
    }

    for (const cand of candidates) {
      try {
        const analysis = await analyzeKeybox(cand.xml, trustData);
        const deviceId = analysis.keyboxes.map(k => k.deviceId).join(", ") || "Unknown Device";

        // Filter out revoked certificates or broken chains/keys
        const isPass = analysis.overall === "pass" || analysis.overall === "warn";
        const hasRevocations = analysis.keyboxes.some(kb => 
          kb.keys.some(k => k.revocation?.hits && k.revocation.hits.length > 0)
        );
        const hasBrokenChain = analysis.keyboxes.some(kb => 
          kb.keys.some(k => k.status === "fail" || k.chain?.valid === false || (k.privateKey && !k.privateKey.matchesLeafCertificate))
        );

        if (!isPass || hasRevocations || hasBrokenChain) {
          results.rejected_invalid_count++;
          results.details.push({
            source: cand.sourceName,
            deviceId,
            action: "rejected_invalid",
            overall: analysis.overall,
            isSoftbanned: !!analysis.isSoftbanned,
            reason: hasRevocations 
              ? "Keybox certificate has been revoked by Google CRL" 
              : "Keybox certificate chain or private key is invalid"
          });
          continue;
        }

        // Key is valid (either Strong or Device)! Attempt to loot, skip if duplicate
        const dbRes = addKeyboxSkipDuplicate(cand.xml, analysis, "3rd-party-looter", cand.sourceName);

        if (dbRes.skipped) {
          results.skipped_duplicate_count++;
          results.details.push({
            source: cand.sourceName,
            deviceId,
            key_id: dbRes.id,
            action: "skipped_duplicate",
            status: dbRes.status,
            reason: dbRes.reason
          });
          console.log(`[Looter] Skipped duplicate key (${deviceId}, status=${dbRes.status}) from ${cand.sourceName}`);
        } else {
          results.looted_count++;
          if (dbRes.status === "strong") results.looted_strong_count++;
          if (dbRes.status === "device") results.looted_device_count++;

          results.details.push({
            source: cand.sourceName,
            deviceId,
            key_id: dbRes.id,
            action: "looted",
            status: dbRes.status,
            isSoftbanned: !!analysis.isSoftbanned,
            message: `Successfully looted new ${dbRes.status} keybox #${dbRes.id} (${deviceId})`
          });
          console.log(`[Looter] LOOTED new ${dbRes.status} keybox #${dbRes.id} (${deviceId}) from ${cand.sourceName}!`);
        }
      } catch (checkErr) {
        console.error(`[Looter] Error testing candidate from ${cand.sourceName}:`, checkErr.message);
      }
    }
  }

  const now = new Date().toISOString();
  setMeta("last_looted_at", now);
  if (results.looted_count > 0) {
    touchLastUpdated();
  }

  console.log(`[Looter] Cycle completed: Looted=${results.looted_count} (Strong=${results.looted_strong_count}, Device=${results.looted_device_count}), Skipped Duplicate=${results.skipped_duplicate_count}, Invalid=${results.rejected_invalid_count}.`);
  return results;
}
