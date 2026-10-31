import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const defaults = {
  appearance: { mode: "dark", accent: "#7c5cff", card_opacity: 0.92, background_dim: 0.35, card_blur: 24 },
  media: { desktop_url: "", desktop_type: "image", desktop_poster: "", mobile_url: "", mobile_type: "image", mobile_poster: "", music_url: "", music_volume: 0.5 },
  intervals: { check_minutes: 60, loot_minutes: 60, browser_seconds: 60 },
  rate_limits: {
    download: { max: 60, window_seconds: 60 }, upload: { max: 10, window_seconds: 60 },
    operations: { max: 3, window_seconds: 60 }, login: { max: 5, window_seconds: 60 }, report: { max: 10, window_seconds: 60 }
  }
};
let settings = structuredClone(defaults);
let settingsPath;

function number(value, min, max) { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function mediaUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  if (!value) return true;
  if (/^\/(images|media)\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').includes('..')) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}

export function validateSiteSettings(input) {
  if (!isPlainObject(input) || !isPlainObject(input.appearance) || !isPlainObject(input.media) || !isPlainObject(input.intervals) || !isPlainObject(input.rate_limits)) throw new Error("Invalid settings");
  const { appearance, media, intervals, rate_limits: rateLimits } = input;
  const cardBlur = appearance.card_blur === undefined ? defaults.appearance.card_blur : appearance.card_blur;
  if (!("dark" === appearance.mode || "light" === appearance.mode) || typeof appearance.accent !== "string" || !/^#[0-9a-fA-F]{6}$/.test(appearance.accent) || !number(appearance.card_opacity, 0, 1) || !number(appearance.background_dim, 0, 1) || !number(cardBlur, 0, 100)) throw new Error("Invalid appearance settings");
  if (!["desktop", "mobile"].every(kind => mediaUrl(media[`${kind}_url`]) && mediaUrl(media[`${kind}_poster`])) || !["image", "video"].includes(media.desktop_type) || !["image", "video"].includes(media.mobile_type) || !mediaUrl(media.music_url) || !number(media.music_volume, 0, 1)) throw new Error("Invalid media settings");
  if (!number(intervals.check_minutes, 5, 1440) || !number(intervals.loot_minutes, 5, 1440) || !number(intervals.browser_seconds, 15, 3600)) throw new Error("Invalid intervals");
  if (!["download", "upload", "operations", "login", "report"].every(name => {
    const limit = rateLimits[name];
    return isPlainObject(limit) && Number.isInteger(limit.max) && limit.max >= 1 && limit.max <= (name === "login" ? 20 : 10000) && Number.isInteger(limit.window_seconds) && limit.window_seconds >= 10 && limit.window_seconds <= 3600;
  })) throw new Error("Invalid rate limits");
  return {
    appearance: {
      mode: appearance.mode, accent: appearance.accent, card_opacity: appearance.card_opacity, background_dim: appearance.background_dim, card_blur: cardBlur
    },
    media: {
      desktop_url: media.desktop_url, desktop_type: media.desktop_type, desktop_poster: media.desktop_poster,
      mobile_url: media.mobile_url, mobile_type: media.mobile_type, mobile_poster: media.mobile_poster,
      music_url: media.music_url, music_volume: media.music_volume
    },
    intervals: {
      check_minutes: intervals.check_minutes, loot_minutes: intervals.loot_minutes, browser_seconds: intervals.browser_seconds
    },
    rate_limits: Object.fromEntries(["download", "upload", "operations", "login", "report"].map(name => [name, {
      max: rateLimits[name].max, window_seconds: rateLimits[name].window_seconds
    }]))
  };
}

export function initSiteSettings() {
  settingsPath = join(process.cwd(), "data", "site-settings.json");
  settings = existsSync(settingsPath) ? validateSiteSettings(JSON.parse(readFileSync(settingsPath, "utf8"))) : structuredClone(defaults);
  if (!existsSync(settingsPath)) saveSiteSettings(settings);
  return getSiteSettings();
}
export function getSiteSettings() { return structuredClone(settings); }
export function saveSiteSettings(input) {
  const next = validateSiteSettings(input);
  if (!settingsPath) settingsPath = join(process.cwd(), "data", "site-settings.json");
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(next, null, 2), { mode: 0o600 });
  chmodSync(tempPath, 0o600);
  renameSync(tempPath, settingsPath);
  settings = next;
  return getSiteSettings();
}
