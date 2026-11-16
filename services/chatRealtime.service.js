import { chatDb } from "@/db/chat.db";
import { redis } from "@/lib/cache";
import { INLINE_PAYLOAD_BYTES } from "@/lib/chat/limits";
import { publish } from "@/lib/pusher";
import { channels, events } from "@/lib/realtime";

const MEMBER_TTL_SECONDS = 60;
const NOT_ALLOWED = "no"; // cached so a non-member's typing pings do not hit the DB either

const fits = (payload) => Buffer.byteLength(JSON.stringify(payload), "utf8") <= INLINE_PAYLOAD_BYTES;
const toChannels = (publicIds) => publicIds.map(channels.user);

/** Realtime is best effort: a failed publish is logged and never reaches the caller. */
async function send(publicIds, event, data, socketId) {
    if (!publicIds.length) return false;
    try {
        return await publish(toChannels(publicIds), event, data, { socketId: socketId || undefined });
    } catch (error) {
        console.error(`[chatRealtime ${event}]`, error);
        return false;
    }
}

async function typingAudience(userId, conversationId) {
    const key = `chat:member:${userId}:${conversationId}`;
    const cached = await redis.get(key);
    if (cached !== null && cached !== undefined) return Array.isArray(cached) ? cached : null;

    const mine = await chatDb.membership(null, { conversationId, userId });
    let audience = null;
    if (mine?.state === "accepted") {
        audience = (await chatDb.members(null, mine.id))
            .filter((m) => m.public_id !== userId && !m.left_at && m.state !== "declined")
            .map((m) => m.public_id);
    }
    await redis.set(key, audience ?? NOT_ALLOWED, { ex: MEMBER_TTL_SECONDS });
    return audience;
}

export const chatRealtime = {
    messageCreated: async ({ message, preview, recipients, senderId, socketId, conversation }) => {
        const conversationId = message.conversationId;
        const conversationKind = conversation?.kind;
        // What the new-message toast names: the team, or the sender.
        const title = conversationKind === "team" ? conversation.teamName : message.sender.nickname || message.sender.username;
        const inline = { conversationId, conversationKind, title, message, preview };
        const payload = fits(inline)
            ? inline : { conversationId, conversationKind, title, messageId: message.id, preview, seq: message.seq, senderId: message.sender.id, createdAt: message.createdAt };
        const pending = recipients.filter((r) => r.state === "pending").map((r) => r.publicId);
        const accepted = recipients.filter((r) => r.state !== "pending").map((r) => r.publicId);
        const sends = [send([...accepted, senderId], events.CHAT_MESSAGE, payload, socketId)];
        // A pending recipient (a stranger's request) is told only that a request moved: no name, preview, message or sender.
        if (pending.length) {
            const request = { conversationId, messageId: message.id, seq: message.seq, createdAt: message.createdAt, toRequest: true };
            sends.push(send(pending, events.CHAT_MESSAGE, request, socketId));
        }
        return (await Promise.all(sends)).every(Boolean);
    },

    messageUpdated: ({ message, preview, recipients, senderId, socketId }) => {
        const conversationId = message.conversationId;
        const inline = { conversationId, message, preview };
        const payload = fits(inline) ? inline : { conversationId, messageId: message.id };
        return send([...recipients.map((r) => r.publicId), senderId], events.CHAT_MESSAGE_UPDATED, payload, socketId);
    },

    /** A reaction was added or removed; every accepted member gets it, minus the toggling tab's socket. */
    reactionChanged: ({ conversationId, messageId, emoji, userId, added, members, socketId }) =>
        send(members, events.CHAT_REACTION, { conversationId, messageId, emoji, userId, added }, socketId),

    // `others` is empty for a pending reader, so no receipt leaks. The reader's own channel is added so
    // their other tabs and devices clear the row and the badge.
    read: ({ conversationId, userId, seq, others }) =>
        send([...others, userId], events.CHAT_READ, { conversationId, userId, seq }),

    conversationUpdated: ({ conversationId, members }) =>
        send(members, events.CHAT_CONVERSATION_UPDATED, { conversationId }),

    /** Fire and forget: returns false (never throws) when the caller may not type here, else true. */
    typing: async ({ userId, conversationId, socketId }) => {
        try {
            const audience = await typingAudience(userId, conversationId);
            if (!audience) return false;
            // Rule 2: true even when nobody was published to, so an empty (declined) audience looks like a pending one.
            await send(audience, events.CHAT_TYPING, { conversationId, userId }, socketId);
            return true;
        } catch (error) {
            console.error("[chatRealtime typing]", error);
            return false;
        }
    },
};

/** Called once by chat.service (which this module must not import, to avoid a cycle). */
export function installChatRealtime(chatService) {
    // A reply that accepted a request also refreshes the other members' detail (composer, canSend), as an accept does.
    chatService.afterSend = async ({ message, preview, recipients, acceptedByReply, conversation }, { socketId } = {}) => {
        const sent = await chatRealtime.messageCreated({ message, preview, recipients, senderId: message.sender.id, socketId, conversation });
        if (acceptedByReply) await chatRealtime.conversationUpdated({ conversationId: message.conversationId, members: recipients.map((r) => r.publicId) });
        return sent;
    };

    chatService.afterUpdate = ({ message, preview, recipients }, { socketId } = {}) =>
        chatRealtime.messageUpdated({ message, preview, recipients, senderId: message.sender.id, socketId });

    chatService.afterReaction = ({ conversationId, messageId, emoji, userId, added, members }, { socketId } = {}) =>
        chatRealtime.reactionChanged({ conversationId, messageId, emoji, userId, added, members, socketId });

    chatService.afterRead = ({ conversationId, userId, lastReadSeq, others }) =>
        chatRealtime.read({ conversationId, userId, seq: lastReadSeq, others });

    // Rule 2: a decline is silent; only an accept tells the other members.
    chatService.afterRespond = ({ conversationId, state, others }) =>
        state === "accepted" ? chatRealtime.conversationUpdated({ conversationId, members: others }) : undefined;

    // The member who joined or left is told too, so their own inbox refreshes.
    chatService.afterMembership = async ({ conversationId, userId }) => {
        const conversation = await chatDb.lockByPublicId(null, conversationId); // outside a transaction, so the lock is released at once
        const members = conversation ? (await chatDb.members(null, conversation.id)).filter((m) => !m.left_at && m.state !== "declined").map((m) => m.public_id) : [];
        return chatRealtime.conversationUpdated({ conversationId, members: [...new Set([...members, userId])] });
    };
}
