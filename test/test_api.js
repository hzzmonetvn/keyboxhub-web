import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { makeKeybox, trustFor, revoke } from "../test-support/fixtures.js";
import { startServer, postJson, postText } from "../test-support/server.js";
import { createNotificationSubscriber, initNotificationSettings } from "../src/notification-settings.js";
import { createRateLimiter, getClientIp } from "../src/server.js";

const rsa = makeKeybox({ alg: "rsa", serial: 4001, deviceId: "api-rsa" });
const ec = makeKeybox({ alg: "ec", serial: 4002, deviceId: "api-ec" });
const trust = trustFor(rsa.certPem, ec.certPem);
let s;

before(async () => {
  s = await startServer(trust);
  process.env.KEYBOX_ADMIN_PASSWORD = "test-admin-password";
  initNotificationSettings();
});
after(() => s.close());
beforeEach(() => {
  s.state.trust = trust;
  s.db.prepare("DELETE FROM reports").run();
  s.db.prepare("DELETE FROM keyboxes").run();
});

const count = () => s.db.prepare("SELECT COUNT(*) c FROM keyboxes").get().c;
async function adminToken() {
  const response = await postJson(s.base, "/api/notifications/admin/login", { password: "test-admin-password" });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}
async function adminRequest(method, path, token, body) {
  return fetch(s.base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

test("rate limiter isolates IPs, returns Retry-After, resets windows and ignores spoofable forwarded headers", () => {
  const state = new Map();
  let now = 1000;
  const middleware = createRateLimiter("report", { state, capacity: 2, clock: () => now, settingsFor: () => ({ max: 2, window_seconds: 60 }) });
  const invoke = (ip, forwarded = "") => {
    let passed = false;
    let status;
    let retryAfter;
    const req = { ip, socket: { remoteAddress: ip }, headers: { "x-forwarded-for": forwarded } };
    const res = { setHeader(name, value) { if (name === "Retry-After") retryAfter = value; }, status(value) { status = value; return this; }, json() { return this; } };
    middleware(req, res, () => { passed = true; });
    return { passed, status, retryAfter };
  };
  assert.equal(getClientIp({ ip: "198.51.100.1", socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.8" } }), "198.51.100.1");
  assert.equal(invoke("198.51.100.1", "203.0.113.8").passed, true);
  assert.equal(invoke("198.51.100.1", "203.0.113.9").passed, true);
  const blocked = invoke("198.51.100.1", "203.0.113.10");
  assert.equal(invoke("198.51.100.2").passed, true);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.retryAfter) > 0);
  assert.equal(invoke("198.51.100.3").status, 503);
  now += 61000;
  assert.equal(invoke("198.51.100.3").passed, true);
});

test("raw JSON upload of RSA and EC keyboxes is accepted as strong", async () => {
  for (const k of [rsa, ec]) {
    const res = await postJson(s.base, "/api/upload", { xml: k.xml });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.status, "strong");
  }
  assert.equal(count(), 2);
});

test("raw text upload accepted", async () => {
  const res = await postText(s.base, "/api/upload", rsa.xml);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "strong");
});

test("status, download, update, report threshold with auth token", async () => {
  const { id } = await (await postJson(s.base, "/api/upload", { xml: rsa.xml })).json();
  const status = await (await fetch(s.base + "/api/status")).json();
  assert.equal(status.status, "strong");
  assert.equal(status.strong_count, 1);
  assert.ok(Array.isArray(status.keyboxes));
  assert.equal(status.keyboxes.length, 1);

  const kbItem = status.keyboxes[0];
  assert.equal(kbItem.id, id);
  assert.equal(kbItem.status, "strong");
  assert.equal(kbItem.device_id, "api-rsa");
  assert.equal(kbItem.name, "api-rsa");
  assert.ok(kbItem.download_url.includes(`/api/download?id=${id}`));
  assert.equal(typeof kbItem.is_rkp, "boolean");
  assert.ok(kbItem.certificate_count >= 1);
  assert.ok(Array.isArray(kbItem.algorithms));
  assert.ok(Array.isArray(kbItem.certificate_details));

  const dl = await fetch(s.base + "/api/download");
  assert.equal(dl.status, 200);
  assert.ok((await dl.text()).includes("api-rsa"));

  const upd = await (await fetch(s.base + "/api/update")).json();
  assert.equal(upd.status, "strong");
  assert.ok(upd.last_updated);

  // Unauthenticated report should be rejected with 401
  const unauthRes = await postJson(s.base, "/api/report", { id });
  assert.equal(unauthRes.status, 401);

  // Issue a subscriber token to report
  const { token } = createNotificationSubscriber("Test Reporter");

  // Single report with valid token transitions strong to device
  const reportRes = await fetch(s.base + "/api/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ id })
  });
  assert.equal(reportRes.status, 200);
  const reportData = await reportRes.json();
  assert.equal(reportData.success, true);
  assert.equal(reportData.status, "device");
  assert.equal(reportData.promoted_to_device, true);

  const after = await (await fetch(s.base + "/api/status")).json();
  assert.equal(after.status, "device");
  assert.equal(after.device_count, 1);
  assert.equal(after.strong_count, 0);
  assert.equal(after.keyboxes.length, 1);
  assert.equal(after.keyboxes[0].status, "device");
});

