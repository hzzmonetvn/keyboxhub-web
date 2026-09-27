import { createPrivateKey, createPublicKey } from "node:crypto";
import { parseKeyboxXml, parseCertificatePem, analyzeKeybox, verifyCertificateSignature } from "./analyzer.js";
import { normaliseKeyboxBody } from "./source-fetcher.js";

/**
 * Standard Google Hardware Attestation RSA Root Certificate (4096-bit self-signed)
 * Serial: d50ff25ba3f2d6b3 | Subject: serialNumber=f92009e853b6b045
 */
export const GOOGLE_ROOT_RSA_PEM = `-----BEGIN CERTIFICATE-----
MIIFHDCCAwSgAwIBAgIJANUP8luj8tazMA0GCSqGSIb3DQEBCwUAMBsxGTAXBgNV
BAUTEGY5MjAwOWU4NTNiNmIwNDUwHhcNMTkxMTIyMjAzNzU4WhcNMzQxMTE4MjAz
NzU4WjAbMRkwFwYDVQQFExBmOTIwMDllODUzYjZiMDQ1MIICIjANBgkqhkiG9w0B
AQEFAAOCAg8AMIICCgKCAgEAr7bHgiuxpwHsK7Qui8xUFmOr75gvMsd/dTEDDJdS
Sxtf6An7xyqpRR90PL2abxM1dEqlXnf2tqw1Ne4Xwl5jlRfdnJLmN0pTy/4lj4/7
tv0Sk3iiKkypnEUtR6WfMgH0QZfKHM1+di+y9TFRtv6y//0rb+T+W8a9nsNL/ggj
nar86461qO0rOs2cXjp3kOG1FEJ5MVmFmBGtnrKpa73XpXyTqRxB/M0n1n/W9nGq
C4FSYa04T6N5RIZGBN2z2MT5IKGbFlbC8UrW0DxW7AYImQQcHtGl/m00QLVWutHQ
oVJYnFPlXTcHYvASLu+RhhsbDmxMgJJ0mcDpvsC4PjvB+TxywElgS70vE0XmLD+O
JtvsBslHZvPBKCOdT0MS+tgSOIfga+z1Z1g7+DVagf7quvmag8jfPioyKvxnK/Eg
sTUVi2ghzq8wm27ud/mIM7AY2qEORR8Go3TVB4HzWQgpZrt3i5MIlCaY504LzSRi
igHCzAPlHws+W0rB5N+er5/2pJKnfBSDiCiFAVtCLOZ7gLiMm0jhO2B6tUXHI/+M
RPjy02i59lINMRRev56GKtcd9qO/0kUJWdZTdA2XoS82ixPvZtXQpUpuL12ab+9E
aDK8Z4RHJYYfCT3Q5vNAXaiWQ+8PTWm2QgBR/bkwSWc+NpUFgNPN9PvQi8WEg5Um
AGMCAwEAAaNjMGEwHQYDVR0OBBYEFDZh4QB8iAUJUYtEbEf/GkzJ6k8SMB8GA1Ud
IwQYMBaAFDZh4QB8iAUJUYtEbEf/GkzJ6k8SMA8GA1UdEwEB/wQFMAMBAf8wDgYD
VR0PAQH/BAQDAgIEMA0GCSqGSIb3DQEBCwUAA4ICAQBOMaBc8oumXb2voc7XCWnu
XKhBBK3e2KMGz39t7lA3XXRe2ZLLAkLM5y3J7tURkf5a1SutfdOyXAmeE6SRo83U
h6WszodmMkxK5GM4JGrnt4pBisu5igXEydaW7qq2CdC6DOGjG+mEkN8/TA6p3cno
L/sPyz6evdjLlSeJ8rFBH6xWyIZCbrcpYEJzXaUOEaxxXxgYz5/cTiVKN2M1G2ok
QBUIYSY6bjEL4aUN5cfo7ogP3UvliEo3Eo0YgwuzR2v0KR6C1cZqZJSTnghIC/vA
D32KdNQ+c3N+vl2OTsUVMC1GiWkngNx1OO1+kXW+YTnnTUOtOIswUP/Vqd5SYgAI
mMAfY8U9/iIgkQj6T2W6FsScy94IN9fFhE1UtzmLoBIuUFsVXJMTz+Jucth+IqoW
Fua9v1R93/k98p41pjtFX+H8DslVgfP097vju4KDlqN64xV1grw3ZLl4CiOe/A91
oeLm2UHOq6wn3esB4r2EIQKb6jTVGu5sYCcdWpXr0AUVqcABPdgL+H7qJguBw09o
jm6xNIrw2OocrDKsudk/okr/AwqEyPKw9WnMlQgLIKw1rODG2NvU9oR3GVGdMkUB
ZutL8VuFkERQGt6vQ2OCw0sV47VMkuYbacK/xyZFiRcrPJPb41zgbQj9XAEyLKCH
ex0SdDrx+tWUDqG8At2JHA==
-----END CERTIFICATE-----`;

