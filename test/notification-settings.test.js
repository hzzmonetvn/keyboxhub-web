import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { initNotificationSettings, getNotificationSubscriber } from "../src/notification-settings.js";
import { notificationRoutes } from "../src/notification-routes.js";
import { notifyKeyboxEvent } from "../src/notifications.js";

const originalCwd = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "keybox-settings-"));
const envNames = ["KEYBOX_ADMIN_PASSWORD", "KEYBOX_WEBHOOK_URL", "KEYBOX_WEBHOOK_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
const received = [];
const status = { strong_count: 1, device_count: 0, banned_count: 0 };
let server;
let baseUrl;

before(async () => {
  mkdirSync(join(tempDir, "data"));
  process.chdir(tempDir);
  const app = express();
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

test("anonymous and invalid tokens cannot read, change, test or issue settings", async () => {
  for (const [method, path] of [["GET", ""], ["PUT", ""], ["POST", "/test"], ["GET", "/admin/subscriptions"], ["POST", "/admin/subscriptions"]]) {
    const result = await request(method, path, "invalid-token", method === "GET" ? undefined : config("blocked"));
    assert.equal(result.status, 401);
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
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
  assert.equal((await request("GET", "", admin)).status, 401);
  assert.equal((await request("POST", "/admin/subscriptions", subscriber.token, { name: "Forbidden" })).status, 401);
  const path = join(tempDir, "data", "notification-settings.json");
  const stored = readFileSync(path, "utf8");
  assert.ok(!stored.includes("test-admin-password"));
  assert.ok(!stored.includes(subscriber.token));
  assert.ok(!stored.includes(admin));
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("subscriber settings are isolated, hide secrets and preserve blank token fields", async () => {
  const admin = await login();
  const alice = await issue(admin, "Alice");
  const bob = await issue(admin, "Bob");
  const saved = await request("PUT", "", alice.token, config("alice", {
    id: bob.id, name: "Impersonation", telegram_enabled: true,
    telegram_bot_token: "123456:test_bot_token", telegram_chat_id: "-1001234567890"
  }));
  assert.equal(saved.status, 200);
  assert.equal(saved.data.name, "Alice");
  assert.equal(saved.data.id, alice.id);
  assert.equal(saved.data.webhook_token_set, true);
  assert.equal(saved.data.telegram_bot_token_set, true);
  assert.ok(!JSON.stringify(saved.data).includes("test_bot_token"));
  assert.ok(!JSON.stringify(saved.data).includes("secret-webhook"));
  assert.equal((await request("GET", "", bob.token)).data.webhook_enabled, false);
  const updated = await request("PUT", "", alice.token, config("alice", {
    webhook_token: "", telegram_enabled: true, telegram_bot_token: "", telegram_chat_id: "@test_channel"
  }));
  assert.equal(updated.status, 200);
  assert.equal(getNotificationSubscriber(alice.token).telegram_bot_token, "123456:test_bot_token");
  assert.equal(getNotificationSubscriber(alice.token).webhook_token, "secret-webhook");
});

test("invalid URLs, incomplete Telegram credentials and non-boolean flags are rejected", async () => {
  const subscriber = await issue(await login());
  for (const body of [
    config("invalid", { webhook_url: "file:///etc/passwd" }),
    config("invalid", { webhook_url: "https://user:password@example.com" }),
    config("invalid", { webhook_enabled: "true" }),
    config("invalid", { webhook_url: "" }),
    config("invalid", { telegram_enabled: true }),
    config("invalid", { telegram_bot_token: "not-a-bot-token" }),
    config("invalid", { telegram_chat_id: "bad chat id" }),
    config("invalid", { webhook_token: "token\r\nHeader: value" })
  ]) {
    assert.equal((await request("PUT", "", subscriber.token, body)).status, 400);
  }
  assert.equal((await request("GET", "", subscriber.token)).data.webhook_enabled, false);
});

test("test sends only to the caller; real events fan out and revoked tokens stop receiving", async () => {
  const admin = await login();
  const alice = await issue(admin, "Alice");
  const bob = await issue(admin, "Bob");
  await request("PUT", "", alice.token, config("alice"));
  await request("PUT", "", bob.token, config("bob"));
  const result = await request("POST", "/test", alice.token);
  assert.equal(result.data.success, true);
  assert.deepEqual(received.map(item => item.name), ["alice"]);
  assert.equal(received[0].body.event, "keybox.test");
  assert.equal(received[0].authorization, "Bearer secret-webhook");
  received.length = 0;
  await notifyKeyboxEvent("keybox.added", { id: 1, device_id: "Device", status: "strong" }, null, status);
  assert.deepEqual(received.map(item => item.name).sort(), ["alice", "bob"]);
  assert.equal((await request("DELETE", `/admin/subscriptions/${alice.id}`, admin)).status, 200);
  assert.equal((await request("GET", "", alice.token)).status, 401);
  received.length = 0;
  await notifyKeyboxEvent("keybox.banned", { id: 1, status: "banned" }, "strong", status);
  assert.deepEqual(received.map(item => item.name), ["bob"]);
});

test("Telegram test uses the subscriber bot and reports delivery failures", async t => {
  const subscriber = await issue(await login());
  await request("PUT", "", subscriber.token, config("fail", {
    telegram_enabled: true, telegram_bot_token: "123456:test_bot_token", telegram_chat_id: "-1001234567890"
  }));
  const messages = [];
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.startsWith("https://api.telegram.org/")) {
      messages.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return originalFetch(url, options);
  });
  const result = await request("POST", "/test", subscriber.token);
  assert.equal(result.data.success, false);
  assert.deepEqual(result.data.results, [
    { channel: "Webhook", success: false, error: "HTTP 503" },
    { channel: "Telegram", success: true }
  ]);
  assert.equal(messages[0].url, "https://api.telegram.org/bot123456:test_bot_token/sendMessage");
  assert.equal(messages[0].body.chat_id, "-1001234567890");
  assert.match(messages[0].body.text, /Thông báo thử/);
});

test("settings and access tokens survive restart while admin sessions expire", async () => {
  const admin = await login();
  const subscriber = await issue(admin);
  await request("PUT", "", subscriber.token, config("persisted"));
  initNotificationSettings();
  assert.equal((await request("GET", "", subscriber.token)).data.webhook_url, `${baseUrl}/receiver/persisted`);
  assert.equal((await request("GET", "/admin/subscriptions", admin)).status, 401);
  const newAdmin = await login();
  assert.equal((await request("POST", "/admin/logout", newAdmin)).status, 200);
  assert.equal((await request("GET", "/admin/subscriptions", newAdmin)).status, 401);
});

test("disabled channels send no test or real notification", async () => {
  const subscriber = await issue(await login());
  const result = await request("POST", "/test", subscriber.token);
  assert.equal(result.data.success, false);
  assert.deepEqual(result.data.results, []);
  await notifyKeyboxEvent("keybox.added", { id: 1, status: "strong" }, null, status);
  assert.equal(received.length, 0);
});

test("admin login rate limits repeated wrong passwords", async () => {
  for (let i = 0; i < 5; i++) {
    assert.equal((await request("POST", "/admin/login", "", { password: "wrong" })).status, 401);
  }
  assert.equal((await request("POST", "/admin/login", "", { password: "wrong" })).status, 429);
});