test("download prioritises strong over device", async () => {
  const a = await (await postJson(s.base, "/api/upload", { xml: rsa.xml })).json();
  await postJson(s.base, "/api/upload", { xml: ec.xml });
  s.db.prepare("UPDATE keyboxes SET status='device' WHERE id=?").run(a.id);
  for (let i = 0; i < 10; i++) {
    const dl = await (await fetch(s.base + "/api/download?format=json")).json();
    assert.equal(dl.status, "strong");
  }
});

test("untrusted self-signed key is rejected with 422 and nothing stored", async () => {
  const stranger = makeKeybox({ serial: 4003 });
  const res = await postJson(s.base, "/api/upload", { xml: stranger.xml });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).success, false);
  assert.equal(count(), 0);
  assert.equal(s.db.prepare("SELECT COUNT(*) c FROM reports").get().c, 0);
});

for (const privateKey of ["mismatch", "missing", "malformed"]) {
  test(`${privateKey} private key is rejected with 422 and nothing stored`, async () => {
    const bad = makeKeybox({ serial: 4010, privateKey });
    s.state.trust = trustFor(bad.certPem);
    const res = await postJson(s.base, "/api/upload", { xml: bad.xml });
    assert.equal(res.status, 422);
    assert.equal(count(), 0);
  });
}

test("revoked key is rejected with 422 and nothing stored", async () => {
  s.state.trust = revoke(trustFor(rsa.certPem), 4001);
  const res = await postJson(s.base, "/api/upload", { xml: rsa.xml });
  assert.equal(res.status, 422);
  assert.equal(count(), 0);
});

test("invalid duplicate of a stored key is validated first and rejected", async () => {
  await postJson(s.base, "/api/upload", { xml: rsa.xml });
  s.state.trust = revoke(trustFor(rsa.certPem), 4001);
  const res = await postJson(s.base, "/api/upload", { xml: rsa.xml });
  assert.equal(res.status, 422);
  assert.equal(count(), 1);
});

test("valid duplicate is skipped", async () => {
  await postJson(s.base, "/api/upload", { xml: rsa.xml });
  const data = await (await postJson(s.base, "/api/upload", { xml: rsa.xml })).json();
  assert.equal(data.skipped, true);
  assert.equal(count(), 1);
});

