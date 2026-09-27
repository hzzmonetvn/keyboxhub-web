import assert from "node:assert/strict";

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

function derWrap(tag, value) {
  return concatBytes(Uint8Array.of(tag), derLen(value.length), value);
}

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

async function makeSyntheticKeyboxXml(deviceId = "test-device-1") {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: Uint8Array.of(1, 0, 1),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const sigAlg = derSeq(derOid("1.2.840.113549.1.1.11"), derNull());
  const name = makeName("KeyBox Checker Sample Device", "Google LLC");
  const validity = derSeq(derUtc("250101000000Z"), derUtc("350101000000Z"));
  const tbs = derSeq(
    derContext(0, derInt(2)),
    derInt(Uint8Array.of(0x42, 0x11, 0x22)),
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
  return { xml, certPem };
}

async function testAll() {
  console.log("1. Generating test keybox...");
  const { xml } = await makeSyntheticKeyboxXml("pixel-8-pro-test");

  console.log("2. Uploading keybox via POST /api/upload...");
  const uploadRes = await fetch("http://127.0.0.1:8098/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xml })
  });
  const uploadData = await uploadRes.json();
  console.log("Upload result:", uploadData);
  assert.equal(uploadData.success, true);
  assert.equal(uploadData.status, "strong");
  const keyId = uploadData.id;

  console.log("3. Testing GET /api/status...");
  const statusRes = await fetch("http://127.0.0.1:8098/api/status");
  const statusData = await statusRes.json();
  console.log("Status result:", statusData);
  assert.equal(statusData.status, "strong");
  assert.equal(statusData.strong_count, 1);

  console.log("4. Testing GET /api/download...");
  const dlRes = await fetch("http://127.0.0.1:8098/api/download");
  assert.equal(dlRes.status, 200);
  const dlText = await dlRes.text();
  assert.ok(dlText.includes("pixel-8-pro-test"));

  console.log("5. Testing GET /api/update...");
  const updateRes = await fetch("http://127.0.0.1:8098/api/update");
  const updateData = await updateRes.json();
  console.log("Update result:", updateData);
  assert.equal(updateData.status, "strong");
  assert.ok(updateData.last_updated);

  console.log("6. Testing POST /api/report (5 times threshold)...");
  for (let i = 1; i <= 6; i++) {
    const reportRes = await fetch("http://127.0.0.1:8098/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: keyId })
    });
    const reportData = await reportRes.json();
    console.log(`Report #${i}:`, reportData);
  }

  console.log("7. Checking status after reports (should transition to 'device')...");
  const statusAfterReport = await (await fetch("http://127.0.0.1:8098/api/status")).json();
  console.log("Status after reports:", statusAfterReport);
  assert.equal(statusAfterReport.status, "device");
  assert.equal(statusAfterReport.device_count, 1);
  assert.equal(statusAfterReport.strong_count, 0);

  console.log("All API tests PASSED successfully!");
}

testAll().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
