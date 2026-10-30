import assert from "node:assert/strict";
import { test, before, after, beforeEach } from "node:test";
import { initDb, addKeyboxSkipDuplicate, getKeyboxByFilter } from "../src/db.js";
import { analyzeKeybox } from "../src/analyzer.js";
import {
  htmlEscape,
  buildHelpText,
  buildStatusText,
  buildListText,
  buildCaption,
  handleTelegramUpdate
} from "../src/telegram-bot.js";
import { makeKeybox, trustFor } from "../test-support/fixtures.js";
import { isolate } from "../test-support/fixtures.js";

let env;
const rsa = makeKeybox({ alg: "rsa", serial: 7001, deviceId: "bot-rsa" });
const ec = makeKeybox({ alg: "ec", serial: 7002, deviceId: "bot-ec" });
const trust = trustFor(rsa.certPem, ec.certPem);

before(() => {
  env = isolate("keybox-bot-");
  initDb();
});

after(() => {
  env?.restore();
});

beforeEach(() => {
  // Clear tables between tests
  const db = initDb();
  db.prepare("DELETE FROM reports").run();
  db.prepare("DELETE FROM keyboxes").run();
});

test("htmlEscape handles undefined, null and special characters", () => {
  assert.equal(htmlEscape(null), "");
  assert.equal(htmlEscape(undefined), "");
  assert.equal(htmlEscape("Test <tag> & 'quote' >"), "Test &lt;tag&gt; &amp; 'quote' &gt;");
});

test("buildHelpText contains all essential commands", () => {
  const help = buildHelpText();
  assert.ok(help.includes("/status"));
  assert.ok(help.includes("/list"));
  assert.ok(help.includes("/keybox"));
  assert.ok(help.includes("rkp"));
  assert.ok(help.includes("hw"));
  assert.ok(help.includes("device"));
});

test("buildStatusText formats system counts accurately", () => {
  const text = buildStatusText({
    status: "strong",
    total_valid: 3,
    total_keys: 5,
    strong_count: 2,
    device_count: 1,
    softbanned_count: 0,
    banned_count: 2,
    last_updated: "2026-10-22T06:00:00.000Z"
  });

  assert.ok(text.includes("STRONG"));
  assert.ok(text.includes("3</b> / 5"));
  assert.ok(text.includes("Strong: <b>2</b>"));
  assert.ok(text.includes("Device: <b>1</b>"));
  assert.ok(text.includes("Revoked / Ban: <b>2</b>"));
});

test("buildListText handles empty and populated keybox lists", () => {
  const empty = buildListText([]);
  assert.ok(empty.includes("Hiện không có keybox nào khả dụng"));

  const list = buildListText([
    { id: 10, status: "strong", is_rkp: true, device_id: "dev-10" },
    { id: 11, status: "device", is_rkp: false, device_id: "dev-11" }
  ]);

  assert.ok(list.includes("#10</b> | <b>STRONG</b> [RKP]"));
  assert.ok(list.includes("dev-10"));
  assert.ok(list.includes("/keybox 10"));
  assert.ok(list.includes("#11</b> | <b>DEVICE</b> [HW]"));
  assert.ok(list.includes("/keybox 11"));
});

test("buildCaption formats keybox attributes cleanly", () => {
  const caption = buildCaption({
    id: 99,
    status: "strong",
    is_rkp: true,
    device_id: "google_pixel",
    algorithm: "ecdsa",
    source: "community_vault"
  });

  assert.ok(caption.includes("Keybox #99"));
  assert.ok(caption.includes("STRONG</b> [RKP]"));
  assert.ok(caption.includes("google_pixel"));
  assert.ok(caption.includes("ecdsa"));
  assert.ok(caption.includes("community_vault"));
});

test("getKeyboxByFilter retrieves expected keyboxes by criteria", async () => {
  const rsaAnalysis = await analyzeKeybox(rsa.xml, trust);
  const ecAnalysis = await analyzeKeybox(ec.xml, trust);
  const rsaRes = addKeyboxSkipDuplicate(rsa.xml, rsaAnalysis, "127.0.0.1", "test-source");
  const ecRes = addKeyboxSkipDuplicate(ec.xml, ecAnalysis, "127.0.0.1", "test-source");

  assert.equal(rsaRes.isBanned, false);
  assert.equal(ecRes.isBanned, false);

  // 'none' retrieves a valid keybox
  const rand = getKeyboxByFilter("none");
  assert.ok(rand);
  assert.ok([rsaRes.id, ecRes.id].includes(rand.id));

  // 'hw' retrieves a strong keybox
  const hw = getKeyboxByFilter("hw");
  assert.ok(hw);
  assert.equal(hw.status, "strong");

  // Specific numeric ID
  const specific = getKeyboxByFilter(String(rsaRes.id));
  assert.ok(specific);
  assert.equal(specific.id, rsaRes.id);

  // Non-existent ID returns null
  assert.equal(getKeyboxByFilter("999999"), null);
});

test("handleTelegramUpdate processes commands and sends responses", async () => {
  const rsaAnalysis = await analyzeKeybox(rsa.xml, trust);
  addKeyboxSkipDuplicate(rsa.xml, rsaAnalysis, "127.0.0.1", "test-source");

  const sentMessages = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes("sendMessage")) {
      const body = JSON.parse(opts.body);
      sentMessages.push({ type: "message", body });
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (urlStr.includes("sendDocument")) {
      sentMessages.push({ type: "document" });
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return originalFetch(url, opts);
  };

  try {
    const fakeToken = "123456:FAKE_TOKEN";

    // 1. /status command
    await handleTelegramUpdate(fakeToken, {
      message: { text: "/status", chat: { id: 100, type: "private" } }
    });
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].body.text.includes("Trạng thái hệ thống"));

    // 2. /list command with bot mention
    await handleTelegramUpdate(fakeToken, {
      message: { text: "/list@keyboxtrackerbot", chat: { id: 100, type: "group" } }
    });
    assert.equal(sentMessages.length, 2);
    assert.ok(sentMessages[1].body.text.includes("Danh sách Keybox khả dụng"));

    // 3. /keybox command
    await handleTelegramUpdate(fakeToken, {
      message: { text: "/keybox none", chat: { id: 100, type: "private" } }
    });
    assert.equal(sentMessages.length, 3);
    assert.equal(sentMessages[2].type, "document");

    // 4. Unknown command in group chat produces no reply
    await handleTelegramUpdate(fakeToken, {
      message: { text: "/other_command", chat: { id: 200, type: "group" } }
    });
    assert.equal(sentMessages.length, 3);

    // 5. Unknown command in private chat provides guidance
    await handleTelegramUpdate(fakeToken, {
      message: { text: "/unknown", chat: { id: 100, type: "private" } }
    });
    assert.equal(sentMessages.length, 4);
    assert.ok(sentMessages[3].body.text.includes("Lệnh không hợp lệ"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
