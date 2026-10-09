import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export const ENV_NAMES = ["KEYBOX_ADMIN_PASSWORD", "KEYBOX_WEBHOOK_URL", "KEYBOX_WEBHOOK_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];

// Temp cwd with data/ and a public/ dir; clears notification env. Call restore() when done.
export function isolate(prefix = "keybox-test-") {
  const cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const env = Object.fromEntries(ENV_NAMES.map(n => [n, process.env[n]]));
  mkdirSync(join(dir, "data"));
  mkdirSync(join(dir, "public"));
  for (const n of ENV_NAMES) delete process.env[n];
  process.chdir(dir);
  return {
    dir,
    restore() {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
      for (const n of ENV_NAMES) {
        if (env[n] === undefined) delete process.env[n];
        else process.env[n] = env[n];
      }
    }
  };
}

function openssl(...args) {
  execFileSync("openssl", args, { stdio: "ignore" });
}

// Self-signed single-cert keybox. Returns { xml, certPem, keyPem, serial }.
export function makeKeybox({ alg = "rsa", serial, deviceId = `dev-${serial}`, cn = `Test ${serial}`, privateKey = "own" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "keybox-fixture-"));
  try {
    const gen = a => {
      const key = join(dir, `${a}-${Math.random().toString(36).slice(2)}.pem`);
      if (a === "ec") openssl("genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", key);
      else openssl("genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", key);
      return key;
    };
    const keyFile = gen(alg);
    const certFile = join(dir, "cert.pem");
    openssl("req", "-x509", "-new", "-key", keyFile, "-days", "2", "-set_serial", String(serial), "-subj", `/CN=${cn}`, "-out", certFile);
    const certPem = readFileSync(certFile, "utf8");
    const keyPem = readFileSync(keyFile, "utf8");
    const other = privateKey === "mismatch" ? readFileSync(gen(alg), "utf8") : keyPem;
    const keyXml = privateKey === "missing" ? "" : `<PrivateKey format="pem">${privateKey === "malformed" ? "-----BEGIN PRIVATE KEY-----\nnot-base64!!\n-----END PRIVATE KEY-----" : other}</PrivateKey>`;
    const xml = `<?xml version="1.0"?><AndroidAttestation><NumberOfKeyboxes>1</NumberOfKeyboxes>
<Keybox DeviceID="${deviceId}"><Key algorithm="${alg === "ec" ? "ecdsa" : "rsa"}">${keyXml}
<CertificateChain><NumberOfCertificates>1</NumberOfCertificates><Certificate format="pem">${certPem}</Certificate></CertificateChain>
</Key></Keybox></AndroidAttestation>`;
    return { xml, certPem, keyPem, serial, deviceId };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Trust data that explicitly trusts the given certs as production roots (test only).
export function trustFor(...certPems) {
  return {
    roots: certPems.map((pem, i) => ({ id: `test_root_${i}`, label: `Test root ${i}`, kind: "google_hardware", level: "trusted", pem })),
    status: { entries: {} }
  };
}

export function revoke(trust, serial) {
  trust.status.entries[String(serial)] = { status: "REVOKED" };
  return trust;
}
