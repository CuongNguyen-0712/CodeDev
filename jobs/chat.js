import { inngest } from "@/lib/inngest";
import { pushToUsers } from "@/lib/beams";
import { remove } from "@/lib/chatMedia";
import { chatService } from "@/services/chat.service";

const MAX_BATCHES = 20;

/** Web push for a message, once per user and conversation a minute after the last one; it says what is still unread then. */
export const chatPush = inngest.createFunction(
    {
        id: "chat-push",
        triggers: [{ event: "chat/message.created" }],
        debounce: { key: "event.data.userId + ':' + event.data.conversationId", period: "60s" },
        retries: 3,
    },
    async ({ event, step }) => {
        const { userId, conversationId } = event.data;
        return step.run("push", async () => {
            const summary = await chatService.pushSummary({ userId, conversationId });
            if (!summary) return { skipped: true };
            await pushToUsers([userId], summary);
            return { sent: true };
        });
    }
);

/** Retries chat attachment deletes that failed after commit, each through its own provider. Throws when any item still fails, so Inngest runs it again. */
export const chatAttachmentDelete = inngest.createFunction(
    { id: "chat-attachment-delete", triggers: [{ event: "chat/attachment.delete" }], retries: 5 },
    async ({ event, step }) => {
        const items = event.data?.items ?? [];
        // Every item is tried even if one fails; a failed step is retried by Inngest, and the run throws if any stays failed.
        const results = await Promise.allSettled(items.map((item, i) => step.run(`delete-${i}`, () => remove(item))));
        if (results.some((r) => r.status === "rejected")) throw new Error("Could not delete every chat file");
        return { deleted: items.length };
    }
);

/** Hourly: deletes uploads never attached to a message. Small batches: the purge holds a transaction across its remote deletes. */
export const chatOrphanAttachments = inngest.createFunction(
    { id: "chat-orphan-attachments", triggers: [{ cron: "20 * * * *" }], concurrency: 1 },
    async ({ step }) => {
        let removed = 0;
        for (let batch = 0; batch < MAX_BATCHES; batch++) {
            const report = await step.run(`batch-${batch}`, () => chatService.purgeOrphanAttachments({ limit: 50 }));
            removed += report.removed;
            if (report.removed === 0) break;
        }
        return { removed };
    }
);
