import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSiteSettings, initSiteSettings, saveSiteSettings, validateSiteSettings } from "../src/site-settings.js";

const originalCwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "keybox-site-settings-"));
process.chdir(dir);

 test("site settings defaults, persist and validate bounds", () => {
  const defaults = initSiteSettings();
  assert.equal(defaults.intervals.browser_seconds, 60);
  assert.throws(() => validateSiteSettings({ ...defaults, intervals: { ...defaults.intervals, check_minutes: 4 } }));
  for (const [card_opacity, background_dim, card_blur] of [[0, 0, 0], [1, 1, 100]]) {
    const appearance = { ...defaults.appearance, card_opacity, background_dim, card_blur };
    assert.deepEqual(saveSiteSettings({ ...defaults, appearance }).appearance, appearance);
    assert.deepEqual(initSiteSettings().appearance, appearance);
  }
  for (const [field, value] of [['card_opacity', -0.01], ['card_opacity', 1.01], ['background_dim', -0.01], ['background_dim', 1.01], ['card_blur', -1], ['card_blur', 101], ['card_blur', null]]) {
    assert.throws(() => validateSiteSettings({ ...defaults, appearance: { ...defaults.appearance, [field]: value } }));
  }
  const legacyAppearance = { ...defaults.appearance };
  delete legacyAppearance.card_blur;
  assert.equal(validateSiteSettings({ ...defaults, appearance: legacyAppearance }).appearance.card_blur, 24);
  assert.throws(() => validateSiteSettings({ ...defaults, media: { ...defaults.media, desktop_url: "http://example.com/bg.png" } }));
  assert.equal(validateSiteSettings({ ...defaults, media: { ...defaults.media, desktop_url: "/images/bg.jpg" } }).media.desktop_url, "/images/bg.jpg");
  for (const desktop_url of ['//example.com/bg.jpg', '/images/../data/site-settings.json', '/data/site-settings.json']) {
    assert.throws(() => validateSiteSettings({ ...defaults, media: { ...defaults.media, desktop_url } }));
  }
  assert.throws(() => validateSiteSettings({ ...defaults, appearance: { ...defaults.appearance, accent: 123 } }));
  const input = { ...defaults, appearance: { ...defaults.appearance, mode: "light", unexpected: "not persisted" }, unexpected: "not persisted" };
  const saved = saveSiteSettings(input);
  assert.equal(saved.appearance.mode, "light");
  assert.equal(saved.unexpected, undefined);
  assert.equal(saved.appearance.unexpected, undefined);
  assert.equal(getSiteSettings().appearance.mode, "light");
});

test.after(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});
