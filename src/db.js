import Database from "better-sqlite3";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { analyzeKeybox } from "./analyzer.js";
import { notifyKeyboxEvent } from "./notifications.js";

const DB_PATH = join(process.cwd(), "data", "keybox.db");
let db = null;

export function initDb() {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS keyboxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT UNIQUE NOT NULL,
      device_id TEXT NOT NULL,
      xml_content TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      status TEXT NOT NULL,
      check_result TEXT NOT NULL,
      report_device_count INTEGER DEFAULT 0,
      uploaded_at TEXT NOT NULL,
      last_checked_at TEXT NOT NULL,
      banned_at TEXT,
      source TEXT DEFAULT 'user_upload',
      created_ip TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id INTEGER NOT NULL,
      reporter_ip TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (key_id) REFERENCES keyboxes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'specter', 'raw_url'
      url TEXT NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 1,
      last_fetched_at TEXT,
      last_status TEXT
    );
  `);

  // Schema migrations
  try {
    const tableInfo = db.pragma("table_info(keyboxes)");
    const hasBannedAt = tableInfo.some(col => col.name === "banned_at");
    if (!hasBannedAt) {
      db.exec("ALTER TABLE keyboxes ADD COLUMN banned_at TEXT;");
      console.log("[DB] Added banned_at column to keyboxes table");
    }
    const hasSource = tableInfo.some(col => col.name === "source");
    if (!hasSource) {
      db.exec("ALTER TABLE keyboxes ADD COLUMN source TEXT DEFAULT 'user_upload';");
      console.log("[DB] Added source column to keyboxes table");
    }
    const hasSerials = tableInfo.some(col => col.name === "serials");
    if (!hasSerials) {
      db.exec("ALTER TABLE keyboxes ADD COLUMN serials TEXT;");
      console.log("[DB] Added serials column to keyboxes table");
    }
    const hasSoftbanned = tableInfo.some(col => col.name === "is_softbanned");
    if (!hasSoftbanned) {
      db.exec("ALTER TABLE keyboxes ADD COLUMN is_softbanned INTEGER DEFAULT 0;");
      console.log("[DB] Added is_softbanned column to keyboxes table");
    }
  } catch (err) {
    console.warn("[DB] Migration warning:", err.message);
  }

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_keyboxes_status ON keyboxes(status);
    CREATE INDEX IF NOT EXISTS idx_keyboxes_hash ON keyboxes(key_hash);
    CREATE INDEX IF NOT EXISTS idx_keyboxes_device ON keyboxes(device_id);
    CREATE INDEX IF NOT EXISTS idx_keyboxes_banned_at ON keyboxes(banned_at);
    CREATE INDEX IF NOT EXISTS idx_keyboxes_softbanned ON keyboxes(is_softbanned);
    CREATE INDEX IF NOT EXISTS idx_reports_key_ip ON reports(key_id, reporter_ip);
  `);

  // Seed default 3rd-party sources
  const insertSource = db.prepare("INSERT OR IGNORE INTO sources (name, type, url, enabled) VALUES (?, ?, ?, 1)");
  insertSource.run("Specter Catalog (KOW, Yuri, Xiaomi)", "specter", "https://rawbin.dpejoh.com/catalog");
  insertSource.run("Yurikey (Yurii0307 Official)", "raw_url", "https://raw.githubusercontent.com/Yurii0307/yurikey/main/key");
  insertSource.run("AlwaysStrong (@evokerr)", "raw_url", "https://evoker.qzz.io/key");
  insertSource.run("TrickBox (GueRapii / Charlie)", "raw_url", "https://raw.githubusercontent.com/GueRapii/randommodulesfiles/main/file.enc");
  insertSource.run("dare-devil-ex / keyboxxBot", "raw_url", "https://raw.githubusercontent.com/dare-devil-ex/keyboxxBot/main/keybox.xml");
  insertSource.run("FREECAMK / Play-Integrity", "raw_url", "https://raw.githubusercontent.com/FREECAMK/Keybox-Play-Integrity-/main/keybox.xml");
  insertSource.run("davidepalma.it", "raw_url", "https://www.davidepalma.it/pib/keybox.xml");

  const lastUpdated = getMeta("last_updated");
  if (!lastUpdated) {
    setMeta("last_updated", new Date().toISOString());
  }

  console.log("[DB] SQLite database initialized at", DB_PATH);
  return db;
}