test("duplicate with superior quality upgrades keybox in place", async () => {
  // First upload: simple RSA keybox
  const first = await (await postJson(s.base, "/api/upload", { xml: rsa.xml })).json();
  assert.equal(first.success, true);
  assert.equal(count(), 1);

  // Second upload: keybox with identical serial 4001, but with dual EC+RSA keys (higher quality score)
  const superiorXml = `<?xml version="1.0"?><AndroidAttestation><NumberOfKeyboxes>1</NumberOfKeyboxes>
<Keybox DeviceID="api-rsa-upgraded">
  <Key algorithm="rsa">
    <PrivateKey format="pem">${rsa.keyPem}</PrivateKey>
    <CertificateChain><NumberOfCertificates>1</NumberOfCertificates><Certificate format="pem">${rsa.certPem}</Certificate></CertificateChain>
  </Key>
  <Key algorithm="ecdsa">
    <PrivateKey format="pem">${ec.keyPem}</PrivateKey>
    <CertificateChain><NumberOfCertificates>1</NumberOfCertificates><Certificate format="pem">${ec.certPem}</Certificate></CertificateChain>
  </Key>
</Keybox></AndroidAttestation>`;

  const secondRes = await postJson(s.base, "/api/upload", { xml: superiorXml });
  const second = await secondRes.json();
  assert.equal(secondRes.status, 200);
  assert.equal(second.success, true);
  assert.equal(second.upgraded, true);
  assert.equal(second.skipped, false);
  assert.equal(second.id, first.id); // Same ID kept!
  assert.equal(count(), 1); // No duplicate row created

  const row = s.db.prepare("SELECT * FROM keyboxes WHERE id = ?").get(first.id);
  assert.equal(row.device_id, "api-rsa-upgraded");
  assert.ok(row.xml_content.includes("api-rsa-upgraded"));
});

test("download strictly prioritises RKP keys over standard keys", async () => {
  // Set up an RKP key: algorithm ec and root is google_p384_2026
  const rkpTrust = {
    roots: [
      { id: "google_p384_2026", label: "Google Key Attestation CA1 (ECDSA P-384)", kind: "google_hardware", level: "trusted", pem: ec.certPem },
      { id: "google_hardware_root", label: "Google Hardware Attestation Root CA", kind: "google_hardware", level: "trusted", pem: rsa.certPem }
    ],
    status: { entries: {} }
  };
  s.state.trust = rkpTrust;

  // Upload standard RSA strong key and RKP EC strong key
  await postJson(s.base, "/api/upload", { xml: rsa.xml });
  await postJson(s.base, "/api/upload", { xml: ec.xml });
  assert.equal(count(), 2);

  // Repeated downloads should consistently pick the RKP key
  for (let i = 0; i < 10; i++) {
    const dl = await (await fetch(s.base + "/api/download?format=json")).json();
    assert.equal(dl.status, "strong");
    assert.equal(dl.deviceId, "api-ec");
    assert.ok(dl.algorithm.includes("ec"));
  }

  // Profile-specific downloads
  const dlHw = await (await fetch(s.base + "/api/download?profile=hw&format=json")).json();
  assert.equal(dlHw.deviceId, "api-rsa");

  const dlRkp = await (await fetch(s.base + "/api/download?profile=rkp&format=json")).json();
  assert.equal(dlRkp.deviceId, "api-ec");

  // Status checks for total_hw_valid and total_rkp_valid
  const statusRes = await (await fetch(s.base + "/api/status")).json();
  assert.equal(statusRes.total_hw_valid, 1);
  assert.equal(statusRes.total_rkp_valid, 1);
  assert.equal(statusRes.keyboxes[0].profile, "rkp");
  assert.equal(statusRes.keyboxes[1].profile, "hw");
});

