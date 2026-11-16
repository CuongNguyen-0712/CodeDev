import { inngest, inngestEnabled } from "@/lib/inngest";

/**
 * Inngest events for chat. Lives beside chatRealtime.service (not in jobs/chat.js, which imports
 * chat.service) so chat.service can import it without a cycle. Sends are best effort: a failure is
 * logged and never reaches the action.
 */
async function sendEvents(events, label) {
    if (!events.length || !inngestEnabled()) return;
    try {
        await inngest.send(events);
    } catch (error) {
        console.error(`[chatJobs ${label}]`, error?.message);
    }
}

/** Failed file deletes after commit, as `{ kind, provider, storageKey }` only (no file names in a third party's history): Inngest retries them (chat/attachment.delete). */
export const queueAttachmentDelete = (items) => sendEvents(items.length ? [{ name: "chat/attachment.delete", data: { items } }] : [], "attachment.delete");

/** One event per recipient, in one send: chat/message.created for accepted ones, chat/request.created (ids only, the push names nobody) for pending ones; the ids make a retried send a no-op. */
const queuePush = ({ message, recipients }) => sendEvents(
    recipients.flatMap((r) => {
        if (r.state === "accepted") return [{ id: `chat-msg-${message.id}-${r.publicId}`, name: "chat/message.created", data: { userId: r.publicId, conversationId: message.conversationId, seq: message.seq } }];
        if (r.state === "pending") return [{ id: `chat-req-${message.conversationId}-${r.publicId}`, name: "chat/request.created", data: { userId: r.publicId, conversationId: message.conversationId } }];
        return [];
    }),
    "message.created"
);

/** Composes with the realtime hook: runs it, then queues the push; neither leg skips the other. */
export function installChatJobs(chatService) {
    const previousSend = chatService.afterSend;
    chatService.afterSend = async (...args) => {
        try {
            await previousSend(...args);
        } catch (error) {
            console.error("[chat.afterSend realtime]", error);
        }
        await queuePush(...args); // never throws
    };
}
