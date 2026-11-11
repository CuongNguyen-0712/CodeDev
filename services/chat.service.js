import { ulid } from "ulid";

import { chatDb } from "@/db/chat.db";
import { MAX_BODY, INBOX_PAGE, MESSAGE_PAGE, PUSH_PREVIEW_CHARS } from "@/lib/chat/limits";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { decodeCursor, encodeCursor, pageOf } from "@/lib/keysetCursor";

const CONVERSATION_ID = /^cnv_[0-9a-z]{26}$/;
const MESSAGE_ID = /^msg_[0-9a-z]{26}$/;
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEQ = /^[1-9]\d{0,18}$/;

const badRequest = (message) => new ApiError(message, 400);
const conversationNotFound = () => new ApiError("Conversation not found", 404);
const refused = () => new ApiError("You can't send messages in this conversation", 403);

function checkId(id, pattern, what) {
    if (typeof id !== "string" || !pattern.test(id)) throw badRequest(`Invalid ${what} id`);
}

const directKey = (a, b) => (BigInt(a) < BigInt(b) ? `${a}:${b}` : `${b}:${a}`);

const messageDto = (row) => ({
    id: row.id, seq: row.seq, conversationId: row.conversation_id, clientId: row.client_id,
    sender: { id: row.sender_id, username: row.sender_username, nickname: row.sender_nickname, image: row.sender_image },
    body: row.body, attachments: row.attachments, createdAt: row.created_at, editedAt: row.edited_at, deleted: row.deleted,
});

function preview(row) {
    if (row.last_deleted) return "This message was unsent";
    if (row.last_body.includes("```")) return "[code]";
    if (!row.last_body.trim() && row.last_has_image) return "[image]";
    return [...row.last_body].slice(0, PUSH_PREVIEW_CHARS).join("");
}

const conversationItem = (row) => ({
    id: row.id, kind: row.kind, title: row.title, image: row.image, state: row.state,
    lastMessage: row.last_seq ? { seq: row.last_seq, preview: preview(row), senderId: row.last_sender_id, createdAt: row.last_created_at } : null,
    lastMessageAt: row.last_message_at, unread: row.unread,
});

/**
 * Rules 2-3 for a direct conversation: the other member must still exist, be active, not have
 * declined, not be blocked either way, and while they are pending the sender gets one message.
 * Team members who have not left can always send.
 */
async function sendRefused(client, conversation, me, members) {
    if (conversation.kind !== "direct") return false;
    const other = members.find((m) => m.user_id !== me.user_id);
    if (!other || other.status !== "active" || other.state === "declined") return true;
    if (await chatDb.isBlocked(client, me.user_id, other.user_id)) return true;
    return other.state === "pending" && chatDb.hasSent(client, { conversationDbId: conversation.id, senderDbId: me.user_id });
}

/** Finds (or, rules 1 and 3, creates) the direct conversation with `toUserId`, locked for this transaction. */
async function lockDirect(client, me, toUserId) {
    const other = typeof toUserId === "string" ? await chatDb.userByPublicId(client, toUserId) : null;
    if (!other || other.id === me.id) throw new ApiError("User not found", 404);
    const key = directKey(me.id, other.id);
    const existing = await chatDb.lockByDirectKey(client, key);
    if (existing) return existing;
    if (other.status !== "active" || !other.show_profile) throw new ApiError("User not found", 404);
    if (await chatDb.isBlocked(client, me.id, other.id)) throw refused();
    const otherState = (await chatDb.areClose(client, me.id, other.id)) ? "accepted" : "pending";
    // A concurrent first message may win the insert; either way the row is locked below.
    await chatDb.insertDirect(client, {
        publicId: `cnv_${ulid().toLowerCase()}`, directKey: key,
        members: [{ userId: me.id, state: "accepted" }, { userId: other.id, state: otherState }],
    });
    return chatDb.lockByDirectKey(client, key);
}

/** The caller's live membership of `conversationId`, or 404. */
async function memberOf(userId, conversationId) {
    checkId(conversationId, CONVERSATION_ID, "conversation");
    const conversation = await chatDb.membership(null, { conversationId, userId });
    if (!conversation) throw conversationNotFound();
    return conversation;
}

