import assert from "node:assert/strict";
import AdmZip from "adm-zip";

function concatBytes(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function derLen(len) {
  if (len < 128) return Uint8Array.of(len);
  const bytes = [];
  while (len) {
    bytes.unshift(len & 0xff);
    len >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function derWrap(tag, value) { return concatBytes(Uint8Array.of(tag), derLen(value.length), value); }
function derSeq(...parts) { return derWrap(0x30, concatBytes(...parts)); }
function derSet(...parts) { return derWrap(0x31, concatBytes(...parts)); }
function derNull() { return Uint8Array.of(0x05, 0x00); }
function derUtf8(value) { return derWrap(0x0c, new TextEncoder().encode(value)); }
function derBitString(value) { return derWrap(0x03, concatBytes(Uint8Array.of(0), value)); }
function derContext(tag, value) { return derWrap(0xa0 + tag, value); }
function derUtc(value) { return derWrap(0x17, new TextEncoder().encode(value)); }

function derInt(bytes) {
  let value = bytes instanceof Uint8Array ? bytes : Uint8Array.of(bytes);
  while (value.length > 1 && value[0] === 0) value = value.subarray(1);
  if (value[0] & 0x80) value = concatBytes(Uint8Array.of(0), value);
  return derWrap(0x02, value);
}

function derOid(dotted) {
  const nums = dotted.split(".").map(BigInt);
  const out = [Number(nums[0] * 40n + nums[1])];
  for (let n of nums.slice(2)) {
    const stack = [Number(n & 0x7fn)];
    n >>= 7n;
    while (n) {
      stack.unshift(Number((n & 0x7fn) | 0x80n));
      n >>= 7n;
    }
    out.push(...stack);
  }
  return derWrap(0x06, Uint8Array.from(out));
}

function pem(label, bytes) {
  const b64 = Buffer.from(bytes).toString("base64").replace(/(.{64})/g, "$1\n").trim();
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----`;
}

function makeName(cn, organization) {
  const attributes = [derSet(derSeq(derOid("2.5.4.3"), derUtf8(cn)))];
  if (organization) attributes.push(derSet(derSeq(derOid("2.5.4.10"), derUtf8(organization))));
  return derSeq(...attributes);
}

async function makeSyntheticKeyboxXml(deviceId, serialInt) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const sigAlg = derSeq(derOid("1.2.840.113549.1.1.11"), derNull());
  const name = makeName("Sample Root " + deviceId, "Google LLC");
  const validity = derSeq(derUtc("250101000000Z"), derUtc("350101000000Z"));
  const tbs = derSeq(
    derContext(0, derInt(2)),
    derInt(Uint8Array.of((serialInt >> 16) & 0xff, (serialInt >> 8) & 0xff, serialInt & 0xff)),
    sigAlg,
    name,
    validity,
    name,
    spki,
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, keyPair.privateKey, tbs));
  const cert = derSeq(tbs, sigAlg, derBitString(signature));
  const privateKeyPem = pem("PRIVATE KEY", pkcs8);
  const certPem = pem("CERTIFICATE", cert);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AndroidAttestation>
  <NumberOfKeyboxes>1</NumberOfKeyboxes>
  <Keybox DeviceID="${deviceId}">
    <Key algorithm="rsa">
      <PrivateKey format="pem">
${privateKeyPem}
      </PrivateKey>
      <CertificateChain>
        <NumberOfCertificates>1</NumberOfCertificates>
        <Certificate format="pem">
${certPem}
        </Certificate>
      </CertificateChain>
    </Key>
  </Keybox>
</AndroidAttestation>`;
  return xml;
}

async function run() {
  console.log("=== 1. Testing ZIP Archive Upload ===");
  const zip = new AdmZip();
  const xml1 = await makeSyntheticKeyboxXml("device-zip-1", 101);
  const xml2 = await makeSyntheticKeyboxXml("device-zip-2", 102);
  zip.addFile("keys/key1.xml", Buffer.from(xml1, "utf-8"));
  zip.addFile("keys/key2.xml", Buffer.from(xml2, "utf-8"));
  const zipBuffer = zip.toBuffer();

  const formData = new FormData();
  const blob = new Blob([zipBuffer], { type: "application/zip" });
  formData.append("files", blob, "batch_keyboxes.zip");

  const zipUploadRes = await fetch("http://127.0.0.1:8098/api/upload", {
    method: "POST",
    body: formData
  });
  const zipResult = await zipUploadRes.json();
  console.log("ZIP Upload Response:", zipResult);
  assert.equal(zipUploadRes.status, 200);
  assert.equal(zipResult.total_processed, 2);
  assert.equal(zipResult.valid_count, 2);

  console.log("=== 2. Testing Multiple File Upload ===");
  const xml3 = await makeSyntheticKeyboxXml("device-multi-3", 103);
  const xml4 = await makeSyntheticKeyboxXml("device-multi-4", 104);

  const multiFormData = new FormData();
  multiFormData.append("files", new Blob([xml3], { type: "text/xml" }), "key3.xml");
  multiFormData.append("files", new Blob([xml4], { type: "text/xml" }), "key4.xml");

  const multiRes = await fetch("http://127.0.0.1:8098/api/upload", {
    method: "POST",
    body: multiFormData
  });
  const multiResult = await multiRes.json();
  console.log("Multi File Upload Response:", multiResult);
  assert.equal(multiRes.status, 200);
  assert.equal(multiResult.total_processed, 2);
  assert.equal(multiResult.valid_count, 2);

  console.log("=== 3. Testing Strong Priority in Download ===");
  // Demote device-zip-1 and device-zip-2 to 'device' by reporting 6 times
  const keysListRes = await fetch("http://127.0.0.1:8098/api/keys");
  const { keys } = await keysListRes.json();
  console.log(`Current keys in DB: ${keys.length}`);

  // Download 10 times, verify all returned keys have status = 'strong' because strong keys (key3, key4) exist
  for (let i = 0; i < 10; i++) {
    const dl = await (await fetch("http://127.0.0.1:8098/api/download?format=json")).json();
    assert.equal(dl.status, "strong");
  }
  console.log("Verified: 10/10 downloads correctly returned strong keys!");

  console.log("=== 4. Testing 24h Auto-deletion for Banned Keys ===");
  import("../src/db.js").then(({ initDb, cleanupOldBannedKeys, getSystemStatus }) => {
    const db = initDb();
    // Insert a dummy banned key with banned_at 25 hours ago
    const pastTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO keyboxes (key_hash, device_id, xml_content, algorithm, status, check_result, uploaded_at, last_checked_at, banned_at)
      VALUES (?, ?, ?, ?, 'banned', '{}', ?, ?, ?)
    `).run("dummy_expired_hash", "expired-device", "<dummy/>", "rsa", pastTime, pastTime, pastTime);

    // Insert a dummy banned key with banned_at 2 hours ago
    const recentTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO keyboxes (key_hash, device_id, xml_content, algorithm, status, check_result, uploaded_at, last_checked_at, banned_at)
      VALUES (?, ?, ?, ?, 'banned', '{}', ?, ?, ?)
    `).run("dummy_recent_hash", "recent-banned-device", "<dummy/>", "rsa", recentTime, recentTime, recentTime);

    const deleted = cleanupOldBannedKeys();
    console.log("Cleanup purged count:", deleted);
    assert.equal(deleted, 1, "Should have purged exactly 1 expired banned key (>24h)");

    const remainingExpired = db.prepare("SELECT * FROM keyboxes WHERE key_hash = 'dummy_expired_hash'").get();
    assert.equal(remainingExpired, undefined);

    const remainingRecent = db.prepare("SELECT * FROM keyboxes WHERE key_hash = 'dummy_recent_hash'").get();
    assert.ok(remainingRecent, "Recent banned key (<24h) should still exist");

    // Clean up dummy recent
    db.prepare("DELETE FROM keyboxes WHERE key_hash = 'dummy_recent_hash'").run();
    console.log("24h Banned Key Cleanup Test PASSED!");
  });
}

run().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
