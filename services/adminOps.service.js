import { adminDb } from "@/db/admin.db";
import { adminOpsDb } from "@/db/adminOps.db";
import { adminRunDb } from "@/db/adminRun.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { inngest, inngestEnabled } from "@/lib/inngest";
import { healthReport } from "@/services/health.service";

/**
 * System page (docs/admin-panel-plan.md 05): health, the code-run queue, the outbox, dead letters
 * and the database, plus resolve / retry for dead letters (what `npm run dlq` does).
 * Dead letter payloads never leave the server (they can hold personal data).
 */
export const adminOpsService = {
    overview: async () => {
        const [health, queue, outbox, deadLetters, database] = await Promise.all([
            healthReport(),
            adminRunDb.queue(),
            adminOpsDb.outbox(),
            adminOpsDb.deadLetters({ open: true, limit: 50 }),
            adminOpsDb.database(),
        ]);
        return {
            health,
            queue,
            outbox,
            deadLetters,
            database: { ...database, tables: database.tables.map((row) => ({ ...row, bytes: Number(row.bytes), rows: Number(row.rows) })) },
            grafanaUrl: process.env.GRAFANA_URL || null,
        };
    },

    resolve: async ({ actor, id, reason, ip = null }) => withTransaction(async (client) => {
        const letter = await adminOpsDb.lockDeadLetter(client, id);
        if (!letter) throw new ApiError("This dead letter is already resolved", 409);
        await adminOpsDb.resolveDeadLetter(client, { id, resolution: reason });
        await adminDb.audit(client, { actorId: actor.id, action: "dead_letter.resolve", targetType: "dead_letter", targetId: id, reason, ip });
        return { id, resolved: true };
    }),

    retry: async ({ actor, id, reason, ip = null }) => {
        let event = null;
        const result = await withTransaction(async (client) => {
            const letter = await adminOpsDb.lockDeadLetter(client, id);
            if (!letter) throw new ApiError("This dead letter is already resolved", 409);

            if (letter.source === "outbox") {
                await adminOpsDb.requeueOutbox(client, { outboxId: letter.ref });
            } else if (String(letter.kind).includes("code-run")) {
                throw new ApiError("A code run is not retried: the learner runs it again (no attempt was used). Resolve it instead.", 422);
            } else if (letter.payload?.name) {
                if (!inngestEnabled()) throw new ApiError("Inngest is not configured here, so the event cannot be sent again", 422);
                // A new id: Inngest deduplicates the original one for 24 hours.
                const { id: _oldId, ts: _ts, ...original } = letter.payload;
                event = original;
            } else {
                throw new ApiError("This dead letter has no event to send again", 422);
            }

            await adminOpsDb.resolveDeadLetter(client, { id, resolution: `retried: ${reason}` });
            await adminDb.audit(client, { actorId: actor.id, action: "dead_letter.retry", targetType: "dead_letter", targetId: id, reason, ip });
            return { id, retried: true };
        });
        // After commit: if sending fails again, Inngest reports it as a new dead letter.
        if (event) await inngest.send(event);
        return result;
    },
};