/**
 * Standard Google Hardware Attestation ECDSA P-384 Root Certificate (2026)
 * Serial: 84a9d0297b0eb58ae7ff0e80de760605 | Subject: Key Attestation CA1
 */
export const GOOGLE_ROOT_EC_PEM = `-----BEGIN CERTIFICATE-----
MIICIjCCAaigAwIBAgIRAISp0Cl7DrWK5/8OgN52BgUwCgYIKoZIzj0EAwMwUjEc
MBoGA1UEAwwTS2V5IEF0dGVzdGF0aW9uIENBMTEQMA4GA1UECwwHQW5kcm9pZDET
MBEGA1UECgwKR29vZ2xlIExMQzELMAkGA1UEBhMCVVMwHhcNMjUwNzE3MjIzMjE4
WhcNMzUwNzE1MjIzMjE4WjBSMRwwGgYDVQQDDBNLZXkgQXR0ZXN0YXRpb24gQ0Ex
MRAwDgYDVQQLDAdBbmRyb2lkMRMwEQYDVQQKDApHb29nbGUgTExDMQswCQYDVQQG
EwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABCPaI3FO3z5bBQo8cuiEas4HjqCt
G/mLFfRT0MsIssPBEEU5Cfbt6sH5yOAxqEi5QagpU1yX4HwnGb7OtBYpDTB57uH5
Eczm34A5FNijV3s0/f0UPl7zbJcTx6xwqMIRq6NCMEAwDwYDVR0TAQH/BAUwAwEB
/zAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFFIyuyz7RkOb3NaBqQ5lZuA0QepA
MAoGCCqGSM49BAMDA2gAMGUCMETfjPO/HwqReR2CS7p0ZWoD/LHs6hDi422opifH
EUaYLxwGlT9SLdjkVpz0UUOR5wIxAIoGyxGKRHVTpqpGRFiJtQEOOTp/+s1GcxeY
uR2zh/80lQyu9vAFCj6E4AXc+osmRg==
-----END CERTIFICATE-----`;

// Parsed Google Root Cert info for quick subjectDer matching
let cachedGoogleRsaRoot = null;
let cachedGoogleEcRoot = null;

function getGoogleRsaRoot() {
  if (!cachedGoogleRsaRoot) {
    cachedGoogleRsaRoot = parseCertificatePem(GOOGLE_ROOT_RSA_PEM);
  }
  return cachedGoogleRsaRoot;
}

function getGoogleEcRoot() {
  if (!cachedGoogleEcRoot) {
    cachedGoogleEcRoot = parseCertificatePem(GOOGLE_ROOT_EC_PEM);
  }
  return cachedGoogleEcRoot;
}

/**
 * Cleanly wraps base64 string to 64-character lines RFC standard
 */
export function wrapBase64(b64, lineLength = 64) {
  const clean = b64.replace(/[\s\r\n]+/g, "");
  const lines = [];
  for (let i = 0; i < clean.length; i += lineLength) {
    lines.push(clean.slice(i, i + lineLength));
  }
  return lines.join("\n");
}

/**
 * Standardizes a Certificate PEM block to 64 chars/line with standard headers
 */
export function standardizeCertPem(rawPem) {
  const m = rawPem.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/i)
    || rawPem.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/i);
  
  const b64 = m ? m[1] : rawPem;
  return `-----BEGIN CERTIFICATE-----\n${wrapBase64(b64)}\n-----END CERTIFICATE-----`;
}

/**
 * Standardizes a Private Key PEM block to SEC1 (EC) or PKCS#1 (RSA) with 64 chars/line
 */
