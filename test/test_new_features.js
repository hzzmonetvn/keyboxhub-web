import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { setImmediate as nextTick } from "node:timers/promises";
import AdmZip from "adm-zip";
import { makeKeybox, trustFor, revoke } from "../test-support/fixtures.js";
import { startServer, postJson, postFiles } from "../test-support/server.js";
import { saveGlobalNotificationSettings } from "../src/notification-settings.js";

const good = [101, 102, 103].map(n => makeKeybox({ alg: n === 102 ? "ec" : "rsa", serial: n, deviceId: `batch-${n}` }));
const bad = makeKeybox({ serial: 199, deviceId: "batch-untrusted" });
const trust = trustFor(...good.map(k => k.certPem));
let s;

before(async () => { s = await startServer(trust); });
after(() => s.close());
beforeEach(() => {
  s.state.trust = trust;
  s.state.posted.length = 0;
  saveGlobalNotificationSettings({ webhook_enabled: false, webhook_url: "", webhook_token: "", telegram_enabled: false, telegram_bot_token: "", telegram_chat_id: "" });
  s.db.prepare("DELETE FROM reports").run();
  s.db.prepare("DELETE FROM keyboxes").run();
});

const count = () => s.db.prepare("SELECT COUNT(*) c FROM keyboxes").get().c;

test("ZIP upload adds every valid key", async () => {
  const zip = new AdmZip();
  zip.addFile("keys/a.xml", Buffer.from(good[0].xml));
  zip.addFile("keys/b.xml", Buffer.from(good[1].xml));
  const res = await postFiles(s.base, "/api/upload", [["batch.zip", zip.toBuffer()]]);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.total_processed, 2);
  assert.equal(data.newly_added, 2);
  assert.equal(data.strong_count, 2);
  assert.equal(count(), 2);
});

test("multi-file upload with a rejected key: accepted plus rejected counts", async () => {
  const res = await postFiles(s.base, "/api/upload", [["a.xml", good[0].xml], ["b.xml", bad.xml], ["c.xml", good[2].xml]]);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.newly_added, 2);
  assert.equal(data.skipped_count, 0);
  assert.equal(data.rejected_count, 1);
  assert.equal(count(), 2);
});

test("batch with duplicate and rejected key counts both", async () => {
  await postJson(s.base, "/api/upload", { xml: good[0].xml });
  const res = await postFiles(s.base, "/api/upload", [["a.xml", good[0].xml], ["b.xml", bad.xml]]);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.newly_added, 0);
  assert.equal(data.skipped_count, 1);
  assert.equal(data.rejected_count, 1);
  assert.equal(count(), 1);
});

test("batch of only rejected keys returns 422 and stores nothing", async () => {
  const bad2 = makeKeybox({ serial: 198, deviceId: "batch-untrusted-2" });
  const res = await postFiles(s.base, "/api/upload", [["a.xml", bad.xml], ["b.xml", bad2.xml]]);
  const data = await res.json();
  assert.equal(res.status, 422);
  assert.equal(data.rejected_count, 2);
  assert.equal(count(), 0);
});

test("recheck deletes newly invalid keys, reports each once, keeps valid ones", async () => {
  saveGlobalNotificationSettings({ webhook_enabled: true, webhook_url: "https://hook.test/events", webhook_token: "", telegram_enabled: false, telegram_bot_token: "", telegram_chat_id: "" });
  for (const k of good) await postJson(s.base, "/api/upload", { xml: k.xml });
  await nextTick();
  s.state.posted.length = 0;

  const revoked = revoke(trustFor(...good.map(k => k.certPem)), 101);
  await s.database.recheckAllKeysInDb(revoked);
  await s.database.recheckAllKeysInDb(revoked);
  await nextTick();

  assert.equal(count(), 2);
  assert.equal(s.db.prepare("SELECT COUNT(*) c FROM keyboxes WHERE device_id='batch-101'").get().c, 0);
  const banned = s.state.posted.filter(p => p.body.event === "keybox.banned");
  assert.equal(banned.length, 1);
  assert.equal(s.db.prepare("SELECT COUNT(*) c FROM keyboxes WHERE status='strong'").get().c, 2);
});

test("cleanup purges banned rows regardless of banned_at age", () => {
  const ins = s.db.prepare(`INSERT INTO keyboxes (key_hash, device_id, xml_content, algorithm, status, check_result, uploaded_at, last_checked_at, banned_at)
    VALUES (?, ?, '<x/>', 'rsa', 'banned', '{}', ?, ?, ?)`);
  const old = new Date(Date.now() - 25 * 3600e3).toISOString();
  const recent = new Date(Date.now() - 2 * 3600e3).toISOString();
  ins.run("h-old", "old", old, old, old);
  ins.run("h-recent", "recent", recent, recent, recent);
  ins.run("h-null", "null", recent, recent, null);
  assert.equal(s.database.cleanupOldBannedKeys(), 3);
  assert.equal(count(), 0);
});

test("empty trust roots make analysis throw and recheck preserves the DB", async () => {
  await postJson(s.base, "/api/upload", { xml: good[0].xml });
  const empty = { roots: [], status: { entries: {} } };
  const { analyzeKeybox } = await import("../src/analyzer.js");
  await assert.rejects(() => analyzeKeybox(good[0].xml, empty));
  await s.database.recheckAllKeysInDb(empty);
  assert.equal(count(), 1);
});

test("keybox with an extra empty or private-key-less key is rejected", async () => {
  const extra = good[0].xml.replace("</Keybox>", `<Key algorithm="rsa"><CertificateChain><NumberOfCertificates>0</NumberOfCertificates></CertificateChain></Key></Keybox>`);
  const res = await postJson(s.base, "/api/upload", { xml: extra });
  assert.equal(res.status, 422);
  assert.equal(count(), 0);
});
