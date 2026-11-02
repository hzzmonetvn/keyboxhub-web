import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { analyzeKeybox, evaluateIsRkp, calculateKeyboxQualityScore, formatCanonicalKeyboxXml } from "./analyzer.js";
import { notifyKeyboxEvent } from "./notifications.js";

let db = null;

export function initDb() {
  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const DB_PATH = join(dataDir, "keybox.db");
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

    CREATE TABLE IF NOT EXISTS keybox_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      serial TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('added', 'device', 'banned')),
      created_at TEXT NOT NULL
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
    const hasRkp = tableInfo.some(col => col.name === "is_rkp");
    if (!hasRkp) {
      db.exec("ALTER TABLE keyboxes ADD COLUMN is_rkp INTEGER DEFAULT 0;");
      console.log("[DB] Added is_rkp column to keyboxes table");
    }

    // Backfill is_rkp for existing keys if not flagged
    try {
      const unbackfilled = db.prepare("SELECT id, check_result FROM keyboxes WHERE is_rkp = 0 OR is_rkp IS NULL").all();
      const updateRkp = db.prepare("UPDATE keyboxes SET is_rkp = 1 WHERE id = ?");
      for (const row of unbackfilled) {
        try {
          const cr = JSON.parse(row.check_result);
          if (evaluateIsRkp(cr)) {
            updateRkp.run(row.id);
          }
        } catch {}
      }
    } catch {}

    // Auto-canonicalize XML structure for existing keyboxes to ensure <CertificateChain> compliance
    try {
      const allRows = db.prepare("SELECT id, xml_content FROM keyboxes").all();
      const updateXml = db.prepare("UPDATE keyboxes SET xml_content = ? WHERE id = ?");
      for (const row of allRows) {
        if (row.xml_content) {
          const canonical = formatCanonicalKeyboxXml(row.xml_content);
          if (canonical && canonical !== row.xml_content) {
            updateXml.run(canonical, row.id);
          }
        }
      }
    } catch {}
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
    CREATE INDEX IF NOT EXISTS idx_keyboxes_rkp ON keyboxes(is_rkp);
    CREATE INDEX IF NOT EXISTS idx_reports_key_ip ON reports(key_id, reporter_ip);
  `);

  // Seed or supplement default 3rd-party sources (INSERT OR IGNORE respects existing records & admin modifications)
  const defaultSources = [
    { name: "Specter Catalog (KOW, Yuri, Xiaomi)", type: "specter", url: "https://rawbin.dpejoh.com/catalog" },
    { name: "Yurikey (Yurii0307 Official)", type: "raw_url", url: "https://raw.githubusercontent.com/Yurii0307/yurikey/main/key" },
    { name: "AlwaysStrong (@evokerr)", type: "raw_url", url: "https://evoker.qzz.io/key" },
    { name: "Evolution X", type: "raw_url", url: "https://git.evolution-x.org/EvoX/keybox/raw/branch/main/keybox.xml" },
    { name: "ZKOS Database", type: "raw_url", url: "https://raw.githubusercontent.com/zuri1503/Toolbox-Database/refs/heads/main/keybox.xml" },
    { name: "dare-devil-ex / keyboxxBot", type: "raw_url", url: "https://raw.githubusercontent.com/dare-devil-ex/keyboxxBot/main/keybox.xml" },
    { name: "TrickBox (GueRapii / Charlie)", type: "raw_url", url: "https://raw.githubusercontent.com/GueRapii/randommodulesfiles/main/file.enc" },
    { name: "GreyElaina / Gist", type: "raw_url", url: "https://gist.githubusercontent.com/GreyElaina/2401596f3b8a01f8602768ad5221e2fd/raw/kb_b.xml" },
    { name: "mywoopies / mejson", type: "raw_url", url: "https://raw.githubusercontent.com/mywoopies/mejson/refs/heads/main/keystore.xml" },
  ];
  const insertSource = db.prepare("INSERT OR IGNORE INTO sources (name, type, url, enabled) VALUES (?, ?, ?, 1)");
  for (const s of defaultSources) {
    insertSource.run(s.name, s.type, s.url);
  }

  // Disable known defunct / 404 / 502 / dummy test sources to keep cron logs clean
  const defunctSources = [
    "https://raw.githubusercontent.com/FREECAMK/Keybox-Play-Integrity-/main/keybox.xml",
    "https://raw.githubusercontent.com/AnhTran1006/Toolbox-Data/main/Toolbox-data/keybox.xml",
    "https://www.davidepalma.it/pib/keybox.xml",
    "https://proxy.corsfix.com/?https://keybox.kowx712.cc/api/keyboxes",
    "http://evoker.qzz.io/key",
  ];
  const disableDefunct = db.prepare("UPDATE sources SET enabled = 0 WHERE url = ? AND enabled = 1");
  for (const url of defunctSources) {
    disableDefunct.run(url);
  }
  db.prepare("DELETE FROM sources WHERE url = 'https://example.test/community'").run();

  setMeta("default_sources_seeded", "1");

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

function recordKeyboxLog(deviceId, serials, status, createdAt = new Date().toISOString()) {
  const serial = Array.isArray(serials) ? serials[0] : serials;
  db.prepare("INSERT INTO keybox_logs (device_id, serial, status, created_at) VALUES (?, ?, ?, ?)")
    .run(deviceId || "Unknown Device", String(serial || ""), status, createdAt);
  db.prepare("DELETE FROM keybox_logs WHERE id NOT IN (SELECT id FROM keybox_logs ORDER BY id DESC LIMIT 10)").run();
}

export function getRecentKeyboxLogs() {
  return db.prepare("SELECT device_id, serial, status, created_at FROM keybox_logs ORDER BY id DESC LIMIT 10").all();
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
  const canonicalXml = formatCanonicalKeyboxXml(xmlContent) || xmlContent;
  const isOverallPass = analysis.overall === "pass" || analysis.overall === "warn";
  if (!isOverallPass) {
    const isRevoked = analysis.isSpecterRevoked || analysis.keyboxes.some(kb => kb.keys.some(key => key.revocation?.hits?.length));
    const rejectedAt = new Date().toISOString();
    const deviceId = analysis.keyboxes.map(k => k.deviceId).filter(Boolean).join(", ") || "Unknown Device";
    const serials = extractLeafSerials(analysis).serials;
    if (isRevoked) recordKeyboxLog(deviceId, serials, "banned", rejectedAt);
    return {
      id: null,
      skipped: false,
      isNew: false,
      isBanned: true,
      status: isRevoked ? "banned" : "invalid",
      deviceId,
      algorithm: Array.from(new Set(analysis.keyboxes.flatMap(k => k.keys.map(key => key.algorithm)))).join(", ") || "Unknown",
      reason: analysis.errors.join("; ") || "Keybox không hợp lệ. Hệ thống từ chối lưu trữ.",
      serials,
      loggedAt: rejectedAt
    };
  }

  const keyHash = computeKeyboxHash(analysis);
  if (!keyHash) {
    throw new Error("Could not extract certificates or keys to create unique keybox hash");
  }

  const now = new Date().toISOString();
  const deviceId = analysis.keyboxes.map(k => k.deviceId).filter(Boolean).join(", ") || "Unknown Device";
  const algs = Array.from(new Set(analysis.keyboxes.flatMap(k => k.keys.map(key => key.algorithm)))).join(", ") || "Unknown";
  const { serials: candidateSerials, primarySerial } = extractLeafSerials(analysis);

  const isSoftbanned = !!analysis.isSoftbanned;
  const isRkp = evaluateIsRkp(analysis);
  const candidateScore = analysis.qualityScore ?? calculateKeyboxQualityScore(analysis);

  // Helper to check and execute in-place upgrade if candidate has higher quality score
  const tryUpgradeExisting = (existing, matchReason) => {
    let existingScore = 0;
    try {
      const parsedCheck = JSON.parse(existing.check_result);
      existingScore = parsedCheck.qualityScore ?? calculateKeyboxQualityScore(parsedCheck);
    } catch {
      existingScore = 0;
    }

    if (candidateScore > existingScore) {
      // Incoming candidate is strictly better (e.g. full chain, dual EC+RSA, trusted root)
      let upgradedStatus = existing.status;
      // If currently banned or invalid, and new passes, evaluate fresh status
      if (existing.status === "banned" || existing.status === "invalid") {
        upgradedStatus = isSoftbanned ? "device" : "strong";
      } else if (existing.status === "strong" && isSoftbanned) {
        upgradedStatus = "device";
      }

      db.prepare(`
        UPDATE keyboxes
        SET xml_content = ?,
            key_hash = ?,
            algorithm = ?,
            status = ?,
            check_result = ?,
            is_softbanned = ?,
            is_rkp = ?,
            serials = ?,
            last_checked_at = ?,
            device_id = CASE WHEN ? != '' AND ? != 'Unknown Device' THEN ? ELSE device_id END
        WHERE id = ?
      `).run(
        canonicalXml,
        keyHash,
        algs,
        upgradedStatus,
        JSON.stringify(analysis),
        isSoftbanned ? 1 : 0,
        isRkp ? 1 : 0,
        JSON.stringify(candidateSerials),
        now,
        deviceId,
        deviceId,
        deviceId,
        existing.id
      );

      if (upgradedStatus === "device" && existing.status !== "device") recordKeyboxLog(deviceId, candidateSerials, "device", now);
      touchLastUpdated();
      void notifyKeyboxEvent("keybox.status_changed", getKeyboxById(existing.id), existing.status, getSystemStatus());

      return {
        id: existing.id,
        skipped: false,
        upgraded: true,
        isNew: false,
        status: upgradedStatus,
        reportCount: existing.report_device_count,
        deviceId: (deviceId && deviceId !== "Unknown Device") ? deviceId : existing.device_id,
        algorithm: algs,
        hash: keyHash,
        source: existing.source || source,
        isSoftbanned,
        isRkp,
        qualityScore: candidateScore,
        previousScore: existingScore,
        serials: candidateSerials,
        primarySerial,
        reason: `Tự động nâng cấp keybox #${existing.id} (${matchReason}) với phiên bản chất lượng cao hơn (Điểm: ${existingScore} -> ${candidateScore})`
      };
    }
    return null;
  };

  // Check 1: Duplicate by leaf certificate serial number
  const existingBySerial = findExistingKeyboxBySerials(candidateSerials);
  if (existingBySerial) {
    const upgraded = tryUpgradeExisting(existingBySerial, `Trùng số serial chứng chỉ: ${candidateSerials[0] || ""}`);
    if (upgraded) return upgraded;

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
    const upgraded = tryUpgradeExisting(existingByHash, "Trùng chuỗi chứng chỉ");
    if (upgraded) return upgraded;

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
      const upgraded = tryUpgradeExisting(existingByDevice, `Trùng Device ID: ${deviceId}`);
      if (upgraded) return upgraded;

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

  // Softbanned keys can only achieve Device status, never Strong!
  let initialStatus = isSoftbanned ? "device" : "strong";
  const bannedAt = null;

  const insert = db.prepare(`
    INSERT INTO keyboxes (
      key_hash, device_id, xml_content, algorithm, status, check_result, report_device_count, uploaded_at, last_checked_at, banned_at, source, created_ip, serials, is_softbanned, is_rkp
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = insert.run(
    keyHash,
    deviceId,
    canonicalXml,
    algs,
    initialStatus,
    JSON.stringify(analysis),
    now,
    now,
    bannedAt,
    source,
    ip,
    JSON.stringify(candidateSerials),
    isSoftbanned ? 1 : 0,
    isRkp ? 1 : 0
  );

  recordKeyboxLog(deviceId, candidateSerials, "added", now);
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
  // STRICT PRIORITY ORDER:
  // Tier 1: 'strong' RKP keys (EC + Google ECDSA P-384 Root CA)
  const strongRkpKeys = db.prepare("SELECT id, xml_content, status, algorithm, device_id, check_result FROM keyboxes WHERE status = 'strong' AND is_rkp = 1").all();
  if (strongRkpKeys.length > 0) {
    // Sort by qualityScore descending, pick randomly among top scores
    return pickBestKeybox(strongRkpKeys);
  }

  // Tier 2: other 'strong' keys
  const strongKeys = db.prepare("SELECT id, xml_content, status, algorithm, device_id, check_result FROM keyboxes WHERE status = 'strong'").all();
  if (strongKeys.length > 0) {
    return pickBestKeybox(strongKeys);
  }

  // Tier 3: 'device' RKP keys
  const deviceRkpKeys = db.prepare("SELECT id, xml_content, status, algorithm, device_id, check_result FROM keyboxes WHERE status = 'device' AND is_rkp = 1").all();
  if (deviceRkpKeys.length > 0) {
    return pickBestKeybox(deviceRkpKeys);
  }

  // Tier 4: other 'device' keys
  const deviceKeys = db.prepare("SELECT id, xml_content, status, algorithm, device_id, check_result FROM keyboxes WHERE status = 'device'").all();
  if (deviceKeys.length > 0) {
    return pickBestKeybox(deviceKeys);
  }

  return null;
}

function pickBestKeybox(keys) {
  if (keys.length === 1) return keys[0];

  const withScore = keys.map(k => {
    let score = 0;
    try {
      const parsed = JSON.parse(k.check_result);
      score = parsed.qualityScore ?? calculateKeyboxQualityScore(parsed);
    } catch {
      score = 0;
    }
    return { ...k, score };
  });

  const maxScore = Math.max(...withScore.map(k => k.score));
  const topKeys = withScore.filter(k => k.score === maxScore);
  return topKeys[Math.floor(Math.random() * topKeys.length)];
}

export function getKeyboxById(id) {
  return db.prepare("SELECT * FROM keyboxes WHERE id = ?").get(id);
}

export function getKeyboxByFilter(criteria) {
  const norm = String(criteria || "").trim().toLowerCase();
  if (!norm || norm === "none" || norm === "random") {
    return getRandomValidKeybox();
  }

  if (norm === "rkp") {
    const strongRkp = db.prepare("SELECT * FROM keyboxes WHERE status = 'strong' AND is_rkp = 1").all();
    if (strongRkp.length > 0) return pickBestKeybox(strongRkp);
    const deviceRkp = db.prepare("SELECT * FROM keyboxes WHERE status = 'device' AND is_rkp = 1").all();
    if (deviceRkp.length > 0) return pickBestKeybox(deviceRkp);
    return null;
  }

  if (norm === "hw") {
    const strongHw = db.prepare("SELECT * FROM keyboxes WHERE status = 'strong' AND (is_rkp = 0 OR is_rkp IS NULL)").all();
    if (strongHw.length > 0) return pickBestKeybox(strongHw);
    const deviceHw = db.prepare("SELECT * FROM keyboxes WHERE status = 'device' AND (is_rkp = 0 OR is_rkp IS NULL)").all();
    if (deviceHw.length > 0) return pickBestKeybox(deviceHw);
    return null;
  }

  if (norm === "strong") {
    const strongKeys = db.prepare("SELECT * FROM keyboxes WHERE status = 'strong'").all();
    if (strongKeys.length > 0) return pickBestKeybox(strongKeys);
    return null;
  }

  if (norm === "device") {
    const deviceKeys = db.prepare("SELECT * FROM keyboxes WHERE status = 'device'").all();
    if (deviceKeys.length > 0) return pickBestKeybox(deviceKeys);
    return null;
  }

  const numericId = parseInt(norm, 10);
  if (!isNaN(numericId) && numericId > 0) {
    const key = getKeyboxById(numericId);
    if (key && key.status !== "banned") return key;
    return null;
  }

  return null;
}

/**
 * Injects a clean, prominent XML watermark indicating the keybox was aggregated and verified by Keybox Hub
 * and ensures output is strictly canonical AOSP / Kaorios KeyBoxManager structure.
 */
export function applyKeyboxWatermark(keybox, meta = {}) {
  const content = typeof keybox === "string" ? keybox : keybox?.xml_content;
  if (!content) return "";

  const id = (typeof keybox === "object" && keybox?.id) || meta.id || "N/A";
  const status = ((typeof keybox === "object" && keybox?.status) || meta.status || "VALID").toUpperCase();
  const device = (typeof keybox === "object" && keybox?.device_id) || meta.deviceId || "Standard Android Attestation";

  const canonical = formatCanonicalKeyboxXml(content, {
    watermark: true,
    id,
    status,
    deviceId: device
  });
  return canonical || content;
}

export function deleteKeybox(id) {
  return db.transaction(() => {
    db.prepare("DELETE FROM reports WHERE key_id = ?").run(id);
    return db.prepare("DELETE FROM keyboxes WHERE id = ?").run(id).changes > 0;
  })();
}

export function updateSource(id, name, url, type, enabled) {
  return db.prepare("UPDATE sources SET name = ?, url = ?, type = ?, enabled = ? WHERE id = ?").run(name, url, type, enabled ? 1 : 0, id).changes > 0;
}

export function deleteSource(id) {
  return db.prepare("DELETE FROM sources WHERE id = ?").run(id).changes > 0;
}

export function getAllKeyboxesPublic() {
  const rows = db.prepare(`
    SELECT id, key_hash, device_id, algorithm, status, report_device_count, uploaded_at, last_checked_at, banned_at, source, check_result, serials, is_softbanned, is_rkp
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
      is_rkp: r.is_rkp === 1,
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
        isRkp: r.is_rkp === 1 || !!parsedCheck.isRkp,
        qualityScore: parsedCheck.qualityScore ?? 0,
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

  if (newCount >= 1 && key.status === "strong") {
    newStatus = "device";
  }

  const reportSerials = (() => {
    try { return JSON.parse(key.serials || "[]"); } catch { return []; }
  })();
  db.transaction(() => {
    db.prepare("UPDATE keyboxes SET report_device_count = ?, status = ? WHERE id = ?").run(newCount, newStatus, keyId);
    if (newStatus !== key.status) recordKeyboxLog(key.device_id, reportSerials, "device", now);
  })();
  touchLastUpdated();
  if (newStatus !== key.status) {
    void notifyKeyboxEvent("keybox.status_changed", getKeyboxById(keyId), key.status, getSystemStatus());
  }

  return {
    success: true,
    key_id: keyId,
    report_count: newCount,
    status: newStatus,
    promoted_to_device: (newCount >= 1 && key.status === "strong")
  };
}

export function getSystemStatus(baseUrl = "https://keybox.hzzmonet.io.vn") {
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'strong' THEN 1 ELSE 0 END) AS strong_count,
      SUM(CASE WHEN status = 'device' THEN 1 ELSE 0 END) AS device_count,
      SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned_count,
      SUM(CASE WHEN is_softbanned = 1 THEN 1 ELSE 0 END) AS softbanned_count,
      SUM(CASE WHEN status IN ('strong', 'device') AND is_rkp = 1 THEN 1 ELSE 0 END) AS rkp_valid_count,
      SUM(CASE WHEN status IN ('strong', 'device') AND (is_rkp = 0 OR is_rkp IS NULL) THEN 1 ELSE 0 END) AS hw_valid_count,
      COUNT(*) AS total_keys
    FROM keyboxes
  `).get();

  const strongCount = counts.strong_count || 0;
  const deviceCount = counts.device_count || 0;
  const bannedCount = counts.banned_count || 0;
  const softbannedCount = counts.softbanned_count || 0;
  const totalRkpValid = counts.rkp_valid_count || 0;
  const totalHwValid = counts.hw_valid_count || 0;
  const totalValid = strongCount + deviceCount;

  let overallStatus = "banned";
  if (strongCount > 0) {
    overallStatus = "strong";
  } else if (deviceCount > 0) {
    overallStatus = "device";
  }

  const lastUpdated = getMeta("last_updated") || new Date().toISOString();
  const lastLooted = getMeta("last_looted_at") || null;

  const validRows = db.prepare(`
    SELECT id, key_hash, device_id, algorithm, status, report_device_count, uploaded_at, last_checked_at, source, check_result, is_softbanned, is_rkp
    FROM keyboxes
    WHERE status IN ('strong', 'device')
    ORDER BY
      CASE WHEN is_rkp = 1 THEN 0 ELSE 1 END ASC,
      CASE WHEN status = 'strong' THEN 0 ELSE 1 END ASC,
      id DESC
  `).all();

  const cleanBaseUrl = (baseUrl || "https://keybox.hzzmonet.io.vn").replace(/\/+$/, "");

  const keyboxes = validRows.map(r => {
    let parsedCheck = {};
    try {
      parsedCheck = JSON.parse(r.check_result);
    } catch {}

    let totalCerts = 0;
    const certificateDetails = [];
    const seenAlgorithms = new Set();

    for (const kb of parsedCheck.keyboxes || []) {
      for (const k of kb.keys || []) {
        const alg = (k.algorithm || "").trim();
        if (alg) seenAlgorithms.add(alg.toLowerCase());
        const count = k.actualCertificateCount || k.certificates?.length || 0;
        totalCerts += count;
        certificateDetails.push({
          algorithm: alg || "unknown",
          count
        });
      }
    }

    if (seenAlgorithms.size === 0 && r.algorithm) {
      r.algorithm
        .split(",")
        .map(a => a.trim())
        .filter(Boolean)
        .forEach(a => seenAlgorithms.add(a.toLowerCase()));
    }

    const algorithms = Array.from(seenAlgorithms);
    const isRkp = r.is_rkp === 1 || Boolean(parsedCheck.isRkp) || evaluateIsRkp(parsedCheck);

    let name = (r.device_id || "").trim();
    if (!name || name.toLowerCase() === "unknown") {
      name = `Keybox #${r.id} (${r.source || "user_upload"})`;
    }

    const downloadUrl = `${cleanBaseUrl}/api/download?id=${r.id}`;

    return {
      id: r.id,
      name,
      device_id: r.device_id,
      status: r.status,
      profile: isRkp ? "rkp" : "hw",
      download_url: downloadUrl,
      source: r.source || "user_upload",
      uploaded_at: r.uploaded_at,
      is_rkp: isRkp,
      certificate_count: totalCerts,
      algorithms,
      certificate_details: certificateDetails
    };
  });

  return {
    status: overallStatus,
    total_valid: totalValid,
    total_hw_valid: totalHwValid,
    total_rkp_valid: totalRkpValid,
    strong_count: strongCount,
    device_count: deviceCount,
    banned_count: bannedCount,
    softbanned_count: softbannedCount,
    total_keys: counts.total_keys || 0,
    last_updated: lastUpdated,
    last_looted_at: lastLooted,
    keyboxes
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
 * Automatically delete all banned/revoked keys immediately
 */
export function cleanupOldBannedKeys() {
  const info = db.prepare("DELETE FROM keyboxes WHERE status = 'banned'").run();

  if (info.changes > 0) {
    db.prepare("DELETE FROM reports WHERE key_id NOT IN (SELECT id FROM keyboxes)").run();
    touchLastUpdated();
    console.log(`[DB Cleanup] Removed ${info.changes} revoked keyboxes.`);
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
      const isRkp = evaluateIsRkp(analysis);
      const { serials } = extractLeafSerials(analysis);
      const keyHash = computeKeyboxHash(analysis);

      if (!isOverallPass) {
        bannedCount++;
        db.transaction(() => {
          let bannedSerials = [];
          try { bannedSerials = JSON.parse(k.serials || "[]"); } catch {}
          recordKeyboxLog(k.device_id, bannedSerials, "banned", nowIso);
          db.prepare("DELETE FROM reports WHERE key_id = ?").run(k.id);
          db.prepare("DELETE FROM keyboxes WHERE id = ?").run(k.id);
          touchLastUpdated();
        })();
        const bannedKeySnapshot = { ...k, status: "banned", banned_at: nowIso };
        void notifyKeyboxEvent("keybox.banned", bannedKeySnapshot, k.status, getSystemStatus());
        continue;
      }

      let newStatus = isSoftbanned
        ? "device"
        : (k.report_device_count > 5 ? "device" : "strong");
      if (isSoftbanned) {
        softbannedCount++;
      }

      db.transaction(() => {
        if (newStatus === "device" && k.status !== "device") recordKeyboxLog(k.device_id, serials, "device", nowIso);
        db.prepare(`
          UPDATE keyboxes
          SET check_result = ?,
              last_checked_at = ?,
              status = ?,
              banned_at = NULL,
              serials = ?,
              is_softbanned = ?,
              is_rkp = ?,
              key_hash = COALESCE(?, key_hash)
          WHERE id = ?
        `).run(
          JSON.stringify(analysis),
          nowIso,
          newStatus,
          JSON.stringify(serials),
          isSoftbanned ? 1 : 0,
          isRkp ? 1 : 0,
          keyHash,
          k.id
        );
      })();

      updatedCount++;
      if (newStatus !== k.status || (isSoftbanned ? 1 : 0) !== k.is_softbanned) {
        touchLastUpdated();
        void notifyKeyboxEvent("keybox.status_changed", getKeyboxById(k.id), k.status, getSystemStatus());
      }
    } catch (err) {
      console.error(`[DB] Error re-checking keybox #${k.id}:`, err.message);
    }
  }

  const cleanedCount = cleanupOldBannedKeys();

  touchLastUpdated();
  console.log(`[DB] Recheck finished: ${updatedCount} keys evaluated (${softbannedCount} softbanned), ${bannedCount} revoked and deleted immediately.`);
  return { updatedCount, bannedCount, softbannedCount, cleanedCount };
}
