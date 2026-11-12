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

/** One chat/message.created per accepted recipient (requests get none); the id makes a retried send a no-op. */
const queuePush = ({ message, recipients }) => sendEvents(
    recipients.filter((r) => r.state === "accepted").map((r) => ({
        id: `chat-msg-${message.id}-${r.publicId}`,
        name: "chat/message.created",
        data: { userId: r.publicId, conversationId: message.conversationId, seq: message.seq },
    })),
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
