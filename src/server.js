import express from "express";
import cors from "cors";
import multer from "multer";
import AdmZip from "adm-zip";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { 
  initDb,
  addKeyboxSkipDuplicate,
  getRandomValidKeybox,
  getKeyboxById,
  getKeyboxByFilter,
  getAllKeyboxesPublic, 
  reportKeybox, 
  getSystemStatus, 
  touchLastUpdated, 
  recheckAllKeysInDb,
  cleanupOldBannedKeys,
  getAllSources,
  addSource,
  toggleSource,
  applyKeyboxWatermark, updateSource, deleteSource, deleteKeybox
} from "./db.js";
import { trustManager } from "./trust-manager.js";
import { analyzeKeybox, decodeKeyboxBytes, parseKeyboxXml } from "./analyzer.js";
import { repairKeybox } from "./repairer.js";
import { startPeriodicCheck, runFullHourlyCycle, configureIntervals } from "./cron.js";
import { initSiteSettings, getSiteSettings, saveSiteSettings } from "./site-settings.js";
import { fetchAndLootThirdPartySources, normaliseKeyboxBody } from "./source-fetcher.js";
import { initNotificationSettings, getNotificationSubscriber, authorizeNotificationAdmin, getGlobalNotificationSettings, saveGlobalNotificationSettings } from "./notification-settings.js";
import { notificationRoutes } from "./notification-routes.js";
import { startTelegramBot, stopTelegramBot, handleTelegramUpdate, getTelegramBotToken } from "./telegram-bot.js";

const PORT = process.env.PORT || 8098;
export const app = express();
app.set("trust proxy", "loopback");

// Configure storage for file uploads (accepts multiple files up to 20MB total)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 100 }
});

// Middleware
export function getClientIp(req) {
  return String(req.ip || req.socket.remoteAddress || "127.0.0.1").replace(/^::ffff:/i, "");
}
app.use(cors());

const RATE_STATE_LIMIT = 10000;
const rateState = new Map();
export function createRateLimiter(group, { state = rateState, capacity = RATE_STATE_LIMIT, clock = Date.now, settingsFor = () => getSiteSettings().rate_limits[group] } = {}) {
  return (req, res, next) => {
    const settings = settingsFor() || { max: 1, window_seconds: 60 };
    const now = clock();
    const key = `${group}:${getClientIp(req)}`;
    let entry = state.get(key);
    if (entry && entry.reset <= now) {
      state.delete(key);
      entry = null;
    }
    if (!entry) {
      for (const [id, value] of state) if (value.reset <= now) state.delete(id);
      if (state.size >= capacity) {
        const earliestReset = Math.min(...Array.from(state.values(), value => value.reset));
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((earliestReset - now) / 1000))));
        return res.status(503).json({ error: "Rate limiter capacity reached" });
      }
      entry = { count: 0, reset: now + settings.window_seconds * 1000 };
      state.set(key, entry);
    }
    entry.count++;
    if (entry.count > settings.max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.reset - now) / 1000))));
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}
app.use("/api/download", createRateLimiter("download"));
app.use(["/api/upload", "/api/repair"], createRateLimiter("upload"));
app.use(["/api/loot", "/api/check-now", "/api/admin/loot", "/api/admin/check-now"], createRateLimiter("operations"));
app.post("/api/sources", createRateLimiter("operations"));
app.use("/api/notifications/admin/login", createRateLimiter("login"));
app.use("/api/report", createRateLimiter("report"));
app.use("/api/notifications", express.json({ limit: "16kb" }));
app.use("/api/notifications", notificationRoutes(getSystemStatus));
app.use(express.json({ limit: "20mb" }));
app.use(express.text({ type: ["text/xml", "application/xml", "text/plain"], limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Serve static UI assets with no-cache headers to prevent browser caching stale JS/HTML
app.use(express.static(join(process.cwd(), "public"), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".css")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }
}));

