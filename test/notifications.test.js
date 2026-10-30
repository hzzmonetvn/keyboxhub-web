import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { setImmediate as nextTick } from "node:timers/promises";
import { notifyKeyboxEvent } from "../src/notifications.js";
import { analyzeKeybox } from "../src/analyzer.js";

const originalCwd = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "keybox-notifications-"));
const envNames = ["KEYBOX_WEBHOOK_URL", "KEYBOX_WEBHOOK_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
import { initNotificationSettings, saveGlobalNotificationSettings } from "../src/notification-settings.js";
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
let trustData;
let database;
let db;
let xml;
let analysis;

before(async () => {
  mkdirSync(join(tempDir, "data"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-set_serial", "123456789", "-subj", "/CN=Notification Test",
    "-keyout", join(tempDir, "key.pem"), "-out", join(tempDir, "cert.pem")
  ], { stdio: "ignore" });
  xml = `<AndroidAttestation><NumberOfKeyboxes>1</NumberOfKeyboxes>
    <Keybox DeviceID="notification-test"><Key algorithm="rsa">
    <PrivateKey format="pem">${readFileSync(join(tempDir, "key.pem"), "utf8")}</PrivateKey>
    <CertificateChain><NumberOfCertificates>1</NumberOfCertificates>
    <Certificate format="pem">${readFileSync(join(tempDir, "cert.pem"), "utf8")}</Certificate>
    </CertificateChain></Key></Keybox></AndroidAttestation>`;
  trustData = { roots: [{ id: "test_root", label: "Test root", kind: "google_hardware", level: "trusted", pem: readFileSync(join(tempDir, "cert.pem"), "utf8") }], status: { entries: {} } };
  analysis = await analyzeKeybox(xml, trustData);
  assert.equal(analysis.overall, "pass");
  process.chdir(tempDir);
  initNotificationSettings();
  database = await import("../src/db.js");
  db = database.initDb();
});

beforeEach(() => {
  for (const name of envNames) delete process.env[name];
  db.prepare("DELETE FROM reports").run();
  db.prepare("DELETE FROM keyboxes").run();
});

after(() => {
  db?.close();
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

function configureGlobalWebhook(url = "https://example.test/events", token = "") {
  saveGlobalNotificationSettings({
    webhook_enabled: true, webhook_url: url, webhook_token: token,
    telegram_enabled: false, telegram_bot_token: "", telegram_chat_id: ""
  });
}

function configureGlobalTelegram(token = "test-token", chatId = "123") {
  saveGlobalNotificationSettings({
    webhook_enabled: false, webhook_url: "", webhook_token: "",
    telegram_enabled: true, telegram_bot_token: token, telegram_chat_id: chatId
  });
}

function captureRequests(t) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  });
  return requests;
}

test("disabled or incomplete configuration sends nothing", async t => {
  const requests = captureRequests(t);
  await notifyKeyboxEvent("keybox.added", {});
  saveGlobalNotificationSettings({ webhook_enabled: false, webhook_url: "", webhook_token: "", telegram_enabled: false, telegram_bot_token: "", telegram_chat_id: "" });
  await notifyKeyboxEvent("keybox.added", {});
  assert.equal(requests.length, 0);
});

test("new upload/source keys notify once; duplicates and unchanged rechecks stay silent", async t => {
  configureGlobalWebhook("https://example.test/events", "test-secret");
  const requests = captureRequests(t);
  const added = database.addKeyboxSkipDuplicate(xml, analysis, "private-ip", "test-source");
  const duplicate = database.addKeyboxSkipDuplicate(xml, analysis);
  await database.recheckAllKeysInDb(trustData);
  await nextTick();
  assert.equal(duplicate.skipped, true);
  assert.equal(requests.length, 1);
  const { body, options } = requests[0];
  assert.equal(body.event, "keybox.added");
  assert.equal(body.previous_status, null);
  assert.equal(body.keybox.id, added.id);
  assert.equal(body.keybox.source, "test-source");
  assert.equal(body.system_status.strong_count, 1);
  assert.equal(body.system_status.total_keys, 1);
  assert.match(body.event_id, /^[a-f0-9-]{36}$/);
  assert.equal(options.headers.Authorization, "Bearer test-secret");
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(body.keybox.xml_content, undefined);
  assert.equal(body.keybox.created_ip, undefined);
  assert.ok(!JSON.stringify(body).includes("PRIVATE KEY"));
  assert.ok(!JSON.stringify(body).includes("private-ip"));
});

