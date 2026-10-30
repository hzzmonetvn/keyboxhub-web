import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSystemStatus, getKeyboxByFilter, applyKeyboxWatermark } from "./db.js";

let pollingAbortController = null;
let isPollingRunning = false;

export function getTelegramBotToken() {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()) {
    return process.env.TELEGRAM_BOT_TOKEN.trim();
  }

  const settingsPath = join(process.cwd(), "data", "notification-settings.json");
  if (existsSync(settingsPath)) {
    try {
      const data = JSON.parse(readFileSync(settingsPath, "utf8"));
      if (Array.isArray(data.subscribers)) {
        for (const sub of data.subscribers) {
          if (sub.telegram_bot_token && typeof sub.telegram_bot_token === "string" && sub.telegram_bot_token.trim()) {
            return sub.telegram_bot_token.trim();
          }
        }
      }
    } catch (err) {
      console.warn("[TelegramBot] Error reading notification-settings.json:", err.message);
    }
  }

  return null;
}

export function htmlEscape(str) {
  if (typeof str !== "string") return String(str ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildHelpText() {
  return [
    `🤖 <b>Keybox Hub Bot — Hướng dẫn sử dụng</b>`,
    ``,
    `Bot cung cấp dịch vụ tra cứu và tải keybox dự phòng khi web gặp sự cố:`,
    ``,
    `• <code>/status</code> - Xem trạng thái hệ thống và số lượng keybox`,
    `• <code>/list</code> - Danh sách các keybox đang hoạt động`,
    `• <code>/keybox</code> (hoặc <code>/keybox none</code>) - Tải ngẫu nhiên 1 keybox tốt nhất`,
    `• <code>/keybox rkp</code> - Tải keybox chuẩn RKP (Google ECDSA Root)`,
    `• <code>/keybox hw</code> - Tải keybox chuẩn Strong Integrity (Hardware)`,
    `• <code>/keybox device</code> - Tải keybox chuẩn Device Integrity`,
    `• <code>/keybox &lt;id&gt;</code> - Tải keybox theo ID cụ thể (ví dụ: <code>/keybox 80</code>)`,
    `• <code>/help</code> - Hiển thị hướng dẫn này`
  ].join("\n");
}

export function buildStatusText(status) {
  const statusBadge = (status.status || "UNKNOWN").toUpperCase();
  const lastUpdated = status.last_updated
    ? new Date(status.last_updated).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "N/A";

  return [
    `📊 <b>Keybox Hub — Trạng thái hệ thống</b>`,
    ``,
    `• Đánh giá chung: <b>${statusBadge}</b>`,
    `• Tổng keybox khả dụng: <b>${status.total_valid || 0}</b> / ${status.total_keys || 0}`,
    `  ├─ Strong: <b>${status.strong_count || 0}</b>`,
    `  ├─ Device: <b>${status.device_count || 0}</b>`,
    `  ├─ Softbanned: <b>${status.softbanned_count || 0}</b>`,
    `  └─ Revoked / Ban: <b>${status.banned_count || 0}</b>`,
    `• Cập nhật lần cuối: <code>${htmlEscape(lastUpdated)}</code>`,
    ``,
    `💡 <i>Gõ /list để xem danh sách hoặc /keybox để tải.</i>`
  ].join("\n");
}

export function buildListText(keyboxes) {
  if (!keyboxes || keyboxes.length === 0) {
    return "⚠️ <i>Hiện không có keybox nào khả dụng trên hệ thống.</i>";
  }

  const lines = [
    `📋 <b>Danh sách Keybox khả dụng (${keyboxes.length}):</b>`,
    ``
  ];

  for (const kb of keyboxes) {
    const typeTag = kb.is_rkp ? "RKP" : "HW";
    const statusTag = (kb.status || "UNKNOWN").toUpperCase();
    const deviceName = kb.device_id || kb.name || "Unknown Device";
    lines.push(`• <b>#${kb.id}</b> | <b>${statusTag}</b> [${typeTag}]`);
    lines.push(`  ├ Thiết bị: <code>${htmlEscape(deviceName)}</code>`);
    lines.push(`  └ Lệnh tải: <code>/keybox ${kb.id}</code>`);
  }

  lines.push(``);
  lines.push(`💡 <i>Lệnh tắt: /keybox rkp, /keybox hw, /keybox device, /keybox none</i>`);
  return lines.join("\n");
}

export function buildCaption(keybox) {
  const statusUpper = (keybox.status || "VALID").toUpperCase();
  const typeTag = keybox.is_rkp ? "RKP" : "HW";
  const device = keybox.device_id || "Unknown Device";
  const alg = keybox.algorithm || "N/A";
  const source = keybox.source || "user_upload";

  return [
    `🔑 <b>Keybox #${keybox.id}</b>`,
    `• Trạng thái: <b>${statusUpper}</b> [${typeTag}]`,
    `• Thiết bị: <code>${htmlEscape(device)}</code>`,
    `• Thuật toán: <code>${htmlEscape(alg)}</code>`,
    `• Nguồn: <i>${htmlEscape(source)}</i>`,
    ``,
    `🛡️ <i>Đã đóng dấu xác thực Keybox Hub</i>`
  ].join("\n");
}

export async function sendMessage(token, chatId, text, options = {}) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || "HTML",
    disable_web_page_preview: true
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[TelegramBot] sendMessage failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function sendDocument(token, chatId, filename, content, caption = "") {
  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const form = new FormData();
  form.append("chat_id", String(chatId));

  const blob = new Blob([content], { type: "application/xml" });
  form.append("document", blob, filename);

  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[TelegramBot] sendDocument failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function deleteWebhook(token, dropPendingUpdates = true) {
  const url = `https://api.telegram.org/bot${token}/deleteWebhook`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: dropPendingUpdates }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[TelegramBot] deleteWebhook failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function handleTelegramUpdate(token, update) {
  if (!update || typeof update !== "object") return;
  const msg = update.message;
  if (!msg || !msg.text || !msg.chat?.id) return;

  const rawText = msg.text.trim();
  if (!rawText.startsWith("/")) return;

  const match = rawText.match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s+(.*))?$/);
  if (!match) return;

  const command = match[1].toLowerCase();
  const rawArg = (match[2] || "").trim();
  const chatId = msg.chat.id;

  try {
    switch (command) {
      case "start":
      case "help": {
        await sendMessage(token, chatId, buildHelpText());
        break;
      }
      case "status": {
        const status = getSystemStatus();
        await sendMessage(token, chatId, buildStatusText(status));
        break;
      }
      case "list": {
        const status = getSystemStatus();
        await sendMessage(token, chatId, buildListText(status.keyboxes || []));
        break;
      }
      case "keybox": {
        const criteria = rawArg || "none";
        const keybox = getKeyboxByFilter(criteria);

        if (!keybox) {
          const notFoundText = [
            `❌ <b>Không tìm thấy keybox phù hợp</b>`,
            ``,
            `Không có keybox khả dụng cho tiêu chí: <code>${htmlEscape(criteria)}</code>.`,
            `Vui lòng gõ <code>/list</code> để xem danh sách keybox hiện có.`
          ].join("\n");
          await sendMessage(token, chatId, notFoundText);
          break;
        }

        const watermarkedXml = applyKeyboxWatermark(keybox.xml_content, keybox);
        const caption = buildCaption(keybox);
        await sendDocument(token, chatId, "keybox.xml", watermarkedXml, caption);
        break;
      }
      default: {
        // In private chat, give guidance; in groups, stay silent on unknown commands
        if (msg.chat.type === "private") {
          await sendMessage(token, chatId, "Lệnh không hợp lệ. Gõ <code>/help</code> để xem danh sách lệnh được hỗ trợ.");
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[TelegramBot] Error handling command /${command}:`, err);
  }
}

async function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    }
  });
}

async function runPollingLoop(token, signal) {
  let offset = 0;
  console.log("[TelegramBot] Initializing Telegram bot long polling...");

  // Drop pending updates on startup to prevent flooding from stale backlogs
  await deleteWebhook(token, true);

  while (!signal.aborted) {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=20&allowed_updates=["message"]`;
      const res = await fetch(url, { signal, signalTimeout: 30000 });

      if (!res.ok) {
        if (res.status === 409) {
          console.warn("[TelegramBot] Conflict detected (409), resetting webhook...");
          await deleteWebhook(token, false);
        }
        await sleep(3000, signal);
        continue;
      }

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result)) {
        await sleep(2000, signal);
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(token, update);
      }
    } catch (err) {
      if (signal.aborted) break;
      // Network timeout / connection error - wait and retry
      await sleep(3000, signal);
    }
  }

  console.log("[TelegramBot] Telegram bot polling stopped.");
}

export function startTelegramBot() {
  const token = getTelegramBotToken();
  if (!token) {
    console.log("[TelegramBot] No Telegram bot token configured; bot polling not started.");
    return null;
  }

  if (isPollingRunning) {
    console.log("[TelegramBot] Bot polling is already active.");
    return pollingAbortController;
  }

  pollingAbortController = new AbortController();
  isPollingRunning = true;

  // Run in background without blocking server initialization
  runPollingLoop(token, pollingAbortController.signal).finally(() => {
    isPollingRunning = false;
  });

  return pollingAbortController;
}

export function stopTelegramBot() {
  if (pollingAbortController && isPollingRunning) {
    pollingAbortController.abort();
    isPollingRunning = false;
  }
}