test("admin routes enforce auth and manage settings, notifications, sources and key deletion", async () => {
  const anon = await fetch(s.base + "/api/admin/settings");
  assert.equal(anon.status, 401);
  const token = await adminToken();
  const settingsRes = await adminRequest("GET", "/api/admin/settings", token);
  assert.equal(settingsRes.status, 200);
  const settings = await settingsRes.json();
  settings.appearance.mode = "light";
  settings.rate_limits = { download: { max: 10000, window_seconds: 60 }, upload: { max: 10000, window_seconds: 60 }, operations: { max: 10000, window_seconds: 60 }, login: { max: 20, window_seconds: 60 }, report: { max: 10000, window_seconds: 60 } };
  const savedSettings = await adminRequest("PUT", "/api/admin/settings", token, settings);
  assert.equal(savedSettings.status, 200);
  assert.equal((await savedSettings.json()).appearance.mode, "light");
  const publicSettings = await (await fetch(s.base + "/api/site-settings")).json();
  assert.deepEqual(Object.keys(publicSettings).sort(), ["appearance", "intervals", "media"]);
  assert.deepEqual(Object.keys(publicSettings.intervals), ["browser_seconds"]);

  const notificationPayload = {
    webhook_enabled: true, webhook_url: "https://example.test/hook", webhook_token: "test-secret",
    telegram_enabled: false, telegram_bot_token: "", telegram_chat_id: ""
  };
  const savedNotifications = await adminRequest("PUT", "/api/admin/notifications", token, notificationPayload);
  assert.equal(savedNotifications.status, 200);
  assert.equal(savedNotifications.headers.get("cache-control"), "no-store");
  const redacted = await (await adminRequest("GET", "/api/admin/notifications", token)).json();
  assert.equal(redacted.webhook_token_set, true);
  assert.ok(!JSON.stringify(redacted).includes("test-secret"));
  assert.equal(s.state.posted.length, 0);

  const communitySourceUrl = `https://example.test/community-${Date.now()}`;
  const publicSource = await postJson(s.base, "/api/sources", { name: "Community", type: "raw_url", url: communitySourceUrl });
  assert.equal(publicSource.status, 201);
  assert.equal((await publicSource.json()).success, true);
  assert.equal((await postJson(s.base, "/api/sources", { name: "Bad", type: "raw_url", url: "http://example.test/source" })).status, 400);
  const adminSourceUrl = `https://example.test/source-${Date.now()}`;
  assert.equal((await adminRequest("POST", "/api/admin/sources", token, { name: "Test", url: adminSourceUrl, type: "raw_url" })).status, 201);
  const sources = await (await adminRequest("GET", "/api/admin/sources", token)).json();
  const source = sources.sources.find(item => item.url === adminSourceUrl);
  assert.ok(source);
  assert.equal((await adminRequest("PUT", `/api/admin/sources/${source.id}`, token, { name: "Edited", url: source.url, type: source.type, enabled: false })).status, 200);
  assert.equal((await adminRequest("DELETE", `/api/admin/sources/${source.id}`, token)).status, 200);

  await adminRequest("PUT", "/api/admin/notifications", token, { ...notificationPayload, webhook_enabled: false, webhook_url: "" });
  const uploaded = await (await postJson(s.base, "/api/upload", { xml: rsa.xml })).json();
  s.db.prepare("INSERT INTO reports (key_id, reporter_ip, created_at) VALUES (?, ?, ?)").run(uploaded.id, "127.0.0.3", new Date().toISOString());
  assert.equal((await adminRequest("DELETE", `/api/admin/keys/${uploaded.id}`, token)).status, 200);
  assert.equal(s.db.prepare("SELECT COUNT(*) c FROM reports WHERE key_id = ?").get(uploaded.id).c, 0);
});

test("URL upload uses mocked fetch only", async () => {
  s.state.urlBodies["https://example.test/keybox.xml"] = rsa.xml;
  const res = await postJson(s.base, "/api/upload", { url: "https://example.test/keybox.xml" });
  assert.equal(res.status, 200);
  assert.deepEqual(s.state.fetched.filter(url => url !== "https://example.test/hook"), ["https://example.test/keybox.xml"]);
  assert.equal(count(), 1);
});

test("trust refresh failure leaves the DB untouched", async () => {
  await postJson(s.base, "/api/upload", { xml: rsa.xml });
  const original = s.trustManager.refreshTrustData;
  s.trustManager.refreshTrustData = async () => { throw new Error("status fetch failed"); };
  try {
    const res = await postJson(s.base, "/api/upload", { xml: ec.xml });
    assert.ok(res.status >= 400);
    assert.equal(count(), 1);
  } finally {
    s.trustManager.refreshTrustData = original;
  }
});