export function standardizePrivateKey(rawPem, expectedAlg = "ecdsa") {
  const fixes = [];
  try {
    const pk = createPrivateKey(rawPem.trim());
    const isEc = pk.asymmetricKeyType === "ec";
    const isRsa = pk.asymmetricKeyType === "rsa";

    if (isEc) {
      const exportedSec1 = pk.export({ type: "sec1", format: "pem" }).trim();
      if (/BEGIN PRIVATE KEY/i.test(rawPem)) {
        fixes.push("Converted ECDSA private key from PKCS#8 to standard SEC1 (EC PRIVATE KEY)");
      }
      return {
        pem: exportedSec1,
        algorithm: "ecdsa",
        fixes
      };
    } else if (isRsa) {
      const exportedPkcs1 = pk.export({ type: "pkcs1", format: "pem" }).trim();
      if (/BEGIN PRIVATE KEY/i.test(rawPem)) {
        fixes.push("Converted RSA private key from PKCS#8 to standard PKCS#1 (RSA PRIVATE KEY)");
      }
      return {
        pem: exportedPkcs1,
        algorithm: "rsa",
        fixes
      };
    }
  } catch (err) {
    // If node crypto parser fails, fall back to regex normalization
  }

  // Fallback regex wrap
  let header = "PRIVATE KEY";
  if (/BEGIN EC PRIVATE KEY/i.test(rawPem) || expectedAlg.toLowerCase() === "ecdsa") {
    header = "EC PRIVATE KEY";
  } else if (/BEGIN RSA PRIVATE KEY/i.test(rawPem) || expectedAlg.toLowerCase() === "rsa") {
    header = "RSA PRIVATE KEY";
  }

  const m = rawPem.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/i);
  const b64 = m ? m[1] : rawPem;
  fixes.push(`Formatted private key (${header}) to 64 chars/line`);
  return {
    pem: `-----BEGIN ${header}-----\n${wrapBase64(b64)}\n-----END ${header}-----`,
    algorithm: header.startsWith("EC") ? "ecdsa" : "rsa",
    fixes
  };
}

/**
 * Reorders certificates in a chain:
 * 1. Leaf cert matching private key at index 0
 * 2. Next intermediate matching leaf's issuer
 * 3. Next intermediate matching previous intermediate's issuer
 * 4. Appends Google Attestation Root if missing
 */
export async function reorderAndCompleteChain(privateKeyPem, certificatesPem) {
  const fixes = [];
  const parsedCerts = [];
  
  for (const pem of certificatesPem) {
    try {
      const stdPem = standardizeCertPem(pem);
      const parsed = parseCertificatePem(stdPem);
      parsedCerts.push({ pem: stdPem, parsed });
    } catch (e) {
      fixes.push(`Removed malformed certificate: ${e.message}`);
    }
  }

  if (parsedCerts.length === 0) {
    return { certs: [], fixes };
  }

  // 1. Find leaf certificate by matching public key SPKI DER from private key
  let leafIndex = -1;
  try {
    const priv = createPrivateKey(privateKeyPem.trim());
    const pubDer = createPublicKey(priv).export({ type: "spki", format: "der" });
    const pubBuf = Buffer.from(pubDer);

    leafIndex = parsedCerts.findIndex(c => Buffer.from(c.parsed.spkiDer).equals(pubBuf));
  } catch (e) {
    // Cannot derive public key, fallback to index 0
  }

  if (leafIndex > 0) {
    fixes.push(`Reordered certificate chain: Moved leaf certificate from index ${leafIndex} to index 0`);
  } else if (leafIndex === -1) {
    leafIndex = 0;
  }

  // 2. Build chain forward starting from Leaf
  const orderedChain = [parsedCerts[leafIndex]];
  const remainingCerts = parsedCerts.filter((_, idx) => idx !== leafIndex);

  let current = orderedChain[0];
  while (remainingCerts.length > 0) {
    const currentIssuer = Buffer.from(current.parsed.issuerDer);
    let bestIdx = -1;

    for (let i = 0; i < remainingCerts.length; i++) {
      const cand = remainingCerts[i];
      if (!Buffer.from(cand.parsed.subjectDer).equals(currentIssuer)) continue;

      // Try verifying cryptographic signature
      try {
        const ok = await verifyCertificateSignature(current.parsed, cand.parsed);
        if (ok) {
          bestIdx = i;
          break;
        }
      } catch {}

      // Fallback: check matching algorithm family
      const sigFamily = current.parsed.signatureAlgorithm?.toLowerCase().includes("rsa") ? "rsa" : "ec";
      if (cand.parsed.publicKeyType === sigFamily && bestIdx === -1) {
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      bestIdx = remainingCerts.findIndex(c => Buffer.from(c.parsed.subjectDer).equals(currentIssuer));
    }

    if (bestIdx !== -1) {
      const nextCert = remainingCerts.splice(bestIdx, 1)[0];
      orderedChain.push(nextCert);
      current = nextCert;
      if (Buffer.from(current.parsed.issuerDer).equals(Buffer.from(current.parsed.subjectDer))) {
        break; // Reached self-signed root
      }
    } else {
      break;
    }
  }

  // If there are leftover certificates that didn't chain cleanly, append them
  if (remainingCerts.length > 0) {
    for (const rem of remainingCerts) {
      orderedChain.push(rem);
    }
  }

  // 3. Check if chain terminates at a trusted Google Root
  const lastCert = orderedChain[orderedChain.length - 1];
  const isSelfSigned = Buffer.from(lastCert.parsed.issuerDer).equals(Buffer.from(lastCert.parsed.subjectDer));

  if (!isSelfSigned) {
    const lastIssuerBuf = Buffer.from(lastCert.parsed.issuerDer);
    const googleRsa = getGoogleRsaRoot();
    const googleEc = getGoogleEcRoot();

    if (Buffer.from(googleRsa.subjectDer).equals(lastIssuerBuf)) {
      orderedChain.push({ pem: GOOGLE_ROOT_RSA_PEM, parsed: googleRsa });
      fixes.push("Appended missing Google Hardware Attestation RSA Root Certificate to complete trust chain");
    } else if (Buffer.from(googleEc.subjectDer).equals(lastIssuerBuf)) {
      orderedChain.push({ pem: GOOGLE_ROOT_EC_PEM, parsed: googleEc });
      fixes.push("Appended missing Google Hardware Attestation ECDSA P-384 Root Certificate to complete trust chain");
    }
  }

  return {
    certs: orderedChain.map(c => c.pem),
    fixes
  };
}

/**
 * Fallback extraction of PEM blocks from non-XML text
 */
function extractLoosePemBlocks(text) {
  const privateKeys = [];
  const certs = [];

  const pkRe = /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:EC |RSA )?PRIVATE KEY-----/gi;
  let pkMatch;
  while ((pkMatch = pkRe.exec(text))) {
    privateKeys.push(pkMatch[0].trim());
  }

  const certRe = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gi;
  let certMatch;
  while ((certMatch = certRe.exec(text))) {
    certs.push(certMatch[0].trim());
  }

  return { privateKeys, certs };
}

