import { inngest } from "@/lib/inngest";
import { runAccountMaintenance } from "@/services/accountMaintenance.service";
import { cleanupAuthState } from "@/services/authOutbox.service";
import { auditSummary, runExpAudit } from "@/services/expAudit.service";

const MAX_BATCHES = 20; // 50 accounts each: 1,000 a night is far above today's volume

/**
 * Unverified-account reminders and purges, then auth housekeeping (was vercel.json at 03:00).
 * One step per batch of 50, so the work is never cut by a function's maxDuration.
 */
export const accountMaintenance = inngest.createFunction(
    { id: "account-maintenance", triggers: [{ cron: "0 3 * * *" }], concurrency: 1, retries: 2 },
    async ({ step }) => {
        const totals = { reminded: 0, purged: 0, failed: 0 };
        for (let batch = 0; batch < MAX_BATCHES; batch++) {
            const report = await step.run(`batch-${batch}`, () => runAccountMaintenance({ limit: 50 }));
            totals.reminded += report.reminded;
            totals.purged += report.purged;
            totals.failed += report.failed;
            if (report.reminded + report.purged === 0) break;
        }
        await step.run("cleanup", () => cleanupAuthState());
        return totals;
    }
);

/** Daily EXP reconciliation report (was vercel.json at 03:30). Reports and logs only. */
export const expAudit = inngest.createFunction(
    { id: "exp-audit", triggers: [{ cron: "30 3 * * *" }], concurrency: 1, retries: 2 },
    async ({ step }) => step.run("audit", async () => {
        const data = await runExpAudit();
        const summary = auditSummary(data);
        if (summary.startsWith("flagged")) console.warn(`[exp-audit] ${summary}`, JSON.stringify(data));
        else console.info(`[exp-audit] ${summary}`);
        return { summary };
    })
);
