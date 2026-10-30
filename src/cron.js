import { trustManager } from "./trust-manager.js";
import { recheckAllKeysInDb, cleanupOldBannedKeys } from "./db.js";
import { fetchAndLootThirdPartySources } from "./source-fetcher.js";

let checkIntervalMs = 60 * 60 * 1000;
let lootIntervalMs = 60 * 60 * 1000;
let checkTimer = null;
let lootTimer = null;
let checking = false;
let looting = false;

export function configureIntervals({ check_minutes, loot_minutes }) {
  checkIntervalMs = check_minutes * 60 * 1000;
  lootIntervalMs = loot_minutes * 60 * 1000;
  if (checkTimer) { clearInterval(checkTimer); checkTimer = setInterval(runScheduledCheck, checkIntervalMs); }
  if (lootTimer) { clearInterval(lootTimer); lootTimer = setInterval(runScheduledLoot, lootIntervalMs); }
}

async function runScheduledCheck() {
  if (checking) return;
  checking = true;
  try { const trustData = await trustManager.refreshTrustData(true); await recheckAllKeysInDb(trustData); }
  catch (err) { console.error("[Cron] Check failed:", err.message); }
  finally { checking = false; }
}

async function runScheduledLoot() {
  if (looting) return;
  looting = true;
  try { const trustData = await trustManager.refreshTrustData(true); await fetchAndLootThirdPartySources(trustData); }
  catch (err) { console.error("[Cron] Loot failed:", err.message); }
  finally { looting = false; }
}

export async function runFullHourlyCycle() {
  console.log("[Cron] Running 1-hour cycle: Google CRL update -> DB keybox recheck -> 3rd-party source loot -> purge revoked keys...");
  try {
    // 1. Fetch freshest Google attestation status & roots
    const trustData = await trustManager.refreshTrustData(true);

    // 2. Re-verify all existing keyboxes in database (purges revoked keys immediately)
    await recheckAllKeysInDb(trustData);

    // 3. Fetch from 3rd-party sources, test, and loot Strong keys (skip duplicates)
    await fetchAndLootThirdPartySources(trustData);

    // 4. Clean up any remaining banned keys
    cleanupOldBannedKeys();

    console.log("[Cron] 1-hour cycle successfully completed.");
  } catch (err) {
    console.error("[Cron] Error during hourly cycle:", err.message);
  }
}

export function startPeriodicCheck() {
  console.log(`[Cron] Initializing periodic 1-hour check & 3rd-party auto-looter...`);

  // Run initial check and loot after a short delay.
  setTimeout(() => {
    runScheduledCheck();
    runScheduledLoot();
  }, 5000);

  // Set recurring 1-hour interval
  checkTimer = setInterval(runScheduledCheck, checkIntervalMs);
  lootTimer = setInterval(runScheduledLoot, lootIntervalMs);
}
