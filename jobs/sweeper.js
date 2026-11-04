import { sessionDb } from "@/db/session.db";
import { inngest, outboxViaInngest } from "@/lib/inngest";
import { publishAuthOutbox } from "@/services/authOutbox.service";
import { adminUserService } from "@/services/adminUser.service";
import { announcementService } from "@/services/announcement.service";
import { challengeService } from "@/services/challenge.service";

/**
 * Every hour, in one step (each step is a billed execution):
 *   - code runs stuck long past their deadline end as cancelled / timeout;
 *   - queued runs and outbox rows whose Inngest event never went out are sent again;
 *   - suspensions that ended are lifted (identity.users.status_until);
 *   - scheduled announcements that are overdue (their event never went out) are queued again.
 * On the hour like ranking-refresh, so the database wakes once: every query keeps a Neon Free
 * compute awake for 5 minutes, and a 5-10 minute cron would use the monthly CU-hours in days.
 */
export const sweeper = inngest.createFunction(
    { id: "sweeper", triggers: [{ cron: "0 * * * *" }], concurrency: 1, retries: 1 },
    async ({ step }) => step.run("sweep", async () => {
        const codeRuns = await challengeService.sweepCodeRuns();
        let outbox = 0;
        if (outboxViaInngest()) {
            const ids = await sessionDb.listStaleOutbox();
            await publishAuthOutbox(ids);
            outbox = ids.length;
        }
        const suspensionsLifted = await adminUserService.liftEndedSuspensions();
        const announcements = await announcementService.sweepOverdue();
        return { ...codeRuns, outbox, suspensionsLifted, announcements };
    })
);
