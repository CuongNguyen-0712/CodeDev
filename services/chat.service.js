import { ulid } from "ulid";

import { chatDb } from "@/db/chat.db";
import { chatMediaKey, inspect as inspectMedia, remove as removeMedia, signRead, signUpload } from "@/lib/chatMedia";
import {
    MAX_BODY, MAX_ATTACHMENTS, MAX_IMAGE_BYTES, IMAGE_TYPES, ORPHAN_BATCH, ORPHAN_MAX_AGE_MINUTES,
    EDIT_WINDOW_MS, INBOX_PAGE, MESSAGE_PAGE, PUSH_PREVIEW_CHARS,
} from "@/lib/chat/limits";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { decodeCursor, encodeCursor, pageOf } from "@/lib/keysetCursor";
import { reportSchema } from "@/lib/validation/blog";

const CONVERSATION_ID = /^cnv_[0-9a-z]{26}$/;
const ATTACHMENT_ID = /^att_[0-9a-z]{26}$/;
const MESSAGE_ID = /^msg_[0-9a-z]{26}$/;
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEQ = /^[1-9]\d{0,18}$/;

const badRequest = (message) => new ApiError(message, 400);
const conversationNotFound = () => new ApiError("Conversation not found", 404);
const refused = () => new ApiError("You can't send messages in this conversation", 403);

function checkId(id, pattern, what) {
    if (typeof id !== "string" || !pattern.test(id)) throw badRequest(`Invalid ${what} id`);
}

const badAttachment = () => new ApiError("Invalid attachment", 422);
const dimension = (v) => v === undefined || v === null ? null : Number.isInteger(v) && v > 0 && v <= 20000 ? v : undefined;

/** Distinct, well-formed attachment ids (at most MAX_ATTACHMENTS), or 422. */
function attachmentIdList(value) {
    if (!Array.isArray(value)) throw badAttachment();
    const list = [...new Set(value)];
    if (list.length > MAX_ATTACHMENTS) throw new ApiError(`At most ${MAX_ATTACHMENTS} images per message`, 422);
    if (!list.every((id) => typeof id === "string" && ATTACHMENT_ID.test(id))) throw badAttachment();
    return list;
}

/**
 * Checks the caller's unsent uploads in storage before the send transaction, so no row lock is held during
 * network I/O. A missing file, another type or a larger size drops the upload and fails the send; ownership,
 * conversation and "not yet sent" are decided later under the conversation lock.
 */