export const chatService = {
    /** Replaced by the realtime / push tasks; called after commit for new messages only, errors are logged. */
    afterSend: async () => { },

    send: async ({ userId, conversationId, toUserId, clientId, body, attachmentIds = [], socketId = null }) => {
        if (!conversationId === !toUserId) throw badRequest("Give either a conversation or a recipient");
        if (conversationId) checkId(conversationId, CONVERSATION_ID, "conversation");
        if (typeof clientId !== "string" || !CLIENT_ID.test(clientId)) throw badRequest("Invalid client id");
        if (typeof body !== "string") throw new ApiError("Message is empty", 422);
        if ([...body].length > MAX_BODY) throw new ApiError(`A message can be at most ${MAX_BODY} characters`, 422);
        // shortcut: attachments arrive with the attachment task; until then an empty body is always refused.
        if (!body.trim()) throw new ApiError("Message is empty", 422);

        const result = await withTransaction(async (client) => {
            const me = await chatDb.userByPublicId(client, userId);
            if (!me) throw conversationNotFound();
            const conversation = conversationId ? await chatDb.lockByPublicId(client, conversationId) : await lockDirect(client, me, toUserId);
            if (!conversation) throw conversationNotFound();
            const members = await chatDb.members(client, conversation.id);
            const mine = members.find((m) => m.user_id === me.id && !m.left_at);
            if (!mine) throw conversationNotFound();

            const finish = async (messageId, created) => ({
                message: messageDto(await chatDb.messageForMember(client, { messageId, userId })),
                created,
                conversation: { id: conversation.public_id, kind: conversation.kind },
                recipients: members.filter((m) => m.user_id !== me.id && !m.left_at && m.state !== "declined").map((m) => ({ publicId: m.public_id, state: m.state })),
            });
            // A retried clientId returns the message it already created, before the rules that it already passed.
            const duplicate = (sent) => {
                if (sent.conversation_id !== conversation.id) throw new ApiError("This client id was used for another conversation", 409);
                return finish(sent.public_id, false);
            };
            const earlier = await chatDb.messageByClientId(client, { senderDbId: me.id, clientId });
            if (earlier) return duplicate(earlier);
            if (await sendRefused(client, conversation, mine, members)) throw refused();

            const publicId = `msg_${ulid().toLowerCase()}`;
            const inserted = await chatDb.insertMessage(client, { publicId, conversationDbId: conversation.id, senderDbId: me.id, clientId, body });
            return inserted ? finish(publicId, true) : duplicate(await chatDb.messageByClientId(client, { senderDbId: me.id, clientId }));
        });

        if (result.created) {
            try {
                await chatService.afterSend(result, { socketId });
            } catch (error) {
                console.error("[chat.afterSend]", error);
            }
        }
        return result;
    },

    listConversations: async ({ userId, tab = "all", cursor = null }) => {
        if (tab !== "all" && tab !== "requests") throw badRequest("Invalid tab");
        const rows = await chatDb.listConversations({
            userId, state: tab === "all" ? "accepted" : "pending", cursor: decodeCursor(cursor, CONVERSATION_ID), limit: INBOX_PAGE + 1,
        });
        const { items, nextCursor } = pageOf(rows, INBOX_PAGE, (last) => encodeCursor(last.cursor_at, last.cursor_id));
        return { items: items.map(conversationItem), nextCursor };
    },

    getConversation: async ({ userId, conversationId }) => {
        const conversation = await memberOf(userId, conversationId);
        const members = await chatDb.members(null, conversation.id);
        const live = members.filter((m) => !m.left_at);
        const me = live.find((m) => m.public_id === userId);
        const other = conversation.kind === "direct" ? members.find((m) => m !== me) : null;
        return {
            id: conversation.public_id, kind: conversation.kind,
            title: other ? (other.nickname || other.username) : conversation.team_name ?? null,
            image: other ? other.image : conversation.team_image ?? null,
            state: conversation.state,
            canSend: !(await sendRefused(null, conversation, me, members)),
            members: live.map((m) => ({ id: m.public_id, username: m.username, nickname: m.nickname, image: m.image, state: m.state, lastReadSeq: m.last_read_seq })),
        };
    },

    listMessages: async ({ userId, conversationId, before = null }) => {
        if (before !== null && before !== undefined && !SEQ.test(String(before))) throw badRequest("Invalid cursor");
        const conversation = await memberOf(userId, conversationId);
        const rows = await chatDb.listMessages({ conversationDbId: conversation.id, before, limit: MESSAGE_PAGE + 1 });
        const { items, nextCursor } = pageOf(rows, MESSAGE_PAGE, (last) => last.seq);
        return { items: items.map(messageDto), nextCursor };
    },

    getMessage: async ({ userId, messageId }) => {
        checkId(messageId, MESSAGE_ID, "message");
        const row = await chatDb.messageForMember(null, { messageId, userId });
        if (!row) throw new ApiError("Message not found", 404);
        return messageDto(row);
    },

    unreadCounts: async ({ userId }) => chatDb.unreadCounts(userId),
};
