import { randomUUID } from "node:crypto";

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
      return;
    }
    if (channel === "Telegram" && (await response.json()).ok !== true) {
      console.warn("[Notifications] Telegram rejected the message");
    }
  } catch {
    console.warn(`[Notifications] ${channel} delivery failed`);
  }
}

export async function notifyKeyboxEvent(event, keybox, previousStatus = null, systemStatus = {}) {
  const webhookUrl = process.env.KEYBOX_WEBHOOK_URL;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!webhookUrl && !(botToken && chatId)) return;

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
    const headers = process.env.KEYBOX_WEBHOOK_TOKEN
      ? { Authorization: `Bearer ${process.env.KEYBOX_WEBHOOK_TOKEN}` }
      : {};
    deliveries.push(postNotification("Webhook", webhookUrl, payload, headers));
  }
  if (botToken && chatId) {
    const title = event === "keybox.added" ? "Keybox mới được thêm"
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
  await Promise.all(deliveries);
}