export function getMeta(key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function setMeta(key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(key, value, value);
}

export function touchLastUpdated() {
  const now = new Date().toISOString();
  setMeta("last_updated", now);
  return now;
}

/**
 * Extract leaf certificate serials (all format variants: hex, unpadded, decimal)
 */
export function extractLeafSerials(analysis) {
  const serials = [];
  let primarySerial = "";
  for (const kb of analysis.keyboxes || []) {
    for (const key of kb.keys || []) {
      if (key.certificates && key.certificates.length > 0) {
        const leaf = key.certificates[0];
        if (leaf.serialHex) {
          const raw = leaf.serialHex.toLowerCase().trim();
          const stripped = raw.replace(/^0+/, "");
          if (!primarySerial) primarySerial = raw;
          serials.push(raw);
          if (stripped) serials.push(stripped);
        }
        if (leaf.serialDecimal) {
          serials.push(String(leaf.serialDecimal).trim());
        }
      }
    }
  }
  const uniqueSerials = Array.from(new Set(serials.filter(Boolean)));
  return { serials: uniqueSerials, primarySerial };
}

/**
 * Find existing keybox in DB by matching any leaf certificate serial
 */
export function findExistingKeyboxBySerials(serials) {
  if (!serials || serials.length === 0) return null;
  for (const s of serials) {
    if (!s) continue;
    const str = String(s).trim().toLowerCase();
    if (!str) continue;
    try {
      const match = db.prepare(`
        SELECT k.* FROM keyboxes k, json_each(k.serials)
        WHERE json_valid(k.serials) AND json_each.value = ?
        LIMIT 1
      `).get(str);
      if (match) return match;
    } catch {}
  }
  return null;
}

/**
 * Deterministic hash of certificate chain & algorithms (independent of DeviceID)
 */
export function computeKeyboxHash(analysis) {
  const parts = [];
  for (const kb of analysis.keyboxes || []) {
    for (const key of kb.keys || []) {
      parts.push(key.algorithm || "");
      for (const cert of key.certificates || []) {
        parts.push(cert.serialHex || cert.serialDecimal || "");
      }
    }
  }
  if (parts.length === 0) {
    return null;
  }
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Adds a new keybox, but SKIPS if duplicate by leaf serial, certificate hash, or DeviceID
 */
export function addKeyboxSkipDuplicate(xmlContent, analysis, ip = "", source = "user_upload") {
  const keyHash = computeKeyboxHash(analysis);
  if (!keyHash) {
    throw new Error("Could not extract certificates or keys to create unique keybox hash");
  }

  const now = new Date().toISOString();
  const deviceId = analysis.keyboxes.map(k => k.deviceId).filter(Boolean).join(", ") || "Unknown Device";
  const algs = Array.from(new Set(analysis.keyboxes.flatMap(k => k.keys.map(key => key.algorithm)))).join(", ") || "Unknown";
  const { serials: candidateSerials, primarySerial } = extractLeafSerials(analysis);

  // Check 1: Duplicate by leaf certificate serial number
  const existingBySerial = findExistingKeyboxBySerials(candidateSerials);
  if (existingBySerial) {
    return {
      id: existingBySerial.id,
      skipped: true,
      isNew: false,
      status: existingBySerial.status,
      reportCount: existingBySerial.report_device_count,
      deviceId: existingBySerial.device_id,
      algorithm: existingBySerial.algorithm,
      hash: existingBySerial.key_hash,
      reason: `Trùng số serial chứng chỉ (${candidateSerials[0] || ""}) với keybox #${existingBySerial.id} ("${existingBySerial.device_id}")`
    };
  }

  // Check 2: Duplicate by certificate hash
  const existingByHash = db.prepare("SELECT * FROM keyboxes WHERE key_hash = ?").get(keyHash);
  if (existingByHash) {
    return {
      id: existingByHash.id,
      skipped: true,
      isNew: false,
      status: existingByHash.status,
      reportCount: existingByHash.report_device_count,
      deviceId: existingByHash.device_id,
      algorithm: existingByHash.algorithm,
      hash: keyHash,
      reason: `Keybox đã tồn tại trên hệ thống (ID #${existingByHash.id}, Device: "${existingByHash.device_id}")`
    };
  }

  // Check 3: Duplicate by DeviceID (case-insensitive)
  if (deviceId && deviceId.toLowerCase() !== "unknown" && deviceId.toLowerCase() !== "unknown device") {
    const existingByDevice = db.prepare("SELECT * FROM keyboxes WHERE LOWER(TRIM(device_id)) = LOWER(TRIM(?))").get(deviceId);
    if (existingByDevice) {
      return {
        id: existingByDevice.id,
        skipped: true,
        isNew: false,
        status: existingByDevice.status,
        reportCount: existingByDevice.report_device_count,
        deviceId: existingByDevice.device_id,
        algorithm: existingByDevice.algorithm,
        hash: keyHash,
        reason: `Trùng Device ID "${deviceId}" với keybox #${existingByDevice.id} đã có`
      };
    }
  }

  const isOverallPass = analysis.overall === "pass" || analysis.overall === "warn";
  const isSoftbanned = !!analysis.isSoftbanned;

  // Softbanned keys can only achieve Device status, never Strong!
  let initialStatus = isOverallPass ? "strong" : "banned";
  if (initialStatus === "strong" && isSoftbanned) {
    initialStatus = "device";
  }
  const bannedAt = initialStatus === "banned" ? now : null;

  const insert = db.prepare(`
    INSERT INTO keyboxes (
      key_hash, device_id, xml_content, algorithm, status, check_result, report_device_count, uploaded_at, last_checked_at, banned_at, source, created_ip, serials, is_softbanned
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = insert.run(
    keyHash,
    deviceId,
    xmlContent,
    algs,
    initialStatus,
    JSON.stringify(analysis),
    now,
    now,
    bannedAt,
    source,
    ip,
    JSON.stringify(candidateSerials),
    isSoftbanned ? 1 : 0
  );

  touchLastUpdated();
  void notifyKeyboxEvent("keybox.added", getKeyboxById(info.lastInsertRowid), null, getSystemStatus());
  return {
    id: info.lastInsertRowid,
    skipped: false,
    isNew: true,
    status: initialStatus,
    reportCount: 0,
    deviceId,
    algorithm: algs,
    hash: keyHash,
    source,
    isBanned: initialStatus === "banned",
    isSoftbanned,
    serials: candidateSerials,
    primarySerial
  };
}

export function getRandomValidKeybox() {
  // STRICT PRIORITY:
  // 1. Pick randomly among 'strong' keys if any exist
  const strongKeys = db.prepare("SELECT id, xml_content, status, algorithm, device_id FROM keyboxes WHERE status = 'strong'").all();
  if (strongKeys.length > 0) {
    const picked = strongKeys[Math.floor(Math.random() * strongKeys.length)];
    return picked;
  }

  // 2. Otherwise pick randomly among 'device' keys if any exist
  const deviceKeys = db.prepare("SELECT id, xml_content, status, algorithm, device_id FROM keyboxes WHERE status = 'device'").all();
  if (deviceKeys.length > 0) {
    const picked = deviceKeys[Math.floor(Math.random() * deviceKeys.length)];
    return picked;
  }

  return null;
}

export function getKeyboxById(id) {
  return db.prepare("SELECT * FROM keyboxes WHERE id = ?").get(id);
}

/**
 * Injects a clean, prominent XML watermark indicating the keybox was aggregated and verified by Keybox Hub
 */
export function applyKeyboxWatermark(keybox, meta = {}) {
  const content = typeof keybox === "string" ? keybox : keybox?.xml_content;
  if (!content) return "";

  let xml = content.trim();
  const id = (typeof keybox === "object" && keybox?.id) || meta.id || "N/A";
  const status = ((typeof keybox === "object" && keybox?.status) || meta.status || "VALID").toUpperCase();
  const device = (typeof keybox === "object" && keybox?.device_id) || meta.deviceId || "Standard Android Attestation";
  const now = new Date().toISOString();

  const watermarkHeader = `<!--
================================================================================
 Keybox Hub | Play Integrity & Attestation Engine
 Tổng hợp & xác thực bởi / Aggregated & verified by: https://keybox.hzzmonet.io.vn
 Keybox ID: #${id} | Status: ${status} | Device ID: ${device}
 Exported: ${now}
================================================================================
-->`;

  const watermarkFooter = `  <!-- Tổng hợp bởi Keybox Hub (https://keybox.hzzmonet.io.vn) -->\n</AndroidAttestation>`;

  // Clean old Keybox Hub watermark if any
  xml = xml.replace(/<!--[\s\S]*?Keybox Hub[\s\S]*?-->\s*/gi, "").trim();

  if (xml.startsWith("<?xml")) {
    const endTag = xml.indexOf("?>") + 2;
    xml = xml.slice(0, endTag) + "\n" + watermarkHeader + "\n" + xml.slice(endTag).trim();
  } else {
    xml = watermarkHeader + "\n" + xml;
  }

  if (xml.includes("</AndroidAttestation>")) {
    xml = xml.replace("</AndroidAttestation>", watermarkFooter);
  }

  return xml;
}

export function getAllKeyboxesPublic() {
  const rows = db.prepare(`
    SELECT id, key_hash, device_id, algorithm, status, report_device_count, uploaded_at, last_checked_at, banned_at, source, check_result, serials, is_softbanned
    FROM keyboxes 
    ORDER BY id DESC
  `).all();

  return rows.map(r => {
    let parsedCheck = {};
    try {
      parsedCheck = JSON.parse(r.check_result);
    } catch {}

    let parsedSerials = [];
    try {
      if (r.serials) parsedSerials = JSON.parse(r.serials) || [];
    } catch {}
    const primarySerial = parsedSerials[0] || "";

    return {
      id: r.id,
      key_hash: r.key_hash,
      device_id: r.device_id,
      algorithm: r.algorithm,
      status: r.status,
      is_softbanned: r.is_softbanned === 1,
      serials: parsedSerials,
      primary_serial: primarySerial,
      report_count: r.report_device_count,
      uploaded_at: r.uploaded_at,
      last_checked_at: r.last_checked_at,
      banned_at: r.banned_at,
      source: r.source || "user_upload",
      check_summary: {
        overall: parsedCheck.overall,
        isSoftbanned: !!parsedCheck.isSoftbanned,
        specter: parsedCheck.specter || null,
        warnings: parsedCheck.warnings || [],
        errors: parsedCheck.errors || []
      }
    };
  });
}

export function reportKeybox(keyId, reporterIp = "") {
  const key = db.prepare("SELECT * FROM keyboxes WHERE id = ?").get(keyId);
  if (!key) {
    return { success: false, error: "Keybox not found" };
  }

  const existingReport = db.prepare(
    "SELECT id FROM reports WHERE key_id = ? AND reporter_ip = ? AND created_at > datetime('now', '-1 day')"
  ).get(keyId, reporterIp);

  if (existingReport && reporterIp !== "127.0.0.1" && reporterIp !== "::1") {
    return {
      success: false,
      error: "You have already reported this keybox recently",
      status: key.status,
      report_count: key.report_device_count
    };
  }

  const now = new Date().toISOString();
  db.prepare("INSERT INTO reports (key_id, reporter_ip, created_at) VALUES (?, ?, ?)").run(keyId, reporterIp, now);

  const newCount = key.report_device_count + 1;
  let newStatus = key.status;

  if (newCount > 5 && key.status === "strong") {
    newStatus = "device";
  }

  db.prepare("UPDATE keyboxes SET report_device_count = ?, status = ? WHERE id = ?").run(newCount, newStatus, keyId);
  touchLastUpdated();
  if (newStatus !== key.status) {
    void notifyKeyboxEvent("keybox.status_changed", getKeyboxById(keyId), key.status, getSystemStatus());
  }

  return {
    success: true,
    key_id: keyId,
    report_count: newCount,
    status: newStatus,
    promoted_to_device: (newCount > 5 && key.status === "strong")
  };
}

export function getSystemStatus() {
  const counts = db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'strong' THEN 1 ELSE 0 END) AS strong_count,
      SUM(CASE WHEN status = 'device' THEN 1 ELSE 0 END) AS device_count,
      SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned_count,
      SUM(CASE WHEN is_softbanned = 1 THEN 1 ELSE 0 END) AS softbanned_count,
      COUNT(*) AS total_keys
    FROM keyboxes
  `).get();

  const strongCount = counts.strong_count || 0;
  const deviceCount = counts.device_count || 0;
  const bannedCount = counts.banned_count || 0;
  const softbannedCount = counts.softbanned_count || 0;
  const totalValid = strongCount + deviceCount;

  let overallStatus = "banned";
  if (strongCount > 0) {
    overallStatus = "strong";
  } else if (deviceCount > 0) {
    overallStatus = "device";
  }

  const lastUpdated = getMeta("last_updated") || new Date().toISOString();
  const lastLooted = getMeta("last_looted_at") || null;

  return {
    status: overallStatus,
    total_valid: totalValid,
    strong_count: strongCount,
    device_count: deviceCount,
    banned_count: bannedCount,
    softbanned_count: softbannedCount,
    total_keys: counts.total_keys || 0,
    last_updated: lastUpdated,
    last_looted_at: lastLooted
  };
}

/**
 * 3rd-party Sources management
 */
export function getAllSources() {
  return db.prepare("SELECT * FROM sources ORDER BY id ASC").all();
}

export function addSource(name, type, url) {
  return db.prepare("INSERT INTO sources (name, type, url, enabled) VALUES (?, ?, ?, 1)").run(name, type, url);
}

export function updateSourceStatus(id, status) {
  const now = new Date().toISOString();
  db.prepare("UPDATE sources SET last_fetched_at = ?, last_status = ? WHERE id = ?").run(now, status, id);
}

export function toggleSource(id, enabled) {
  db.prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

/**
 * Automatically delete banned/revoked keys older than 24 hours
 */
export function cleanupOldBannedKeys() {
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const info = db.prepare(`
    DELETE FROM keyboxes 
    WHERE status = 'banned' 
      AND banned_at IS NOT NULL 
      AND banned_at <= ?
  `).run(cutoffTime);

  if (info.changes > 0) {
    db.prepare("DELETE FROM reports WHERE key_id NOT IN (SELECT id FROM keyboxes)").run();
    touchLastUpdated();
    console.log(`[DB Cleanup] Removed ${info.changes} revoked keyboxes older than 24 hours.`);
  }

  return info.changes;
}

export async function recheckAllKeysInDb(trustData) {
  console.log("[DB] Starting recheck of all keyboxes in database with latest Google attestation status & Specter catalog...");
  const keys = db.prepare("SELECT * FROM keyboxes").all();
  const now = new Date();
  const nowIso = now.toISOString();
  let updatedCount = 0;
  let bannedCount = 0;
  let softbannedCount = 0;

  for (const k of keys) {
    try {
      const analysis = await analyzeKeybox(k.xml_content, trustData, now);
      const isOverallPass = analysis.overall === "pass" || analysis.overall === "warn";
      const isSoftbanned = !!analysis.isSoftbanned;
      const { serials } = extractLeafSerials(analysis);
      const keyHash = computeKeyboxHash(analysis);

      let newStatus = k.status;
      let newBannedAt = k.banned_at;

      if (!isOverallPass) {
        newStatus = "banned";
        if (!newBannedAt) newBannedAt = nowIso;
        bannedCount++;
      } else if (isSoftbanned) {
        newStatus = "device";
        newBannedAt = null;
        softbannedCount++;
      } else {
        newStatus = k.report_device_count > 5 ? "device" : "strong";
        newBannedAt = null;
      }

      db.prepare(`
        UPDATE keyboxes 
        SET check_result = ?, 
            last_checked_at = ?,
            status = ?,
            banned_at = ?,
            serials = ?,
            is_softbanned = ?,
            key_hash = COALESCE(?, key_hash)
        WHERE id = ?
      `).run(
        JSON.stringify(analysis),
        nowIso,
        newStatus,
        newBannedAt,
        JSON.stringify(serials),
        isSoftbanned ? 1 : 0,
        keyHash,
        k.id
      );

      updatedCount++;
      if (newStatus !== k.status || (isSoftbanned ? 1 : 0) !== k.is_softbanned) {
        touchLastUpdated();
        const event = newStatus === "banned" && k.status !== "banned"
          ? "keybox.banned" : "keybox.status_changed";
        void notifyKeyboxEvent(event, getKeyboxById(k.id), k.status, getSystemStatus());
      }
    } catch (err) {
      console.error(`[DB] Error re-checking keybox #${k.id}:`, err.message);
    }
  }

  const cleanedCount = cleanupOldBannedKeys();

  touchLastUpdated();
  console.log(`[DB] Recheck finished: ${updatedCount} keys evaluated (${softbannedCount} softbanned), ${bannedCount} marked banned, ${cleanedCount} purged (>24h).`);
  return { updatedCount, bannedCount, softbannedCount, cleanedCount };
}