/**
 * Groups loose certificates by their corresponding private keys using SPKI matching & issuer chaining
 */
async function groupCertsByPrivateKey(privateKeys, rawCerts) {
  const parsedCerts = [];
  for (const c of rawCerts) {
    try {
      const std = standardizeCertPem(c);
      const parsed = parseCertificatePem(std);
      parsedCerts.push({ pem: std, parsed });
    } catch {}
  }

  const keyGroups = [];

  for (const pk of privateKeys) {
    let pubDerBuf = null;
    let isEc = /EC PRIVATE KEY/i.test(pk);

    try {
      const privObj = createPrivateKey(pk.trim());
      isEc = privObj.asymmetricKeyType === "ec";
      const pubDer = createPublicKey(privObj).export({ type: "spki", format: "der" });
      pubDerBuf = Buffer.from(pubDer);
    } catch {}

    let matchingLeafIdx = -1;
    if (pubDerBuf) {
      matchingLeafIdx = parsedCerts.findIndex(c => Buffer.from(c.parsed.spkiDer).equals(pubDerBuf));
    }

    const certChainPems = [];
    if (matchingLeafIdx !== -1) {
      const leaf = parsedCerts[matchingLeafIdx];
      certChainPems.push(leaf.pem);

      // Follow issuer chain with signature verification
      let curr = leaf;
      let remaining = parsedCerts.filter((_, i) => i !== matchingLeafIdx);
      while (remaining.length > 0) {
        const issuerBuf = Buffer.from(curr.parsed.issuerDer);
        let bestIdx = -1;

        for (let i = 0; i < remaining.length; i++) {
          const cand = remaining[i];
          if (!Buffer.from(cand.parsed.subjectDer).equals(issuerBuf)) continue;

          try {
            const ok = await verifyCertificateSignature(curr.parsed, cand.parsed);
            if (ok) {
              bestIdx = i;
              break;
            }
          } catch {}

          const sigFamily = curr.parsed.signatureAlgorithm?.toLowerCase().includes("rsa") ? "rsa" : "ec";
          if (cand.parsed.publicKeyType === sigFamily && bestIdx === -1) {
            bestIdx = i;
          }
        }

        if (bestIdx === -1) {
          bestIdx = remaining.findIndex(c => Buffer.from(c.parsed.subjectDer).equals(issuerBuf));
        }

        if (bestIdx !== -1) {
          const nextCert = remaining.splice(bestIdx, 1)[0];
          certChainPems.push(nextCert.pem);
          curr = nextCert;
          if (Buffer.from(curr.parsed.issuerDer).equals(Buffer.from(curr.parsed.subjectDer))) {
            break; // Reached self-signed root
          }
        } else {
          break;
        }
      }
    } else {
      // Fallback: assign all parsed certs
      for (const c of parsedCerts) {
        certChainPems.push(c.pem);
      }
    }

    keyGroups.push({
      algorithm: isEc ? "ecdsa" : "rsa",
      privateKeyPem: pk,
      declaredCertificateCount: certChainPems.length,
      certificatesPem: certChainPems
    });
  }

  return keyGroups;
}

