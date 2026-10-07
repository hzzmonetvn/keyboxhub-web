import { randomUUID } from "node:crypto";
import { getNotificationTargets } from "./notification-settings.js";

async function postNotification(channel, url, body, headers = {}) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: "error"
    });
    if (!response.ok) {
      console.warn(`[Notifications] ${channel} failed: HTTP ${response.status}`);
      return { channel, success: false, error: `HTTP ${response.status}` };
    }
    if (channel === "Telegram" && (await response.json()).ok !== true) {
      console.warn("[Notifications] Telegram rejected the message");
      return { channel, success: false, error: "Message rejected" };
    }
    return { channel, success: true };
  } catch {
    console.warn(`[Notifications] ${channel} delivery failed`);
    return { channel, success: false, error: "Delivery failed" };
  }
}

export async function notifyKeyboxEvent(event, keybox, previousStatus = null, systemStatus = {}) {
  const results = await Promise.all(getNotificationTargets().map(config =>
    sendKeyboxNotification(config, event, keybox, previousStatus, systemStatus)
  ));
  return results.flat();
}

export async function sendKeyboxNotification(config, event, keybox, previousStatus = null, systemStatus = {}) {
  const webhookUrl = config.webhook_enabled ? config.webhook_url : "";
  const botToken = config.telegram_enabled ? config.telegram_bot_token : "";
  const chatId = config.telegram_chat_id;
  if (!webhookUrl && !(botToken && chatId)) return [];

  const payload = {
    event_id: randomUUID(),
    event,
    occurred_at: new Date().toISOString(),
    previous_status: previousStatus,
    keybox: {
      id: keybox.id,
      device_id: keybox.device_id,
      algorithm: keybox.algorithm,
      status: keybox.status,
      is_softbanned: keybox.is_softbanned === 1,
      source: keybox.source || "user_upload",
      uploaded_at: keybox.uploaded_at,
      banned_at: keybox.banned_at
    },
    system_status: systemStatus
  };
  const deliveries = [];
  if (webhookUrl) {
    const headers = config.webhook_token
      ? { Authorization: `Bearer ${config.webhook_token}` }
      : {};
    deliveries.push(postNotification("Webhook", webhookUrl, payload, headers));
  }
  if (botToken && chatId) {
    const title = event === "keybox.test" ? "Thông báo thử"
      : event === "keybox.added" ? "Keybox mới được thêm"
      : event === "keybox.banned" ? "Keybox vừa bị ban" : "Keybox đổi trạng thái";
    const status = previousStatus ? `${previousStatus} → ${keybox.status}` : keybox.status;
    const text = [
      `Keybox Hub — ${title}`,
      `Key: #${keybox.id}`,
      `Device: ${String(keybox.device_id).slice(0, 1000)}`,
      `Trạng thái: ${status}${payload.keybox.is_softbanned ? " (Softban)" : ""}`,
      `Nguồn: ${String(payload.keybox.source).slice(0, 1000)}`,
      `Hiện có: ${systemStatus.strong_count} Strong / ${systemStatus.device_count} Device / ${systemStatus.banned_count} Banned`,
      `Thời gian: ${payload.occurred_at}`
    ].join("\n");
    deliveries.push(postNotification("Telegram", `https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text
    }));
  }
  return Promise.all(deliveries);
}
