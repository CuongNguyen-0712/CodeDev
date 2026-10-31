import { codeRunDb } from "@/db/codeRun.db";
import { sessionDb } from "@/db/session.db";
import { cleanupAuthState } from "@/services/authOutbox.service";

const BATCH = 1000;
const MAX_BATCHES = 20;

async function drain(purge) {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
        const changed = await purge({ limit: BATCH });
        total += changed;
        if (changed < BATCH) break;
    }
    return total;
}

/**
 * Daily housekeeping of tables that only grow: auth state (recovery blobs, outbox, email tokens),
 * ended sessions with their refresh tokens, and old code runs. Batched so no statement holds
 * locks for long; whatever is left goes in the next run.
 */
export async function runRetention() {
    const report = { auth: await cleanupAuthState(), sessionsDeleted: 0, codeRunsCleaned: 0 };
    try {
        report.sessionsDeleted = await drain(sessionDb.purgeEnded);
        report.codeRunsCleaned = await drain(codeRunDb.purgeOld);
    } catch (error) {
        console.error("[retention] failed:", error?.message);
    }
    return report;
}