/**
 * Main Repair and Standardization Engine
 * Repairs broken, modified, non-standard keybox XML files into canonical TrickyStore / Magisk format
 */
export async function repairKeybox(rawInput, trustData = null) {
  const fixesApplied = [];

  if (!rawInput) {
    throw new Error("No keybox data provided for repair");
  }

  // 1. Decode bytes / unpack encodings
  let content = "";
  if (typeof rawInput === "string") {
    content = rawInput.trim();
  } else if (Buffer.isBuffer(rawInput) || rawInput instanceof Uint8Array) {
    content = Buffer.from(rawInput).toString("utf-8").trim();
  } else if (typeof rawInput === "object" && (rawInput.xml || rawInput.xml_content || rawInput.data || rawInput.text)) {
    content = String(rawInput.xml || rawInput.xml_content || rawInput.data || rawInput.text).trim();
  }

  // Strip UTF-8 BOM
  if (content.charCodeAt(0) === 0xFEFF || content.startsWith("\xef\xbb\xbf")) {
    content = content.replace(/^\ufeff/, "").replace(/^\xef\xbb\xbf/, "");
    fixesApplied.push("Stripped UTF-8 Byte Order Mark (BOM)");
  }

  // Strip Windows carriage returns
  if (content.includes("\r\n")) {
    content = content.replace(/\r\n/g, "\n");
    fixesApplied.push("Normalized Windows CRLF line endings to UNIX LF");
  }

  // Strip Markdown code blocks
  if (content.includes("```")) {
    content = content.replace(/```(?:xml|json|text)?/gi, "").replace(/```/g, "").trim();
    fixesApplied.push("Stripped Markdown code block fences");
  }

  // Unpack Base64 / Hex / Scrambled if needed
  if (!content.includes("<AndroidAttestation") && !content.includes("<Keybox") && !content.includes("-----BEGIN")) {
    const normalised = normaliseKeyboxBody(content);
    if (normalised) {
      content = normalised.trim();
      fixesApplied.push("Unpacked encoded body (Base64 / Hex / Scrambled) to XML text");
    }
  }

  // Try parsing XML structure
  let parsed = parseKeyboxXml(content);
  let isLoosePemFallback = false;

  // If standard XML parser found no keyboxes or no keys, try fallback regex
  if (!parsed.keyboxes || parsed.keyboxes.length === 0 || !parsed.keyboxes.some(kb => kb.keys && kb.keys.length > 0)) {
    const loose = extractLoosePemBlocks(content);
    if (loose.privateKeys.length > 0 && loose.certs.length > 0) {
      fixesApplied.push("Reconstructed XML structure from loose PEM cryptographic blocks");
      isLoosePemFallback = true;
      
      const synthesizedKeys = await groupCertsByPrivateKey(loose.privateKeys, loose.certs);

      parsed = {
        declaredKeyboxCount: 1,
        keyboxes: [{
          deviceId: "Android-Attestation-" + Math.random().toString(36).slice(2, 10),
          keys: synthesizedKeys
        }]
      };
    } else {
      throw new Error("Could not parse any valid cryptographic keys or certificates from the provided input");
    }
  }

  // Process keyboxes
  const repairedKeyboxes = [];

  for (const kb of parsed.keyboxes) {
    let deviceId = kb.deviceId;
    if (!deviceId || deviceId === "Unknown" || deviceId === "") {
      deviceId = "Standard-Android-" + Math.random().toString(36).slice(2, 10);
      fixesApplied.push(`Assigned canonical DeviceID: ${deviceId}`);
    }

    const repairedKeys = [];

    for (const key of kb.keys) {
      if (!key.privateKeyPem) continue;

      // 1. Standardize Private Key
      const privResult = standardizePrivateKey(key.privateKeyPem, key.algorithm);
      for (const f of privResult.fixes) {
        if (!fixesApplied.includes(f)) fixesApplied.push(f);
      }

      const canonicalAlg = privResult.algorithm; // "ecdsa" or "rsa"
      if (key.algorithm.toLowerCase() !== canonicalAlg) {
        fixesApplied.push(`Corrected key algorithm attribute from "${key.algorithm}" to "${canonicalAlg}"`);
      }

      // 2. Reorder & Complete Certificate Chain
      const chainResult = await reorderAndCompleteChain(privResult.pem, key.certificatesPem);
      for (const f of chainResult.fixes) {
        if (!fixesApplied.includes(f)) fixesApplied.push(f);
      }

      const actualCertCount = chainResult.certs.length;
      if (key.declaredCertificateCount !== actualCertCount) {
        fixesApplied.push(`Corrected <NumberOfCertificates> from ${key.declaredCertificateCount} to ${actualCertCount}`);
      }

      repairedKeys.push({
        algorithm: canonicalAlg,
        privateKeyPem: privResult.pem,
        certificates: chainResult.certs
      });
    }

    if (repairedKeys.length > 0) {
      repairedKeyboxes.push({
        deviceId,
        keys: repairedKeys
      });
    }
  }

  if (repairedKeyboxes.length === 0) {
    throw new Error("Failed to repair keybox: No valid keys could be processed");
  }

  // Enforce canonical order: "ecdsa" first, then "rsa"
  for (const kb of repairedKeyboxes) {
    kb.keys.sort((a, b) => {
      if (a.algorithm === "ecdsa" && b.algorithm !== "ecdsa") return -1;
      if (a.algorithm !== "ecdsa" && b.algorithm === "ecdsa") return 1;
      return 0;
    });
  }

  // Build Canonical XML output
  const now = new Date().toISOString();
  const primaryDeviceId = repairedKeyboxes[0].deviceId;
  
  let xml = `<?xml version="1.0"?>
<!--
================================================================================
 Keybox Hub | Play Integrity & Attestation Engine
 Tổng hợp & Chuẩn hóa bởi / Aggregated & Repaired by: https://keybox.hzzmonet.io.vn
 Device ID: ${primaryDeviceId}
 Repaired: ${now}
 Modules Supported: TrickyStore, PlayIntegrityFork, APatch, KernelSU, Magisk
================================================================================
-->
<AndroidAttestation>
    <NumberOfKeyboxes>${repairedKeyboxes.length}</NumberOfKeyboxes>
`;

  for (const kb of repairedKeyboxes) {
    xml += `    <Keybox DeviceID="${kb.deviceId}">\n`;
    for (const k of kb.keys) {
      xml += `        <Key algorithm="${k.algorithm}">\n`;
      xml += `            <PrivateKey format="pem">\n`;
      xml += k.privateKeyPem + "\n";
      xml += `            </PrivateKey>\n`;
      xml += `            <CertificateChain>\n`;
      xml += `                <NumberOfCertificates>${k.certificates.length}</NumberOfCertificates>\n`;
      for (const cert of k.certificates) {
        xml += `                <Certificate format="pem">\n`;
        xml += cert + "\n";
        xml += `                </Certificate>\n`;
      }
      xml += `            </CertificateChain>\n`;
      xml += `        </Key>\n`;
    }
    xml += `    </Keybox>\n`;
  }

  xml += `  <!-- Tổng hợp bởi Keybox Hub (https://keybox.hzzmonet.io.vn) -->\n</AndroidAttestation>`;

  fixesApplied.push("Formatted XML with canonical 4-space indentation and TrickyStore tags");

  // Run full analysis if trust data provided
  let analysis = null;
  if (trustData) {
    try {
      analysis = await analyzeKeybox(xml, trustData);
    } catch (err) {
      console.warn("[Repairer] Post-repair analysis warning:", err.message);
    }
  }

  return {
    success: true,
    repairedXml: xml,
    fixesApplied,
    deviceId: primaryDeviceId,
    summary: {
      keyboxCount: repairedKeyboxes.length,
      deviceId: primaryDeviceId,
      keys: repairedKeyboxes[0].keys.map(k => ({
        algorithm: k.algorithm,
        certCount: k.certificates.length
      }))
    },
    analysis
  };
}
