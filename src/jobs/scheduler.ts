import cron from "node-cron";
import { processDueAllowances } from "./allowance.job";
import { processSavingsInterest } from "./interest.job";
import { runPayPalReconciliation } from "./reconciliation.job";
import { runWeeklyDigestJob } from "./weekly-digest.job";

const globalForCron = globalThis as unknown as {
  goodspendCronInitialized?: boolean;
};

/**
 * Initializes persistent in-process background cron jobs on Render / local Node server
 * when ENABLE_IN_PROCESS_CRON="true" (NFR-14).
 */
export function initInProcessCronJobs() {
  if (process.env.ENABLE_IN_PROCESS_CRON !== "true") {
    return;
  }

  if (globalForCron.goodspendCronInitialized) {
    return;
  }

  globalForCron.goodspendCronInitialized = true;

  // Run allowance check every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      await processDueAllowances();
    } catch (err) {
      console.error("[Cron Error - Allowances]:", err);
    }
  });

  // Run savings compounding interest check daily at 01:00 UTC (FR-6.4)
  cron.schedule("0 1 * * *", async () => {
    try {
      await processSavingsInterest();
    } catch (err) {
      console.error("[Cron Error - Savings Interest]:", err);
    }
  });

  // Run daily PayPal ledger reconciliation at 02:00 UTC (INT-4)
  cron.schedule("0 2 * * *", async () => {
    try {
      await runPayPalReconciliation();
    } catch (err) {
      console.error("[Cron Error - PayPal Reconciliation]:", err);
    }
  });

  // Run weekly Parent Digest every Sunday at 08:00 UTC (FR-10.4)
  cron.schedule("0 8 * * 0", async () => {
    try {
      await runWeeklyDigestJob();
    } catch (err) {
      console.error("[Cron Error - Weekly Digest]:", err);
    }
  });
}
