import express from "express";
import cors from "cors";
import multer from "multer";
import AdmZip from "adm-zip";
import { join } from "node:path";
import { 
  initDb, 
  addKeyboxSkipDuplicate, 
  getRandomValidKeybox, 
  getKeyboxById, 
  getAllKeyboxesPublic, 
  reportKeybox, 
  getSystemStatus, 
  touchLastUpdated, 
  recheckAllKeysInDb,
  cleanupOldBannedKeys,
  getAllSources,
  addSource,
  toggleSource,
  applyKeyboxWatermark
} from "./db.js";
import { trustManager } from "./trust-manager.js";
import { analyzeKeybox, decodeKeyboxBytes, parseKeyboxXml } from "./analyzer.js";
import { repairKeybox } from "./repairer.js";
import { startPeriodicCheck, runFullHourlyCycle } from "./cron.js";
import { fetchAndLootThirdPartySources, normaliseKeyboxBody } from "./source-fetcher.js";

const PORT = process.env.PORT || 8098;
const app = express();

// Configure storage for file uploads (accepts multiple files up to 20MB total)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 100 }
});

// Middleware
app.use(cors());
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

// Helper to get client IP
function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
}

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

    if (dbResult.skipped) {
      return {
        filename,
        success: true,
        skipped: true,
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
      success: isPass,
      skipped: false,
      id: dbResult.id,
      status: dbResult.status,
      deviceId: dbResult.deviceId,
      algorithm: dbResult.algorithm,
      isNew: true,
      reportCount: dbResult.reportCount,
      analysis: {
        overall: analysis.overall,
        warnings: analysis.warnings || [],
        errors: analysis.errors || []
      },
      message: isPass 
        ? "Keybox hợp lệ và đã được thêm vào hệ thống!"
        : "Keybox chứa chứng chỉ đã bị Google thu hồi hoặc bị lỗi chuỗi (đã đánh dấu banned)."
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

/**
 * GET /api/status
 * Returns system status: strong / device / banned
 */
app.get("/api/status", (req, res) => {
  const status = getSystemStatus();
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

    // Ensure we are using the absolute freshest Google trust data
    const trustData = await trustManager.refreshTrustData(false);

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
        id: single.id,
        status: single.status,
        deviceId: single.deviceId,
        algorithm: single.algorithm,
        isNew: single.isNew,
        reportCount: single.reportCount,
        analysis: single.analysis,
        message: single.message || (single.success ? "Keybox uploaded successfully" : single.error),
        total_processed: 1,
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

  let keybox = null;
  if (specificId && !isNaN(specificId)) {
    keybox = getKeyboxById(specificId);
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
 * Reports a keybox as 'device'
 */
app.post("/api/report", (req, res) => {
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
      ? "Keybox has received more than 5 reports and has been changed to 'device' status."
      : `Report recorded. Current reports: ${result.report_count}/5 for device status transition.`
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
app.post("/api/check-now", async (req, res) => {
  try {
    const trustData = await trustManager.refreshTrustData(true);
    const checkResult = await recheckAllKeysInDb(trustData);
    const lootResult = await fetchAndLootThirdPartySources(trustData);
    const systemStatus = getSystemStatus();

    res.json({
      success: true,
      checkResult,
      lootResult,
      systemStatus,
      message: `Đã kiểm tra lại với Google & Loot nguồn thứ 3: ${checkResult.updatedCount} key được đánh giá, ${lootResult.looted_count} key mới được loot (${lootResult.looted_strong_count || 0} Strong, ${lootResult.looted_device_count || 0} Device), ${lootResult.skipped_duplicate_count} trùng lặp đã bỏ qua.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/loot
 * Triggers 3rd-party source fetching & looting
 */
app.post("/api/loot", async (req, res) => {
  try {
    const trustData = await trustManager.refreshTrustData(true);
    const lootResult = await fetchAndLootThirdPartySources(trustData);
    const systemStatus = getSystemStatus();

    res.json({
      success: true,
      lootResult,
      systemStatus,
      message: `Hoàn thành loot từ nguồn thứ 3: Looted ${lootResult.looted_count} key mới (${lootResult.looted_strong_count || 0} Strong, ${lootResult.looted_device_count || 0} Device), bỏ qua ${lootResult.skipped_duplicate_count} key trùng lặp.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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
app.post("/api/sources", async (req, res) => {
  let { name, type, url } = req.body || {};
  if (!url || typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ success: false, error: "Vui lòng nhập đường dẫn URL nguồn hợp lệ." });
  }
  url = url.trim();
  if (!name || typeof name !== "string" || !name.trim()) {
    try {
      const u = new URL(url);
      name = u.hostname + (u.pathname.length > 1 ? u.pathname : "");
    } catch {
      name = "Nguồn tùy chỉnh";
    }
  } else {
    name = name.trim();
  }
  try {
    addSource(name, (type || "raw_url").trim(), url);
    // Trigger immediate loot with the new source
    const trustData = await trustManager.refreshTrustData(true);
    const lootResult = await fetchAndLootThirdPartySources(trustData);
    res.json({ 
      success: true, 
      message: `Đã thêm nguồn "${name}" và quét thành công!`,
      lootResult 
    });
  } catch (err) {
    res.status(400).json({ 
      success: false, 
      error: err.message.includes("UNIQUE") ? "Nguồn URL này đã tồn tại trong danh sách." : err.message 
    });
  }
});

/**
 * POST /api/sources/:id/toggle
 * Enables or disables a 3rd-party source
 */
app.post("/api/sources/:id/toggle", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { enabled } = req.body;
  try {
    toggleSource(id, enabled !== false);
    res.json({ success: true, message: "Source updated" });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// START SERVER
// ==========================================
async function main() {
  initDb();
  await trustManager.init();
  startPeriodicCheck();

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[Server] Keybox server listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch(err => {
  console.error("Fatal initialization error:", err);
  process.exit(1);
});