test("new banned key is rejected without upload notification", async t => {
  configureGlobalWebhook();
  const requests = captureRequests(t);
  const revokedTrust = { ...trustData, status: { entries: { "123456789": { status: "REVOKED" } } } };
  const revokedAnalysis = await analyzeKeybox(xml, revokedTrust);
  const result = database.addKeyboxSkipDuplicate(xml, revokedAnalysis);
  assert.equal(result.isBanned, true);
  assert.equal(result.id, null);
  await database.recheckAllKeysInDb(revokedTrust);
  await nextTick();
  assert.equal(requests.length, 0);
});

test("revocation notifies once and deletes keybox immediately", async t => {
  configureGlobalWebhook();
  const requests = captureRequests(t);
  database.addKeyboxSkipDuplicate(xml, analysis);
  const revokedTrust = { ...trustData, status: { entries: { "123456789": { status: "REVOKED" } } } };
  await database.recheckAllKeysInDb(revokedTrust);
  await database.recheckAllKeysInDb(revokedTrust);
  await nextTick();
  assert.deepEqual(requests.map(r => r.body.event), ["keybox.added", "keybox.banned"]);
  assert.equal(requests[1].body.previous_status, "strong");
  assert.equal(requests[1].body.keybox.status, "banned");
  assert.equal(requests[1].body.system_status.total_keys, 0);
  assert.equal(database.getAllKeyboxesPublic().length, 0);
});

test("report threshold and softban flag changes notify without repeating", async t => {
  configureGlobalWebhook();
  const requests = captureRequests(t);
  const added = database.addKeyboxSkipDuplicate(xml, analysis);
  for (let i = 0; i < 7; i++) database.reportKeybox(added.id, "127.0.0.1");
  const softbanTrust = {
    ...trustData,
    checkSpecterStatus: () => ({ isSoftbanned: true, isRevoked: false, entry: { serial: "123456789", source: "test", version: "1" } })
  };
  await database.recheckAllKeysInDb(softbanTrust);
  await database.recheckAllKeysInDb(softbanTrust);
  await database.recheckAllKeysInDb(trustData);
  await nextTick();
  assert.deepEqual(requests.map(r => r.body.event), ["keybox.added", "keybox.status_changed", "keybox.status_changed", "keybox.status_changed"]);
  assert.equal(requests[1].body.previous_status, "strong");
  assert.equal(requests[1].body.keybox.status, "device");
  assert.equal(requests[2].body.previous_status, "device");
  assert.equal(requests[2].body.keybox.is_softbanned, true);
  assert.equal(requests[3].body.keybox.is_softbanned, false);
});

test("Telegram supports chat IDs and plain text, with bounded user fields", async t => {
  configureGlobalTelegram("123456:test-token", "-1001234567890");
  const requests = captureRequests(t);
  await notifyKeyboxEvent("keybox.banned", {
    id: 42, status: "banned", device_id: "<device>&_*".repeat(1000), source: "source".repeat(1000), is_softbanned: 0
  }, "strong", { strong_count: 2, device_count: 1, banned_count: 1 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.telegram.org/bot123456:test-token/sendMessage");
  assert.equal(requests[0].body.chat_id, "-1001234567890");
  assert.match(requests[0].body.text, /Keybox vừa bị ban/);
  assert.match(requests[0].body.text, /strong → banned/);
  assert.ok(requests[0].body.text.length <= 4096);
  assert.equal(requests[0].body.parse_mode, undefined);
});

test("webhook errors cannot block Telegram or fail key insertion", async t => {
  saveGlobalNotificationSettings({ webhook_enabled: true, webhook_url: "https://example.test/events", webhook_token: "private-webhook-token", telegram_enabled: true, telegram_bot_token: "123456:private-bot-token", telegram_chat_id: "123" });
  const warnings = [];
  const deliveries = [];
  t.mock.method(console, "warn", message => warnings.push(message));
  t.mock.method(globalThis, "fetch", async url => {
    deliveries.push(url);
    if (url.includes("example.test")) throw new Error("private-webhook-token");
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const added = database.addKeyboxSkipDuplicate(xml, analysis);
  await nextTick();
  assert.equal(database.getKeyboxById(added.id).status, "strong");
  assert.equal(deliveries.length, 2);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings.join().includes("private-"));
});

test("HTTP failures and Telegram rejection are handled without leaking secrets", async t => {
  saveGlobalNotificationSettings({ webhook_enabled: true, webhook_url: "https://example.test/events", webhook_token: "", telegram_enabled: true, telegram_bot_token: "123456:private-bot-token", telegram_chat_id: "123" });
  const warnings = [];
  t.mock.method(console, "warn", message => warnings.push(message));
  t.mock.method(globalThis, "fetch", async url => url.includes("example.test")
    ? { ok: false, status: 503 }
    : { ok: true, json: async () => ({ ok: false, description: "private-bot-token" }) });
  await notifyKeyboxEvent("keybox.added", { id: 1, status: "strong" });
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /HTTP 503/);
  assert.ok(!warnings.join().includes("private-bot-token"));
});