async function verifyUploads(userId, ids) {
    const me = await chatDb.userByPublicId(null, userId);
    if (!me) throw conversationNotFound();
    for (const row of await chatDb.unsentUploads(null, { uploaderDbId: me.id, ids })) {
        const found = await inspectMedia(row.storage_key);
        if (found && found.contentType === row.content_type && found.size <= row.size_bytes) continue;
        try {
            await removeMedia(row.storage_key);
        } catch (error) {
            console.error("[chat.send remove]", row.storage_key, error);
        }
        await chatDb.deleteAttachments(null, [row.id]);
        throw new ApiError("The uploaded image is invalid", 422);
    }
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

/** Locks the conversation, then returns it with its members and the caller's live membership (404 otherwise). */
async function lockedMember(client, userId, conversationId) {
    checkId(conversationId, CONVERSATION_ID, "conversation");
    const me = await chatDb.userByPublicId(client, userId);
    const conversation = await chatDb.lockByPublicId(client, conversationId);
    if (!me || !conversation) throw conversationNotFound();
    const members = await chatDb.members(client, conversation.id);
    const mine = members.find((m) => m.user_id === me.id && !m.left_at);
    if (!mine) throw conversationNotFound();
    return { me, conversation, members, mine };
}

const othersOf = (members, mine) => members.filter((m) => m !== mine && !m.left_at);

/** Runs a post-commit hook; its failure is logged and never changes the action's result. */
async function after(hook, ...args) {
    try {
        await chatService[hook](...args);
    } catch (error) {
        console.error(`[chat.${hook}]`, error);
    }
}

/** Edit and recall: lock the message's conversation, then check the message is the caller's own (unless an admin recalls). */
async function lockedMessage(client, { userId, messageId, byAdmin = false }) {
    checkId(messageId, MESSAGE_ID, "message");
    const first = await chatDb.messageRef(client, { messageId, windowMs: EDIT_WINDOW_MS });
    if (!first) throw new ApiError("Message not found", 404);
    const conversation = await chatDb.lockByPublicId(client, first.conversation_id);
    const members = await chatDb.members(client, conversation.id);
    // Re-read under the lock: an unsend may have committed while we waited.
    const ref = await chatDb.messageRef(client, { messageId, windowMs: EDIT_WINDOW_MS });
    const me = members.find((m) => m.public_id === userId && !m.left_at);
    if (!byAdmin && (!me || ref.sender_id !== me.user_id)) throw new ApiError("Message not found", 404);
    const recipients = members.filter((m) => m.user_id !== ref.sender_id && !m.left_at && m.state !== "declined").map((m) => ({ publicId: m.public_id, state: m.state }));
    return { ref, recipients };
}

async function blockTarget(userId, targetId) {
    const me = await chatDb.userByPublicId(null, userId);
    const target = typeof targetId === "string" ? await chatDb.userByPublicId(null, targetId) : null;
    return { me, target };
}

export const chatService = {
    /** Replaced by the realtime tasks; called after commit, errors are logged. */
    afterRead: async () => { },
    afterUpdate: async () => { },
    afterRespond: async () => { },
    afterMembership: async () => { },

    /** Replaced by the realtime / push tasks; called after commit for new messages only, errors are logged. */
    afterSend: async () => { },

    send: async ({ userId, conversationId, toUserId, clientId, body, attachmentIds = [], socketId = null }) => {
        if (!conversationId === !toUserId) throw badRequest("Give either a conversation or a recipient");
        if (conversationId) checkId(conversationId, CONVERSATION_ID, "conversation");
        if (typeof clientId !== "string" || !CLIENT_ID.test(clientId)) throw badRequest("Invalid client id");
        if (typeof body !== "string") throw new ApiError("Message is empty", 422);
        if ([...body].length > MAX_BODY) throw new ApiError(`A message can be at most ${MAX_BODY} characters`, 422);
        const attachments = attachmentIdList(attachmentIds ?? []);
        if (!body.trim() && !attachments.length) throw new ApiError("Message is empty", 422);
        if (attachments.length) await verifyUploads(userId, attachments);

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

            // Rule: a request (pending) conversation carries no images.
            if (attachments.length && members.some((m) => !m.left_at && m.state === "pending")) throw new ApiError("Images can't be sent in a message request", 422);

            const publicId = `msg_${ulid().toLowerCase()}`;
            const inserted = await chatDb.insertMessage(client, { publicId, conversationDbId: conversation.id, senderDbId: me.id, clientId, body });
            if (inserted && attachments.length) {
                const claimed = await chatDb.claimAttachments(client, { ids: attachments, uploaderDbId: me.id, conversationDbId: conversation.id, messageDbId: inserted.id });
                if (claimed !== attachments.length) throw badAttachment(); // rolls the message back too
            }
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

    createUpload: async ({ userId, conversationId, contentType, size, width, height }) => {
        if (!IMAGE_TYPES.includes(contentType)) throw new ApiError("Only JPEG, PNG and WebP images are allowed", 422);
        if (!Number.isInteger(size) || size < 1 || size > MAX_IMAGE_BYTES) throw new ApiError(`An image can be at most ${MAX_IMAGE_BYTES} bytes`, 422);
        const [w, h] = [dimension(width), dimension(height)];
        if (w === undefined || h === undefined) throw new ApiError("Invalid image dimensions", 422);
        return withTransaction(async (client) => {
            const { me, conversation, members } = await lockedMember(client, userId, conversationId);
            if (members.some((m) => !m.left_at && m.state === "pending")) throw new ApiError("Images can't be sent in a message request", 422);
            const attachmentId = `att_${ulid().toLowerCase()}`;
            // Ids here are server-made public ids, never client input.
            const key = chatMediaKey({ conversationId: conversation.public_id, attachmentId, contentType });
            const upload = await signUpload(key, { contentType, size });
            await chatDb.insertAttachment(client, { publicId: attachmentId, conversationDbId: conversation.id, uploaderDbId: me.id, storageKey: key, contentType, size, width: w, height: h });
            return { attachmentId, upload };
        });
    },

    attachmentReadUrl: async ({ userId, attachmentId }) => {
        if (typeof attachmentId !== "string" || !ATTACHMENT_ID.test(attachmentId)) throw new ApiError("Attachment not found", 404);
        const key = await chatDb.attachmentKey(null, { attachmentId, userId });
        if (!key) throw new ApiError("Attachment not found", 404);
        return (await signRead(key)).url;
    },

    /** Deletes uploads never attached to a message; a row goes only after its file is gone, so a failed delete is retried next run. */
    purgeOrphanAttachments: async ({ limit = ORPHAN_BATCH } = {}) => withTransaction(async (client) => {
        const gone = [];
        for (const row of await chatDb.lockOrphans(client, { minutes: ORPHAN_MAX_AGE_MINUTES, limit })) {
            try {
                await removeMedia(row.storage_key);
                gone.push(row.id);
            } catch (error) {
                console.error("[chat.purge remove]", row.storage_key, error);
            }
        }
        if (gone.length) await chatDb.deleteAttachments(client, gone);
        return { removed: gone.length };
    }),

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
            // Rule 2: the sender is not told about a decline, so others see a declined member as pending.
            members: live.map((m) => ({
                id: m.public_id, username: m.username, nickname: m.nickname, image: m.image,
                state: m !== me && m.state === "declined" ? "pending" : m.state,
                // Rule 2: a pending (or declined) member leaks no read receipts.
                lastReadSeq: m !== me && m.state !== "accepted" ? "0" : m.last_read_seq,
            })),
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

    markRead: async ({ userId, conversationId, seq }) => {
        if (!SEQ.test(String(seq))) throw badRequest("Invalid seq");
        const result = await withTransaction(async (client) => {
            const { me, conversation, members, mine } = await lockedMember(client, userId, conversationId);
            const { before, after: lastReadSeq } = await chatDb.advanceRead(client, { conversationDbId: conversation.id, userDbId: me.id, seq: String(seq) });
            return {
                changed: BigInt(lastReadSeq) > BigInt(before), lastReadSeq,
                others: mine.state === "accepted" ? othersOf(members, mine).map((m) => m.public_id) : [],
            };
        });
        if (result.changed) await after("afterRead", { ...result, conversationId, userId });
        return result;
    },

    editMessage: async ({ userId, messageId, body, socketId = null }) => {
        if (typeof body !== "string" || !body.trim()) throw new ApiError("Message is empty", 422);
        if ([...body].length > MAX_BODY) throw new ApiError(`A message can be at most ${MAX_BODY} characters`, 422);
        const result = await withTransaction(async (client) => {
            const { ref, recipients } = await lockedMessage(client, { userId, messageId });
            if (ref.deleted || ref.expired) throw refused();
            await chatDb.editBody(client, { messageDbId: ref.id, body });
            return { message: messageDto(await chatDb.messageById(client, messageId)), recipients };
        });
        await after("afterUpdate", result, { socketId });
        return result;
    },

    recallMessage: async ({ userId, messageId, byAdmin = false, socketId = null }) => {
        const result = await withTransaction(async (client) => {
            const { ref, recipients } = await lockedMessage(client, { userId, messageId, byAdmin });
            const removedKeys = ref.deleted ? [] : await chatDb.recall(client, ref.id);
            return { message: messageDto(await chatDb.messageById(client, messageId)), recipients, removedKeys };
        });
        // Files go after commit; a failed delete is logged (a retry event comes with the realtime tasks).
        for (const key of result.removedKeys) {
            try {
                await removeMedia(key);
            } catch (error) {
                console.error("[chat.recall remove]", key, error);
            }
        }
        await after("afterUpdate", result, { socketId });
        return result;
    },

    respondRequest: async ({ userId, conversationId, accept }) => {
        const result = await withTransaction(async (client) => {
            const { me, conversation, members, mine } = await lockedMember(client, userId, conversationId);
            let state = mine.state;
            if (state === "pending") {
                state = accept ? "accepted" : "declined";
                await chatDb.setState(client, { conversationDbId: conversation.id, userDbId: me.id, state });
            }
            return { state, others: othersOf(members, mine).map((m) => m.public_id) };
        });
        await after("afterRespond", { ...result, conversationId, userId });
        return result;
    },

    block: async ({ userId, targetId }) => {
        const { me, target } = await blockTarget(userId, targetId);
        if (!me || !target) throw new ApiError("User not found", 404);
        if (me.id === target.id) throw badRequest("You can't block yourself");
        await chatDb.addBlock(null, { blockerDbId: me.id, blockedDbId: target.id });
        return { blocked: true };
    },

    unblock: async ({ userId, targetId }) => {
        const { me, target } = await blockTarget(userId, targetId);
        if (me && target) await chatDb.removeBlock(null, { blockerDbId: me.id, blockedDbId: target.id });
        return { blocked: false };
    },

    listBlocks: async ({ userId }) => ({ items: await chatDb.listBlocks(userId) }),

    report: async ({ userId, messageId, reason }) => {
        checkId(messageId, MESSAGE_ID, "message");
        const parsed = reportSchema.safeParse({ reason });
        if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
        const message = await chatDb.messageForMember(null, { messageId, userId });
        if (!message) throw new ApiError("Message not found", 404);
        if (message.sender_id === userId) throw badRequest("You can't report your own message");
        const [me, ref] = await Promise.all([chatDb.userByPublicId(null, userId), chatDb.messageRef(null, { messageId, windowMs: 0 })]);
        if (!await chatDb.addReport(null, { messageDbId: ref.id, reporterDbId: me.id, reason: parsed.data.reason })) throw new ApiError("You already reported this message", 409);
        return { reported: true };
    },

    ensureTeamConversation: async (teamId) => {
        if (typeof teamId !== "string" || !await chatDb.teamExists(null, teamId)) throw new ApiError("Team not found", 404);
        return { id: await chatDb.ensureTeam(null, { publicId: `cnv_${ulid().toLowerCase()}`, teamId }) };
    },

    syncTeamMember: async (teamId, userPublicId, event) => {
        if (event !== "joined" && event !== "left") throw badRequest("Invalid membership event");
        const conversationId = await withTransaction(async (client) => {
            const user = await chatDb.userByPublicId(client, userPublicId);
            const conversation = await chatDb.lockByTeamId(client, teamId);
            if (!user || !conversation) throw new ApiError("Team conversation not found", 404);
            const change = { conversationDbId: conversation.id, userDbId: user.id };
            await (event === "joined" ? chatDb.joinTeam(client, change) : chatDb.leaveTeam(client, change));
            return conversation.public_id;
        });
        await after("afterMembership", { conversationId, userId: userPublicId, event });
    },
};
