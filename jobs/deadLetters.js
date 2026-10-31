import { deadLetterDb } from "@/db/deadLetter.db";
import { inngest } from "@/lib/inngest";

/**
 * Every run of every function that failed for good (retries exhausted, NonRetriableError) or was
 * cancelled (timeouts.start) lands in ops.dead_letters, next to dead outbox rows.
 */
export const deadLetterSink = inngest.createFunction(
    {
        id: "dead-letter-sink",
        triggers: [{ event: "inngest/function.failed" }, { event: "inngest/function.cancelled" }],
        retries: 5,
    },
    async ({ event, step }) => {
        const { function_id: functionId, run_id: runId, error, event: original } = event.data || {};
        if (String(functionId || "").endsWith("dead-letter-sink")) return { skipped: true };
        await step.run("record", () => deadLetterDb.record({
            source: "inngest",
            kind: event.name === "inngest/function.cancelled" ? `${functionId}:cancelled` : functionId,
            ref: runId,
            payload: original ?? null,
            error: error?.message || error?.name || null,
        }));
        return { recorded: runId };
    }
);
