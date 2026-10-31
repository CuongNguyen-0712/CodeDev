import { accountPurgeDb } from "@/db/accountPurge.db";
import { auditAuth } from "@/lib/authAudit";
import { dispatchAuthOutbox } from "@/services/authOutbox.service";
import { emailVerificationService } from "@/services/emailVerification.service";

/**
 * Daily job for unverified accounts (docs/email-verification-plan.md 11.2, 12): one reminder 2 days
 * before the lock, one 2 days before deletion, then permanent deletion. Run by the cron route
 * (POST|GET /api/internal/account-maintenance) and by the in-process outbox worker.
 * `dryRun` reports what would be deleted and changes nothing. Never throws.
 */
export async function runAccountMaintenance({ dryRun = false, limit = 50 } = {}) {
    const report = { dryRun, reminded: 0, purged: 0, wouldPurge: [], skipped: [], failed: 0 };

    try {
        if (!dryRun) {
            for (const userId of await accountPurgeDb.claimLockReminders({ limit })) {
                if (await emailVerificationService.remind(userId, "lock")) report.reminded += 1;
            }
            for (const userId of await accountPurgeDb.claimReminders({ limit })) {
                if (await emailVerificationService.remind(userId, "purge")) report.reminded += 1;
            }
        }

        for (const userId of await accountPurgeDb.listDue({ limit })) {
            try {
                const result = await accountPurgeDb.purgeUser({ userPublicId: userId, dryRun });
                if (result.status === "would_purge") report.wouldPurge.push({ userId, files: result.files });
                if (result.status === "skipped") {
                    report.skipped.push({ userId, reason: result.reason });
                    console.warn(`[account-maintenance] kept ${userId} past its deadline (${result.reason}): check by hand`);
                }
                if (result.status === "purged") {
                    report.purged += 1;
                    auditAuth("account.purged", { userId, reason: "never_verified", count: result.files });
                    await dispatchAuthOutbox(result.outboxIds);
                }
            } catch (error) {
                report.failed += 1;
                console.error(`[account-maintenance] purge of ${userId} failed:`, error?.message);
            }
        }
    } catch (error) {
        console.error("[account-maintenance] failed:", error?.message);
    }

    return report;
}

export default runAccountMaintenance;
