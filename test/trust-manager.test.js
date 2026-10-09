import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { isolate } from "../test-support/fixtures.js";

let env;
let tm;

before(async () => {
  env = isolate("keybox-trust-");
  ({ trustManager: tm } = await import("../src/trust-manager.js"));
});
after(() => env.restore());

const entries = [
  { serial: "aaa1", source: "t", version: "1" },
  { serial: "bbb2", revoked: true, source: "t", version: "1" },
  { serial: "ccc3", softbanned: true, source: "t", version: "1" }
];

test("revoked leaf wins regardless of order", () => {
  tm.updateSpecterIndex(entries);
  for (const order of [["aaa1", "bbb2"], ["bbb2", "aaa1"], ["ccc3", "bbb2"], ["bbb2", "ccc3"]]) {
    const r = tm.checkSpecterStatus(order);
    assert.equal(r.isRevoked, true, order.join());
    assert.equal(r.entry.serial, "bbb2");
  }
});

test("softban beats plain match; no match is clean", () => {
  tm.updateSpecterIndex(entries);
  assert.equal(tm.checkSpecterStatus(["aaa1", "ccc3"]).isSoftbanned, true);
  assert.equal(tm.checkSpecterStatus(["ccc3", "aaa1"]).isSoftbanned, true);
  const none = tm.checkSpecterStatus(["zzz9"]);
  assert.equal(none.matched, false);
  assert.equal(none.isRevoked, false);
});

test("leading-zero serials match", () => {
  tm.updateSpecterIndex(entries);
  assert.equal(tm.checkSpecterStatus(["00bbb2"]).isRevoked, true);
});

test("refresh failure rejects and keeps existing roots", async t => {
  const before = tm.trustData.roots;
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  await assert.rejects(() => tm.refreshTrustData(true));
  assert.equal(tm.trustData.roots, before);
});
