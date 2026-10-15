import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { makeKeybox, trustFor, revoke } from "../test-support/fixtures.js";
import { startServer, postJson, postText } from "../test-support/server.js";

const rsa = makeKeybox({ alg: "rsa", serial: 4001, deviceId: "api-rsa" });
const ec = makeKeybox({ alg: "ec", serial: 4002, deviceId: "api-ec" });
const trust = trustFor(rsa.certPem, ec.certPem);
let s;

before(async () => { s = await startServer(trust); });
after(() => s.close());
beforeEach(() => {
  s.state.trust = trust;
  s.db.prepare("DELETE FROM reports").run();
  s.db.prepare("DELETE FROM keyboxes").run();
});

const count = () => s.db.prepare("SELECT COUNT(*) c FROM keyboxes").get().c;

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

test("status, download, update, report threshold", async () => {
  const { id } = await (await postJson(s.base, "/api/upload", { xml: rsa.xml })).json();
  const status = await (await fetch(s.base + "/api/status")).json();
  assert.equal(status.status, "strong");
  assert.equal(status.strong_count, 1);

  const dl = await fetch(s.base + "/api/download");
  assert.equal(dl.status, 200);
  assert.ok((await dl.text()).includes("api-rsa"));

  const upd = await (await fetch(s.base + "/api/update")).json();
  assert.equal(upd.status, "strong");
  assert.ok(upd.last_updated);

  for (let i = 0; i < 6; i++) await postJson(s.base, "/api/report", { id });
  const after = await (await fetch(s.base + "/api/status")).json();
  assert.equal(after.status, "device");
  assert.equal(after.device_count, 1);
  assert.equal(after.strong_count, 0);
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
});

test("URL upload uses mocked fetch only", async () => {
  s.state.urlBodies["https://example.test/keybox.xml"] = rsa.xml;
  const res = await postJson(s.base, "/api/upload", { url: "https://example.test/keybox.xml" });
  assert.equal(res.status, 200);
  assert.deepEqual(s.state.fetched, ["https://example.test/keybox.xml"]);
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
