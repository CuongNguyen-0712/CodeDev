import { NonRetriableError } from "inngest";

import { inngest } from "@/lib/inngest";
import { BATCH, announcementService } from "@/services/announcement.service";

const MAX_BATCHES = 1000;

/**
 * Copies one admin announcement into its recipients' inboxes (event `announcement/send`).
 * Waits until `sendAt` when scheduled; a cancel in the meantime makes `start` return nothing.
 * One step per batch of 1,000 users, so a retry resumes where it stopped and never doubles a
 * copy (unique user_id, kind, dedupe_key).
 */
export const announcementSend = inngest.createFunction(
    {
        id: "announcement-send",
        triggers: [{ event: "announcement/send" }],
        concurrency: [{ key: "event.data.id", limit: 1 }],
        retries: 3,
    },
    async ({ event, step }) => {
        const id = event.data?.id;
        if (!id) throw new NonRetriableError("announcement/send without an id");

        const sendAt = event.data?.sendAt;
        if (sendAt && new Date(sendAt).getTime() > Date.now()) await step.sleepUntil("wait-until-due", sendAt);

        const announcement = await step.run("start", () => announcementService.startSending(id));
        if (!announcement) return { skipped: true };

        let afterId = "0";
        for (let i = 0; i < MAX_BATCHES; i++) {
            const batch = await step.run(`batch-${i}`, () => announcementService.deliverBatch(announcement, afterId));
            afterId = batch.lastId;
            if (batch.selected < BATCH) break;
        }
        return step.run("finish", () => announcementService.finish(id));
    }
);
