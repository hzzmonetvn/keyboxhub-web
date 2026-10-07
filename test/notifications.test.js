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
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const trustData = { roots: [], status: { entries: {} } };
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
  analysis = await analyzeKeybox(xml, trustData);
  assert.equal(analysis.overall, "warn");
  process.chdir(tempDir);
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
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  await notifyKeyboxEvent("keybox.added", {});
  assert.equal(requests.length, 0);
});

test("new upload/source keys notify once; duplicates and unchanged rechecks stay silent", async t => {
  process.env.KEYBOX_WEBHOOK_URL = "https://example.test/events";
  process.env.KEYBOX_WEBHOOK_TOKEN = "test-secret";
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

test("new banned key emits only added with banned status", async t => {
  process.env.KEYBOX_WEBHOOK_URL = "https://example.test/events";
  const requests = captureRequests(t);
  const revokedTrust = { roots: [], status: { entries: { "123456789": { status: "REVOKED" } } } };
  const revokedAnalysis = await analyzeKeybox(xml, revokedTrust);
  database.addKeyboxSkipDuplicate(xml, revokedAnalysis);
  await database.recheckAllKeysInDb(revokedTrust);
  await nextTick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.event, "keybox.added");
  assert.equal(requests[0].body.keybox.status, "banned");
  assert.ok(requests[0].body.keybox.banned_at);
});

test("revocation notifies once and recovery emits a status change", async t => {
  process.env.KEYBOX_WEBHOOK_URL = "https://example.test/events";
  const requests = captureRequests(t);
  database.addKeyboxSkipDuplicate(xml, analysis);
  const revokedTrust = { roots: [], status: { entries: { "123456789": { status: "REVOKED" } } } };
  await database.recheckAllKeysInDb(revokedTrust);
  await database.recheckAllKeysInDb(revokedTrust);
  await database.recheckAllKeysInDb(trustData);
  await nextTick();
  assert.deepEqual(requests.map(r => r.body.event), ["keybox.added", "keybox.banned", "keybox.status_changed"]);
  assert.equal(requests[1].body.previous_status, "strong");
  assert.equal(requests[1].body.keybox.status, "banned");
  assert.equal(requests[1].body.system_status.banned_count, 1);
  assert.equal(requests[2].body.previous_status, "banned");
  assert.equal(requests[2].body.keybox.status, "strong");
  assert.equal(requests[2].body.keybox.banned_at, null);
});

test("report threshold and softban flag changes notify without repeating", async t => {
  process.env.KEYBOX_WEBHOOK_URL = "https://example.test/events";
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
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHAT_ID = "-1001234567890";
  const requests = captureRequests(t);
  await notifyKeyboxEvent("keybox.banned", {
    id: 42, status: "banned", device_id: "<device>&_*".repeat(1000), source: "source".repeat(1000), is_softbanned: 0
  }, "strong", { strong_count: 2, device_count: 1, banned_count: 1 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.telegram.org/bottest-token/sendMessage");
  assert.equal(requests[0].body.chat_id, "-1001234567890");
  assert.match(requests[0].body.text, /Keybox vừa bị ban/);
  assert.match(requests[0].body.text, /strong → banned/);
  assert.ok(requests[0].body.text.length <= 4096);
  assert.equal(requests[0].body.parse_mode, undefined);
});

test("webhook errors cannot block Telegram or fail key insertion", async t => {
  process.env.KEYBOX_WEBHOOK_URL = "https://example.test/events";
  process.env.KEYBOX_WEBHOOK_TOKEN = "private-webhook-token";
  process.env.TELEGRAM_BOT_TOKEN = "private-bot-token";
  process.env.TELEGRAM_CHAT_ID = "123";
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
  process.env.KEYBOX_WEBHOOK_URL = "https://example.test/events";
  process.env.TELEGRAM_BOT_TOKEN = "private-bot-token";
  process.env.TELEGRAM_CHAT_ID = "123";
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
