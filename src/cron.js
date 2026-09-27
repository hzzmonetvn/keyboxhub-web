import { trustManager } from "./trust-manager.js";
import { recheckAllKeysInDb, cleanupOldBannedKeys } from "./db.js";
import { fetchAndLootThirdPartySources } from "./source-fetcher.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function runFullHourlyCycle() {
  console.log("[Cron] Running 1-hour cycle: Google CRL update -> DB keybox recheck -> 3rd-party source loot -> 24h purge...");
  try {
    // 1. Fetch freshest Google attestation status & roots
    const trustData = await trustManager.refreshTrustData(true);

    // 2. Re-verify all existing keyboxes in database
    await recheckAllKeysInDb(trustData);

    // 3. Fetch from 3rd-party sources, test, and loot Strong keys (skip duplicates)
    await fetchAndLootThirdPartySources(trustData);

    // 4. Clean up banned keys older than 24 hours
    cleanupOldBannedKeys();

    console.log("[Cron] 1-hour cycle successfully completed.");
  } catch (err) {
    console.error("[Cron] Error during hourly cycle:", err.message);
  }
}

export function startPeriodicCheck() {
  console.log(`[Cron] Initializing periodic 1-hour check & 3rd-party auto-looter...`);

  // Run on startup after short delay (5 seconds)
  setTimeout(() => {
    runFullHourlyCycle().catch(err => console.error("[Cron] Startup cycle error:", err));
  }, 5000);

  // Set recurring 1-hour interval
  setInterval(() => {
    runFullHourlyCycle().catch(err => console.error("[Cron] Scheduled cycle error:", err));
  }, CHECK_INTERVAL_MS);
}
