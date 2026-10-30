import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCanonicalKeyboxXml, parseKeyboxXml } from "../src/analyzer.js";
import { repairKeybox } from "../src/repairer.js";
import { applyKeyboxWatermark } from "../src/db.js";
import { makeKeybox } from "../test-support/fixtures.js";

test("formatCanonicalKeyboxXml wraps keyboxes lacking CertificateChain into canonical format", () => {
  const kb = makeKeybox({ alg: "ec", serial: 9001, deviceId: "legacy-device" });
  // Remove <CertificateChain> tags to simulate non-standard/legacy keybox
  const nonStandardXml = kb.xml
    .replace(/<CertificateChain>/gi, "")
    .replace(/<\/CertificateChain>/gi, "")
    .replace(/<NumberOfCertificates>\d+<\/NumberOfCertificates>/gi, "");

  assert.ok(!nonStandardXml.includes("<CertificateChain>"));

  const canonical = formatCanonicalKeyboxXml(nonStandardXml);
  assert.ok(canonical.includes("<CertificateChain>"));
  assert.ok(canonical.includes("</CertificateChain>"));
  assert.ok(canonical.includes("<NumberOfCertificates>1</NumberOfCertificates>"));
  assert.ok(canonical.includes('<Certificate format="pem">'));
  assert.ok(canonical.includes("legacy-device"));
});

test("formatCanonicalKeyboxXml separates conjoined certificates in a single Certificate tag", () => {
  const kb1 = makeKeybox({ alg: "ec", serial: 9002, deviceId: "conjoined-device" });
  const kb2 = makeKeybox({ alg: "ec", serial: 9003, deviceId: "second-cert" });

  // Paste two certs inside a single <Certificate> tag
  const conjoinedXml = `<?xml version="1.0"?>
<AndroidAttestation>
  <NumberOfKeyboxes>1</NumberOfKeyboxes>
  <Keybox DeviceID="conjoined-device">
    <Key algorithm="ecdsa">
      <PrivateKey format="pem">
${kb1.privateKeyPem}
      </PrivateKey>
      <Certificate format="pem">
${kb1.certPem}
${kb2.certPem}
      </Certificate>
    </Key>
  </Keybox>
</AndroidAttestation>`;

  const canonical = formatCanonicalKeyboxXml(conjoinedXml);
  assert.ok(canonical.includes("<CertificateChain>"));
  assert.ok(canonical.includes("<NumberOfCertificates>2</NumberOfCertificates>"));

  // Check that there are two separate <Certificate format="pem"> blocks
  const certMatches = canonical.match(/<Certificate format="pem">/g);
  assert.equal(certMatches?.length, 2);

  // Check parsing round-trip
  const parsed = parseKeyboxXml(canonical);
  assert.equal(parsed.keyboxes[0].keys[0].certificatesPem.length, 2);
});

test("applyKeyboxWatermark outputs canonical XML with CertificateChain and metadata", () => {
  const kb = makeKeybox({ alg: "ec", serial: 9004, deviceId: "watermark-test" });
  const rawXml = kb.xml.replace(/<\/?CertificateChain>/gi, "");

  const watermarked = applyKeyboxWatermark(rawXml, {
    id: 42,
    status: "STRONG",
    deviceId: "watermark-test"
  });

  assert.ok(watermarked.includes("Keybox ID: #42"));
  assert.ok(watermarked.includes("Status: STRONG"));
  assert.ok(watermarked.includes("<CertificateChain>"));
  assert.ok(watermarked.includes("</CertificateChain>"));
  assert.ok(watermarked.includes("<NumberOfCertificates>1</NumberOfCertificates>"));
  assert.ok(watermarked.includes("</AndroidAttestation>"));
});

test("repairKeybox generates canonical CertificateChain and splits conjoined certs", async () => {
  const kb1 = makeKeybox({ alg: "ec", serial: 9005, deviceId: "repair-test" });
  const kb2 = makeKeybox({ alg: "ec", serial: 9006, deviceId: "repair-test" });

  const brokenXml = `
<AndroidAttestation>
  <Keybox DeviceID="repair-test">
    <Key algorithm="ecdsa">
      <PrivateKey format="pem">${kb1.privateKeyPem}</PrivateKey>
      <Certificate>${kb1.certPem}\n${kb2.certPem}</Certificate>
    </Key>
  </Keybox>
</AndroidAttestation>`;

  const res = await repairKeybox(brokenXml);
  assert.equal(res.success, true);
  assert.ok(res.repairedXml.includes("<CertificateChain>"));
  assert.ok(res.repairedXml.includes("</CertificateChain>"));
  assert.ok(res.repairedXml.includes("<NumberOfCertificates>2</NumberOfCertificates>"));

  const certTags = res.repairedXml.match(/<Certificate format="pem">/g);
  assert.equal(certTags?.length, 2);
  assert.ok(res.fixesApplied.some(f => f.includes("CertificateChain") || f.includes("Tách các chứng chỉ") || f.includes("Certificate")));
});
