import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TRUST_DATA as DEFAULT_TRUST_DATA } from "./trust-data.js";

const STATUS_URL = "https://android.googleapis.com/attestation/status";
const ROOT_URL = "https://android.googleapis.com/attestation/root";
const SPECTER_CATALOG_URL = "https://rawbin.dpejoh.com/catalog";
const CACHE_PATH = join(process.cwd(), "data", "trust-data.json");

function normalizeSerial(s) {
  if (!s) return "";
  return String(s).trim().toLowerCase().replace(/^0+/, "");
}

class TrustManager {
  constructor() {
    this.trustData = DEFAULT_TRUST_DATA;
    this.specterEntries = [];
    this.softbannedSerials = new Set();
    this.specterRevokedSerials = new Set();
    this.lastRefreshedAt = null;
    this.lastFetchTimestamp = 0;
  }

  async init() {
    if (existsSync(CACHE_PATH)) {
      try {
        const raw = await readFile(CACHE_PATH, "utf-8");
        const cached = JSON.parse(raw);
        if (cached && cached.roots && cached.status) {
          this.trustData = cached;
          this.lastRefreshedAt = cached.fetchedAt || null;
          if (Array.isArray(cached.specterEntries)) {
            this.updateSpecterIndex(cached.specterEntries);
          }
          console.log(`[TrustManager] Loaded cached trust data (${Object.keys(this.trustData.status?.entries || {}).length} entries, ${this.trustData.roots?.length || 0} roots, ${this.softbannedSerials.size} softbanned serials)`);
        }
      } catch (err) {
        console.warn("[TrustManager] Failed to read cached trust data, falling back to default:", err.message);
      }
    }
  }

  updateSpecterIndex(entries) {
    this.specterEntries = entries || [];
    this.softbannedSerials.clear();
    this.specterRevokedSerials.clear();

    for (const e of this.specterEntries) {
      if (!e || !e.serial) continue;
      const norm = normalizeSerial(e.serial);
      if (!norm) continue;

      if (e.softbanned === true) {
        this.softbannedSerials.add(norm);
        this.softbannedSerials.add(e.serial.toLowerCase());
      }
      if (e.revoked === true) {
        this.specterRevokedSerials.add(norm);
        this.specterRevokedSerials.add(e.serial.toLowerCase());
      }
    }
  }

  getTrustData() {
    return {
      ...this.trustData,
      specterEntries: this.specterEntries,
      softbannedSerials: this.softbannedSerials,
      specterRevokedSerials: this.specterRevokedSerials,
      checkSpecterStatus: (serials) => this.checkSpecterStatus(serials),
    };
  }

  checkSpecterStatus(serials) {
    const list = Array.isArray(serials) ? serials : [serials];
    for (const s of list) {
      if (!s) continue;
      const raw = String(s).trim().toLowerCase();
      const norm = normalizeSerial(raw);

      for (const entry of this.specterEntries) {
        if (!entry || !entry.serial) continue;
        const entryRaw = String(entry.serial).trim().toLowerCase();
        const entryNorm = normalizeSerial(entryRaw);

        if (entryRaw === raw || entryNorm === norm || entryRaw === norm || entryNorm === raw) {
          return {
            matched: true,
            isSoftbanned: entry.softbanned === true,
            isRevoked: entry.revoked === true,
            entry,
          };
        }
      }
    }

    return {
      matched: false,
      isSoftbanned: false,
      isRevoked: false,
      entry: null,
    };
  }

  async refreshTrustData(force = false) {
    const now = Date.now();
    if (!force && this.lastFetchTimestamp && (now - this.lastFetchTimestamp < 15000)) {
      return this.getTrustData();
    }

    console.log("[TrustManager] Fetching latest Google attestation CRL, roots & Specter catalog...");
    try {
      // 1. Fetch Google CRL Status
      const statusRes = await fetch(`${STATUS_URL}?ts=${now}`, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          "User-Agent": "KeyBoxChecker/1.0"
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!statusRes.ok) {
        throw new Error(`Status URL responded with HTTP ${statusRes.status}`);
      }
      const status = await statusRes.json();

      // 2. Fetch Google Attestation Roots
      const rootRes = await fetch(`${ROOT_URL}?ts=${now}`, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          "User-Agent": "KeyBoxChecker/1.0"
        },
        signal: AbortSignal.timeout(15000),
      });

      let fetchedRoots = [];
      if (rootRes.ok) {
        const text = await rootRes.text();
        try {
          const json = JSON.parse(text);
          const values = json.certificates || json.roots || json.entries || (Array.isArray(json) ? json : []);
          if (Array.isArray(values)) {
            fetchedRoots = values.map(v => typeof v === "string" ? v : v.pem || v.certificate).filter(Boolean);
          }
        } catch {
          fetchedRoots = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
        }
      }

      let roots = (this.trustData.roots || DEFAULT_TRUST_DATA.roots).filter(root => !root.id.startsWith("google_fetched_"));
      fetchedRoots.forEach((pem, index) => {
        roots.push({
          id: `google_fetched_${index + 1}`,
          label: `Google hardware attestation root certificate (fetched #${index + 1})`,
          kind: "google_hardware",
          level: "trusted",
          pem,
        });
      });

      // 3. Fetch Specter Catalog for Softban & Revocation status
      let specterEntries = this.specterEntries;
      try {
        const specterRes = await fetch(`${SPECTER_CATALOG_URL}?ts=${now}`, {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "User-Agent": "KeyBoxChecker/1.0"
          },
          signal: AbortSignal.timeout(15000),
        });
        if (specterRes.ok) {
          const specterJson = await specterRes.json();
          if (Array.isArray(specterJson.entries)) {
            specterEntries = specterJson.entries;
            this.updateSpecterIndex(specterEntries);
            console.log(`[TrustManager] Updated Specter catalog: ${specterEntries.length} entries (${this.softbannedSerials.size} softbanned serials indexed).`);
          }
        }
      } catch (specterErr) {
        console.warn("[TrustManager] Failed to fetch Specter catalog:", specterErr.message);
      }

      const fetchedAt = new Date().toISOString();
      const nextData = {
        ...this.trustData,
        version: `live-${fetchedAt.slice(0, 10)}`,
        fetchedAt,
        status,
        roots,
        specterEntries,
      };

      this.trustData = nextData;
      this.lastRefreshedAt = fetchedAt;
      this.lastFetchTimestamp = now;

      await writeFile(CACHE_PATH, JSON.stringify(nextData, null, 2), "utf-8");
      console.log(`[TrustManager] Successfully updated trust data: ${Object.keys(status.entries || {}).length} revocation entries, ${roots.length} roots, ${this.softbannedSerials.size} softbanned serials.`);
      return this.getTrustData();
    } catch (err) {
      console.error("[TrustManager] Failed to refresh trust data:", err.message);
      return this.getTrustData();
    }
  }
}

export const trustManager = new TrustManager();
