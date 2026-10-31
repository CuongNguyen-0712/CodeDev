import { sessionDb } from "@/db/session.db";
import { inngest, outboxViaInngest } from "@/lib/inngest";
import { publishAuthOutbox } from "@/services/authOutbox.service";
import { challengeService } from "@/services/challenge.service";

/**
 * Every 10 minutes, in one step (each step is a billed execution):
 *   - code runs stuck long past their deadline end as cancelled / timeout;
 *   - queued runs and outbox rows whose Inngest event never went out are sent again.
 */
export const sweeper = inngest.createFunction(
    { id: "sweeper", triggers: [{ cron: "*/10 * * * *" }], concurrency: 1, retries: 1 },
    async ({ step }) => step.run("sweep", async () => {
        const codeRuns = await challengeService.sweepCodeRuns();
        let outbox = 0;
        if (outboxViaInngest()) {
            const ids = await sessionDb.listStaleOutbox();
            await publishAuthOutbox(ids);
            outbox = ids.length;
        }
        return { ...codeRuns, outbox };
    })
);
