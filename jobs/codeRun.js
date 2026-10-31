import { NonRetriableError } from "inngest";

import { inngest } from "@/lib/inngest";
import { sandboxSlots } from "@/lib/challenges/codeRunner";
import { challengeService } from "@/services/challenge.service";

/**
 * Grades one queued run (challenge.code_runs, event `code/run.requested`).
 * Concurrency: each sandbox runs at most its slot count, each learner one run at a time; the rest
 * waits in Inngest's queue without holding a function. Run (`manual`) jumps ahead of Submit.
 * A run that does not start within 3 minutes is cancelled; the sweeper ends its row.
 */
export const codeRun = inngest.createFunction(
    {
        id: "code-run",
        triggers: [{ event: "code/run.requested" }],
        idempotency: "event.data.runId",
        concurrency: [
            { key: "event.data.sandbox", limit: sandboxSlots() },
            { key: "event.data.userId", limit: 1 },
        ],
        priority: { run: "event.data.kind == 'manual' ? 60 : 0" },
        timeouts: { start: "3m" },
        retries: 2,
        onFailure: async ({ event, error }) => {
            await challengeService.failCodeRun(event.data.event.data.runId, error?.message);
        },
    },
    async ({ event, step }) => {
        const runId = event.data?.runId;
        if (!runId) throw new NonRetriableError("code/run.requested without a runId");

        const executed = await step.run("execute", () => challengeService.executeCodeRun(runId));
        if (executed.status !== "graded") return executed;
        return step.run("finalize", () => challengeService.finalizeCodeRun(runId));
    }
);
