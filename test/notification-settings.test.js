import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { initNotificationSettings } from "../src/notification-settings.js";
import { notificationRoutes } from "../src/notification-routes.js";

const originalCwd = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "keybox-settings-"));
const envNames = ["KEYBOX_ADMIN_PASSWORD", "KEYBOX_WEBHOOK_URL", "KEYBOX_WEBHOOK_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
const received = [];
const status = { strong_count: 1, device_count: 0, banned_count: 0 };
let server;
let baseUrl;
const loginAttempts = new Map();

before(async () => {
  mkdirSync(join(tempDir, "data"));
  process.chdir(tempDir);
  const app = express();
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/notifications/admin/login")) return next();
    const key = req.socket.remoteAddress;
    const now = Date.now();
    let item = loginAttempts.get(key);
    if (item && item.reset <= now) { loginAttempts.delete(key); item = null; }
    if (!item) {
      for (const [id, value] of loginAttempts) if (value.reset <= now) loginAttempts.delete(id);
      if (loginAttempts.size >= 10000) { res.setHeader("Retry-After", "1"); return res.status(503).json({ error: "Rate limiter capacity reached" }); }
      item = { count: 0, reset: now + 60_000 };
      loginAttempts.set(key, item);
    }
    if (item.count >= 20) { res.setHeader("Retry-After", "60"); return res.status(429).json({ error: "Too many requests" }); }
    item.count++;
    next();
  });
  app.use(express.json());
  app.use("/api/notifications", notificationRoutes(() => status));
  app.post("/receiver/:name", (req, res) => {
    received.push({ name: req.params.name, body: req.body, authorization: req.headers.authorization });
    res.sendStatus(req.params.name === "fail" ? 503 : 204);
  });
  server = await new Promise(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  for (const name of envNames) delete process.env[name];
  process.env.KEYBOX_ADMIN_PASSWORD = "test-admin-password";
  rmSync(join(tempDir, "data", "notification-settings.json"), { force: true });
  initNotificationSettings();
  loginAttempts.clear();
  received.length = 0;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

async function request(method, path = "", token = "", body) {
  const response = await originalFetch(`${baseUrl}/api/notifications${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}

async function login() {
  const result = await request("POST", "/admin/login", "", { password: "test-admin-password" });
  assert.equal(result.status, 200);
  return result.data.token;
}

async function issue(admin, name = "Recipient") {
  const result = await request("POST", "/admin/subscriptions", admin, { name });
  assert.equal(result.status, 201);
  return result.data;
}

function config(name, extra = {}) {
  return {
    webhook_enabled: true, webhook_url: `${baseUrl}/receiver/${name}`, webhook_token: "secret-webhook",
    telegram_enabled: false, telegram_bot_token: "", telegram_chat_id: "", ...extra
  };
}

test("subscriber settings GET, PUT and test endpoints are disabled", async () => {
  for (const [method, path] of [["GET", ""], ["PUT", ""], ["POST", "/test"]]) {
    const result = await request(method, path, "invalid-token", method === "GET" ? undefined : config("blocked"));
    assert.equal(result.status, 410);
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
  assert.equal(received.length, 0);
});

test("subscriber tokens cannot authenticate as admins; admin token issuance remains available", async () => {
  const admin = await login();
  const subscriber = await issue(admin);
  assert.equal((await request("GET", "/admin/subscriptions", subscriber.token)).status, 401);
  assert.equal((await request("GET", "/admin/subscriptions", "invalid-token")).status, 401);
  assert.equal(received.length, 0);
});

test("admin login hashes the password and issues tokens shown only at creation", async () => {
  assert.equal((await request("POST", "/admin/login", "", { password: "wrong-password" })).status, 401);
  const admin = await login();
  const subscriber = await issue(admin);
  const listed = await request("GET", "/admin/subscriptions", admin);
  assert.equal(listed.data.subscriptions.length, 1);
  assert.equal(listed.data.subscriptions[0].token, undefined);
  assert.equal(listed.data.subscriptions[0].token_hash, undefined);
  assert.equal((await request("GET", "", admin)).status, 410);
  assert.equal((await request("POST", "/admin/subscriptions", subscriber.token, { name: "Forbidden" })).status, 401);
  const path = join(tempDir, "data", "notification-settings.json");
  const stored = readFileSync(path, "utf8");
  assert.ok(!stored.includes("test-admin-password"));
  assert.ok(!stored.includes(subscriber.token));
  assert.ok(!stored.includes(admin));
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("environment notification configuration does not activate subscriber delivery", async () => {
  process.env.KEYBOX_WEBHOOK_URL = `${baseUrl}/receiver/environment`;
  process.env.KEYBOX_WEBHOOK_TOKEN = "environment-secret";
  process.env.TELEGRAM_BOT_TOKEN = "123456:environment_token";
  process.env.TELEGRAM_CHAT_ID = "-1001234567890";
  initNotificationSettings();

  const subscriber = await issue(await login());
  for (const [method, path] of [["GET", ""], ["PUT", ""], ["POST", "/test"]]) {
    assert.equal((await request(method, path, subscriber.token, method === "GET" ? undefined : config("blocked"))).status, 410);
  }
  assert.equal(received.length, 0);
});

test("notification router delegates login limits to the configured parent middleware", async () => {
  for (let i = 0; i < 20; i++) assert.equal((await request("POST", "/admin/login", "", { password: "wrong" })).status, 401);
  assert.equal((await request("POST", "/admin/login", "", { password: "wrong" })).status, 429);
});
