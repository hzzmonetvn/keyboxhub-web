import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from "node:crypto";

let store = { subscribers: [] };
let settingsPath;
let adminSession = null;

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function persist(next) {
  const tempPath = `${settingsPath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(next, null, 2), { mode: 0o600 });
  chmodSync(tempPath, 0o600);
  renameSync(tempPath, settingsPath);
  store = next;
}

export function initNotificationSettings() {
  settingsPath = join(process.cwd(), "data", "notification-settings.json");
  store = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : { subscribers: [] };
  adminSession = null;
  if (process.env.KEYBOX_ADMIN_PASSWORD && !store.admin_password_hash) {
    setNotificationAdminPassword(process.env.KEYBOX_ADMIN_PASSWORD);
  } else {
    persist(store);
  }
}

export function setNotificationAdminPassword(password) {
  const salt = randomBytes(16).toString("hex");
  persist({ ...store, admin_password_salt: salt, admin_password_hash: scryptSync(password, salt, 64).toString("hex") });
  adminSession = null;
}

export function loginNotificationAdmin(password) {
  if (typeof password !== "string" || password.length > 256 || !store.admin_password_hash) return null;
  const actual = scryptSync(password, store.admin_password_salt, 64);
  if (!timingSafeEqual(actual, Buffer.from(store.admin_password_hash, "hex"))) return null;
  const token = randomBytes(32).toString("hex");
  adminSession = { hash: tokenHash(token), expires: Date.now() + 8 * 60 * 60 * 1000 };
  return token;
}

export function authorizeNotificationAdmin(token) {
  return !!adminSession && adminSession.expires > Date.now() && adminSession.hash === tokenHash(token);
}

export function logoutNotificationAdmin() {
  adminSession = null;
}

export function getNotificationSubscriber(token) {
  return store.subscribers.find(subscriber => subscriber.token_hash === tokenHash(token));
}

export function publicNotificationSettings(config) {
  return {
    id: config.id,
    name: config.name,
    webhook_enabled: config.webhook_enabled,
    webhook_url: config.webhook_url,
    webhook_token_set: !!config.webhook_token,
    telegram_enabled: config.telegram_enabled,
    telegram_bot_token_set: !!config.telegram_bot_token,
    telegram_chat_id: config.telegram_chat_id
  };
}

export function listNotificationSubscribers() {
  return store.subscribers.map(publicNotificationSettings);
}

export function createNotificationSubscriber(name) {
  if (typeof name !== "string" || !name.trim() || name.length > 100) throw new Error("Name is required (maximum 100 characters)");
  const token = randomBytes(32).toString("hex");
  const subscriber = {
    id: randomUUID(), name: name.trim(), token_hash: tokenHash(token),
    webhook_enabled: false, webhook_url: "", webhook_token: "",
    telegram_enabled: false, telegram_bot_token: "", telegram_chat_id: ""
  };
  persist({ ...store, subscribers: [...store.subscribers, subscriber] });
  return { ...publicNotificationSettings(subscriber), token };
}

export function deleteNotificationSubscriber(id) {
  const subscribers = store.subscribers.filter(subscriber => subscriber.id !== id);
  if (subscribers.length === store.subscribers.length) return false;
  persist({ ...store, subscribers });
  return true;
}

export function saveNotificationSettings(subscriber, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid settings");
  const next = { ...subscriber };
  for (const name of ["webhook_enabled", "telegram_enabled"]) {
    if (typeof input[name] !== "boolean") throw new Error(`Invalid ${name}`);
    next[name] = input[name];
  }
  for (const name of ["webhook_url", "webhook_token", "telegram_bot_token", "telegram_chat_id"]) {
    if (typeof input[name] !== "string" || input[name].length > 2048) throw new Error(`Invalid ${name}`);
    const value = input[name].trim();
    if ((name === "webhook_token" || name === "telegram_bot_token") && !value) continue;
    next[name] = value;
  }
  if (next.webhook_url) {
    let url;
    try { url = new URL(next.webhook_url); } catch { throw new Error("Invalid webhook URL"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid webhook URL");
  }
  if (next.webhook_enabled && !next.webhook_url) throw new Error("Webhook URL is required");
  if (next.telegram_bot_token && !/^\d+:[A-Za-z0-9_-]+$/.test(next.telegram_bot_token)) throw new Error("Invalid Telegram bot token");
  if (next.telegram_enabled && (!next.telegram_bot_token || !next.telegram_chat_id)) throw new Error("Telegram bot token and chat ID are required");
  if (next.telegram_chat_id && !/^(?:-?\d+|@[A-Za-z0-9_]+)$/.test(next.telegram_chat_id)) throw new Error("Invalid Telegram chat ID");
  if (/[\r\n]/.test(next.webhook_token)) throw new Error("Invalid webhook token");
  persist({ ...store, subscribers: store.subscribers.map(item => item.id === next.id ? next : item) });
  return publicNotificationSettings(next);
}

export function getNotificationTargets() {
  const targets = [...store.subscribers];
  if (process.env.KEYBOX_WEBHOOK_URL || (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)) {
    targets.push({
      webhook_enabled: !!process.env.KEYBOX_WEBHOOK_URL,
      webhook_url: process.env.KEYBOX_WEBHOOK_URL || "",
      webhook_token: process.env.KEYBOX_WEBHOOK_TOKEN || "",
      telegram_enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || "",
      telegram_chat_id: process.env.TELEGRAM_CHAT_ID || ""
    });
  }
  return targets;
}