// Helper to check if a buffer is a zip file
function isZipBuffer(buffer) {
  return buffer && buffer.length >= 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

// Helper to process a single XML text
async function processXmlString(rawContent, filename = "keybox.xml", clientIp = "", trustData) {
  try {
    let cleanContent = rawContent;
    try {
      const rep = await repairKeybox(rawContent, trustData);
      if (rep && rep.success && rep.repairedXml) {
        cleanContent = rep.repairedXml;
      }
    } catch {}

    let parsed;
    try {
      parsed = parseKeyboxXml(cleanContent);
    } catch (err) {
      return {
        filename,
        success: false,
        skipped: false,
        error: `XML parse error: ${err.message}`
      };
    }

    if (!parsed.keyboxes || parsed.keyboxes.length === 0) {
      return {
        filename,
        success: false,
        skipped: false,
        error: "No <Keybox> elements found in XML."
      };
    }

    // Always evaluate with the latest trust data from Google
    const analysis = await analyzeKeybox(cleanContent, trustData);
    const dbResult = addKeyboxSkipDuplicate(cleanContent, analysis, clientIp, "user_upload");

    const isPass = analysis.overall === "pass" || analysis.overall === "warn";

    if (!isPass || dbResult.isBanned) {
      return {
        filename,
        success: false,
        skipped: false,
        id: null,
        status: dbResult.status,
        deviceId: dbResult.deviceId || "Unknown Device",
        algorithm: dbResult.algorithm || "Unknown",
        isNew: false,
        reportCount: 0,
        analysis: {
          overall: analysis.overall,
          warnings: analysis.warnings || [],
          errors: analysis.errors || []
        },
        message: dbResult.reason || "Keybox chứa chứng chỉ đã bị Google thu hồi hoặc không hợp lệ. Hệ thống từ chối tải lên."
      };
    }

    if (dbResult.upgraded) {
      return {
        filename,
        success: true,
        skipped: false,
        upgraded: true,
        id: dbResult.id,
        status: dbResult.status,
        deviceId: dbResult.deviceId,
        algorithm: dbResult.algorithm,
        isNew: false,
        isRkp: !!dbResult.isRkp,
        qualityScore: dbResult.qualityScore,
        reportCount: dbResult.reportCount,
        analysis: {
          overall: analysis.overall,
          isRkp: !!analysis.isRkp,
          qualityScore: analysis.qualityScore ?? 0,
          warnings: analysis.warnings || [],
          errors: analysis.errors || []
        },
        message: dbResult.reason || `Keybox đã được tự động nâng cấp lên bản chất lượng cao hơn (ID #${dbResult.id})!`
      };
    }

    if (dbResult.skipped) {
      return {
        filename,
        success: true,
        skipped: true,
        upgraded: false,
        id: dbResult.id,
        status: dbResult.status,
        deviceId: dbResult.deviceId,
        algorithm: dbResult.algorithm,
        isNew: false,
        reportCount: dbResult.reportCount,
        analysis: {
          overall: analysis.overall,
          warnings: analysis.warnings || [],
          errors: analysis.errors || []
        },
        message: dbResult.reason || "Trùng lặp: Keybox hoặc Device ID đã tồn tại trên hệ thống (đã bỏ qua)."
      };
    }

    return {
      filename,
      success: true,
      skipped: false,
      upgraded: false,
      id: dbResult.id,
      status: dbResult.status,
      deviceId: dbResult.deviceId,
      algorithm: dbResult.algorithm,
      isNew: true,
      isRkp: !!analysis.isRkp,
      qualityScore: analysis.qualityScore ?? 0,
      reportCount: dbResult.reportCount,
      analysis: {
        overall: analysis.overall,
        isRkp: !!analysis.isRkp,
        qualityScore: analysis.qualityScore ?? 0,
        warnings: analysis.warnings || [],
        errors: analysis.errors || []
      },
      message: "Keybox hợp lệ và đã được thêm vào hệ thống!"
    };
  } catch (err) {
    return {
      filename,
      success: false,
      skipped: false,
      error: err.message
    };
  }
}

// ==========================================
// API ROUTES
// ==========================================
function requireAdmin(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : "";
  if (!authorizeNotificationAdmin(token)) return res.status(401).json({ error: "Admin login required" });
  next();
}

app.get("/api/site-settings", (req, res) => {
  const { appearance, media, intervals } = getSiteSettings();
  res.json({ appearance, media, intervals: { browser_seconds: intervals.browser_seconds } });
});
app.use("/api/admin", requireAdmin);
app.get("/api/admin/settings", (req, res) => res.json(getSiteSettings()));
app.put("/api/admin/settings", (req, res) => {
  try { const settings = saveSiteSettings(req.body); configureIntervals(settings.intervals); res.json(settings); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/admin/notifications", (req, res) => { res.setHeader("Cache-Control", "no-store"); res.json(getGlobalNotificationSettings()); });
app.put("/api/admin/notifications", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(saveGlobalNotificationSettings(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/admin/keys", (req, res) => res.json({ keys: getAllKeyboxesPublic() }));
app.delete("/api/admin/keys/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid key ID" });
  return deleteKeybox(id) ? res.json({ success: true }) : res.status(404).json({ error: "Key not found" });
});
app.get("/api/admin/sources", (req, res) => res.json({ sources: getAllSources() }));
function isValidSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !!url.hostname && !url.username && !url.password; } catch { return false; }
}

app.post("/api/admin/sources", (req, res) => {
  const { name, url, type } = req.body || {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || !isValidSourceUrl(url) || !["raw_url", "specter"].includes(type)) return res.status(400).json({ error: "Invalid source" });
  try { const result = addSource(name.trim(), type, url.trim()); res.status(201).json({ success: true, id: result.lastInsertRowid }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.put("/api/admin/sources/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, url, type, enabled } = req.body || {};
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid source ID" });
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || !isValidSourceUrl(url) || !["raw_url", "specter"].includes(type) || typeof enabled !== "boolean") return res.status(400).json({ error: "Invalid source" });
  try { updateSource(id, name.trim(), url.trim(), type, enabled) ? res.json({ success: true }) : res.status(404).json({ error: "Source not found" }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/admin/sources/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid source ID" });
  return deleteSource(id) ? res.json({ success: true }) : res.status(404).json({ error: "Source not found" });
});
app.post("/api/admin/check-now", async (req, res) => {
  try { const trustData = await trustManager.refreshTrustData(true); const checkResult = await recheckAllKeysInDb(trustData); res.json({ success: true, checkResult, systemStatus: getSystemStatus() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post("/api/admin/loot", async (req, res) => {
  try { const trustData = await trustManager.refreshTrustData(true); const lootResult = await fetchAndLootThirdPartySources(trustData); res.json({ success: true, lootResult, systemStatus: getSystemStatus() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.get("/admin", (req, res) => res.sendFile(join(process.cwd(), "public", "admin.html")));

/**
 * GET /api/status
 * Returns system status: strong / device / banned
 */
app.get("/api/status", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  const host = req.get("host") || "";
  let proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  if (host.includes("keybox.hzzmonet.io.vn")) {
    proto = "https";
  }
  const baseUrl = host ? `${proto}://${host}` : "https://keybox.hzzmonet.io.vn";
  const status = getSystemStatus(baseUrl);
  res.json(status);
});

/**
 * GET /api/update
 * Returns last updated timestamp and current status
 */
app.get("/api/update", (req, res) => {
  const status = getSystemStatus();
  res.json({
    last_updated: status.last_updated,
    status: status.status,
    total_valid: status.total_valid,
    last_looted_at: status.last_looted_at
  });
});

/**
 * POST /api/upload
 * Supports single file, multiple files, ZIP archives, raw XML/JSON, or URL link
 * Always fetches the latest Google Attestation status
 * Skips duplicates by DeviceID or Certificate Hash
 */
app.post("/api/upload", upload.any(), async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const results = [];
    const files = req.files || [];

    // Do not accept uploads when current revocation data cannot be verified.
    let trustData;
    try {
      trustData = await trustManager.refreshTrustData(false);
    } catch {
      return res.status(503).json({ success: false, error: "Không thể lấy dữ liệu xác thực mới nhất. Vui lòng thử lại sau." });
    }

    if (files.length > 0) {
      for (const file of files) {
        const isZip = isZipBuffer(file.buffer) || file.originalname.toLowerCase().endsWith(".zip");

        if (isZip) {
          try {
            const zip = new AdmZip(file.buffer);
            const zipEntries = zip.getEntries();

            for (const entry of zipEntries) {
              if (entry.isDirectory || entry.entryName.includes("__MACOSX")) continue;
              if (entry.entryName.toLowerCase().endsWith(".xml") || entry.entryName.toLowerCase().includes("keybox")) {
                const xmlText = decodeKeyboxBytes(entry.getData());
                const resItem = await processXmlString(xmlText, entry.entryName, clientIp, trustData);
                results.push(resItem);
              }
            }
          } catch (zipErr) {
            results.push({
              filename: file.originalname,
              success: false,
              skipped: false,
              error: `Failed to extract ZIP archive: ${zipErr.message}`
            });
          }
        } else {
          // Regular XML file
          const xmlText = decodeKeyboxBytes(file.buffer);
          const resItem = await processXmlString(xmlText, file.originalname, clientIp, trustData);
          results.push(resItem);
        }
      }
    } else {
      // Check if URL / link is provided
      let inputUrl = null;
      if (typeof req.body === "object" && req.body !== null) {
        if (typeof req.body.url === "string" && req.body.url.trim()) {
          inputUrl = req.body.url.trim();
        } else if (typeof req.body.link === "string" && req.body.link.trim()) {
          inputUrl = req.body.link.trim();
        }
      } else if (typeof req.body === "string") {
        const trimmed = req.body.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          inputUrl = trimmed;
        }
      }

      if (inputUrl) {
        try {
          const fetchRes = await fetch(inputUrl, {
            headers: { "User-Agent": "KeyBoxChecker/1.0", "Cache-Control": "no-cache" },
            signal: AbortSignal.timeout(15000),
          });
          if (!fetchRes.ok) {
            return res.status(400).json({
              success: false,
              error: `Không thể tải dữ liệu từ URL đã nhập (HTTP ${fetchRes.status})`
            });
          }
          const text = await fetchRes.text();
          const xml = normaliseKeyboxBody(text);
          if (!xml) {
            return res.status(400).json({
              success: false,
              error: "Nội dung tải về từ URL không phải là keybox XML hợp lệ (hoặc không giải mã được)."
            });
          }
          const resItem = await processXmlString(xml, inputUrl, clientIp, trustData);
          results.push(resItem);
        } catch (err) {
          return res.status(400).json({
            success: false,
            error: `Lỗi kết nối tới URL: ${err.message}`
          });
        }
      } else {
        // Body string or JSON
        let rawContent = "";
        if (typeof req.body === "string" && req.body.trim()) {
          rawContent = req.body.trim();
        } else if (req.body && typeof req.body.xml === "string") {
          rawContent = req.body.xml.trim();
        } else if (req.body && typeof req.body.content === "string") {
          rawContent = req.body.content.trim();
        }

        if (rawContent) {
          const resItem = await processXmlString(rawContent, "raw_input.xml", clientIp, trustData);
          results.push(resItem);
        }
      }
    }

    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng chọn file XML/ZIP, dán nội dung XML hoặc nhập đường dẫn link keybox."
      });
    }

    const totalProcessed = results.length;
    const skippedCount = results.filter(r => r.skipped).length;
    const newlyAddedCount = results.filter(r => r.success && !r.skipped).length;
    const validCount = results.filter(r => r.success && r.status !== "banned").length;
    const strongCount = results.filter(r => r.status === "strong").length;
    const deviceCount = results.filter(r => r.status === "device").length;
    const bannedCount = results.filter(r => r.status === "banned" || !r.success).length;

    // Single item response
    if (totalProcessed === 1) {
      const single = results[0];
      return res.status(single.success ? 200 : 422).json({
        success: single.success,
        skipped: single.skipped || false,
        upgraded: single.upgraded || false,
        id: single.id,
        status: single.status,
        deviceId: single.deviceId,
        algorithm: single.algorithm,
        isNew: single.isNew,
        reportCount: single.reportCount,
        analysis: single.analysis,
        message: single.message || (single.success ? "Keybox uploaded successfully" : single.error),
        total_processed: 1,
        newly_added: newlyAddedCount,
        rejected_count: bannedCount,
        valid_count: validCount,
        skipped_count: skippedCount,
        results
      });
    }

    // Batch response
    return res.status(validCount > 0 || skippedCount > 0 ? 200 : 422).json({
      success: validCount > 0 || skippedCount > 0,
      total_processed: totalProcessed,
      newly_added: newlyAddedCount,
      skipped_count: skippedCount,
      valid_count: validCount,
      strong_count: strongCount,
      device_count: deviceCount,
      banned_count: bannedCount,
      rejected_count: bannedCount,
      results,
      message: `Đã xử lý ${totalProcessed} keybox: ${newlyAddedCount} thêm mới (${strongCount} strong, ${deviceCount} device), ${skippedCount} bỏ qua trùng lặp, ${bannedCount} không hợp lệ/thu hồi.`
    });
  } catch (err) {
    console.error("[Upload Error]", err);
    return res.status(500).json({
      success: false,
      error: `Server error during upload: ${err.message}`
    });
  }
});

/**
 * GET /api/download
 * Downloads a random valid keybox XML file (PRIORITIZES 'strong' keys, fallback to 'device')
 */
app.get("/api/download", (req, res) => {
  const format = req.query.format || (req.headers.accept?.includes("application/json") ? "json" : "xml");
  const specificId = req.query.id ? parseInt(req.query.id, 10) : null;
  const profile = req.query.profile || req.query.type || (req.query.is_rkp === "1" ? "rkp" : (req.query.is_rkp === "0" ? "hw" : null));

  let keybox = null;
  if (specificId && !isNaN(specificId)) {
    keybox = getKeyboxById(specificId);
  } else if (profile) {
    keybox = getKeyboxByFilter(profile);
  } else {
    // Strictly prioritizes 'strong' keys, fallback to 'device'
    keybox = getRandomValidKeybox();
  }

  if (!keybox) {
    return res.status(404).json({
      error: "No valid keybox available",
      status: "banned",
      message: "All keyboxes are currently revoked or no keys have been uploaded yet."
    });
  }

  const watermarkedXml = applyKeyboxWatermark(keybox.xml_content, keybox);

  if (format === "json") {
    return res.json({
      id: keybox.id,
      status: keybox.status,
      deviceId: keybox.device_id,
      algorithm: keybox.algorithm,
      xml: watermarkedXml
    });
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="keybox.xml"');
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.send(watermarkedXml);
});

/**
 * POST /api/repair
 * Repairs and standardizes corrupted or non-standard keybox XML files
 * Accepts file upload, raw XML text, or JSON payload
 */
app.post("/api/repair", upload.single("file"), async (req, res) => {
  try {
    let rawContent = "";
    if (req.file?.buffer) {
      rawContent = req.file.buffer;
    } else if (typeof req.body === "string") {
      rawContent = req.body;
    } else if (req.body?.xml || req.body?.content || req.body?.keybox || req.body?.data || req.body?.text) {
      rawContent = req.body.xml || req.body.content || req.body.keybox || req.body.data || req.body.text;
    } else if (req.body && typeof req.body === "object") {
      rawContent = JSON.stringify(req.body);
    }

    if (!rawContent || (typeof rawContent === "string" && !rawContent.trim())) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng cung cấp nội dung keybox cần sửa lỗi (tải file lên hoặc dán XML text)."
      });
    }

    const trustData = trustManager.getTrustData();
    const result = await repairKeybox(rawContent, trustData);

    // If query ?download=true or ?format=xml, stream as XML file attachment
    const wantDownload = req.query.download === "true" || req.query.format === "xml";
    if (wantDownload) {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="keybox_repaired.xml"');
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.send(result.repairedXml);
    }

    return res.json({
      success: true,
      deviceId: result.deviceId,
      summary: result.summary,
      fixesApplied: result.fixesApplied,
      repairedXml: result.repairedXml,
      analysis: result.analysis ? {
        overall: result.analysis.overall,
        isSoftbanned: !!result.analysis.isSoftbanned,
        specter: result.analysis.specter || null,
        warnings: result.analysis.warnings || [],
        errors: result.analysis.errors || []
      } : null
    });
  } catch (err) {
    console.error("[Server] Repair failed:", err.message);
    return res.status(400).json({
      success: false,
      error: `Không thể sửa lỗi keybox: ${err.message}`
    });
  }
});

/**
 * POST /api/report
 * Reports a keybox as 'device' (Requires valid subscriber token)
 */
app.post("/api/report", (req, res) => {
  let token = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-access-token"]) {
    token = String(req.headers["x-access-token"]).trim();
  } else if (req.body?.token) {
    token = String(req.body.token).trim();
  } else if (req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: "Access token required for reporting keybox status" });
  }

  const subscriber = getNotificationSubscriber(token);
  const isAdmin = authorizeNotificationAdmin(token);
  if (!subscriber && !isAdmin) {
    return res.status(401).json({ success: false, error: "Invalid access token" });
  }

  const keyId = parseInt(req.body.id || req.body.key_id || req.query.id, 10);
  if (!keyId || isNaN(keyId)) {
    return res.status(400).json({ success: false, error: "Missing valid key 'id' in request body" });
  }

  const clientIp = getClientIp(req);
  const result = reportKeybox(keyId, clientIp);

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json({
    success: true,
    key_id: keyId,
    report_count: result.report_count,
    status: result.status,
    promoted_to_device: result.promoted_to_device,
    message: result.promoted_to_device
      ? "Keybox has received a report and has been changed to 'device' status."
      : `Report recorded. Current status: ${result.status}.`
  });
});

/**
 * GET /api/keys
 * Returns public metadata of all keys
 */
app.get("/api/keys", (req, res) => {
  const keys = getAllKeyboxesPublic();
  res.json({ keys });
});

/**
 * POST /api/check-now
 * Triggers full cycle with live Google attestation status & 3rd-party looting
 */
app.post("/api/check-now", (req, res) => res.status(410).json({ error: "Use authenticated /api/admin/check-now" }));

/**
 * POST /api/loot
 * Triggers 3rd-party source fetching & looting
 */
app.post("/api/loot", (req, res) => res.status(410).json({ error: "Use authenticated /api/admin/loot" }));

/**
 * GET /api/sources
 * Returns all configured 3rd-party sources
 */
app.get("/api/sources", (req, res) => {
  const sources = getAllSources();
  res.json({ sources });
});

/**
 * POST /api/sources
 * Adds a new custom 3rd-party source and immediately scans it
 */
app.post("/api/sources", (req, res) => {
  const { name, url, type } = req.body || {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || !isValidSourceUrl(url) || !["raw_url", "specter"].includes(type)) return res.status(400).json({ error: "Invalid source" });
  try { const result = addSource(name.trim(), type, url.trim()); res.status(201).json({ success: true, id: result.lastInsertRowid }); }
  catch (err) { res.status(400).json({ error: err.message.includes("UNIQUE") ? "Source URL already exists" : err.message }); }
});

/**
 * POST /api/telegram/webhook
 * Receives incoming updates if Telegram webhook is configured
 */
app.post("/api/telegram/webhook", async (req, res) => {
  const token = getTelegramBotToken();
  if (!token) {
    return res.status(503).json({ error: "Telegram bot not configured" });
  }
  res.status(200).json({ ok: true });
  try {
    await handleTelegramUpdate(token, req.body);
  } catch (err) {
    console.error("[TelegramBot] Error processing webhook update:", err);
  }
});

// ==========================================
// START SERVER
// ==========================================
async function main() {
  initDb();
  initNotificationSettings();
  const settings = initSiteSettings();
  configureIntervals(settings.intervals);
  await trustManager.init();
  startPeriodicCheck();
  startTelegramBot();

  process.on("SIGTERM", () => {
    stopTelegramBot();
  });
  process.on("SIGINT", () => {
    stopTelegramBot();
  });

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[Server] Keybox server listening on http://127.0.0.1:${PORT}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error("Fatal initialization error:", err);
    process.exit(1);
  });
}
