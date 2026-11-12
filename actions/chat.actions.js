'use server';

import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import {
    chatReportSchema, editMessageSchema, markReadSchema, parseChat, recallSchema,
    respondSchema, sendMessageSchema, targetSchema, typingSchema, uploadSchema,
} from "@/lib/validation/chat";
import { chatService } from "@/services/chat.service";
import { chatRealtime } from "@/services/chatRealtime.service";

// userId always comes from the session via runAction, never from client input.
const asObject = (input, key) => (typeof input === "string" ? { [key]: input } : input);

// Send a message: { conversationId | toUserId, clientId, body, attachmentIds?, socketId? } -> { message, conversation }.
export async function sendMessageAction(input) {
    return runAction(async ({ userId }) => {
        const { message, conversation } = await chatService.send({ userId, ...parseChat(sendMessageSchema, input) });
        return { message, conversation };
    }, { limiter: rateLimiters.chatSend, context: "sendMessageAction" });
}

// Edit an own message: { messageId, body, socketId? }.
export async function editMessageAction(input) {
    return runAction(
        async ({ userId }) => ({ message: (await chatService.editMessage({ userId, ...parseChat(editMessageSchema, input) })).message }),
        { limiter: rateLimiters.chatSend, context: "editMessageAction" }
    );
}

// Unsend an own message: messageId or { messageId, socketId? }. byAdmin is never set from the client.
export async function recallMessageAction(input) {
    return runAction(async ({ userId }) => {
        const { messageId, socketId } = parseChat(recallSchema, asObject(input, "messageId"));
        return { message: (await chatService.recallMessage({ userId, messageId, socketId })).message };
    }, { limiter: rateLimiters.chatSend, context: "recallMessageAction" });
}

// Mark read up to a message: { conversationId, seq }.
export async function markReadAction(input) {
    return runAction(
        async ({ userId }) => ({ lastReadSeq: (await chatService.markRead({ userId, ...parseChat(markReadSchema, input) })).lastReadSeq }),
        { limiter: rateLimiters.chatRead, context: "markReadAction" }
    );
}

// Typing ping: conversationId or { conversationId, socketId? } -> { ok }. "Not allowed" is ok: false, never an error.
export async function typingAction(input) {
    return runAction(async ({ userId }) => {
        const ok = await chatRealtime.typing({ userId, ...parseChat(typingSchema, asObject(input, "conversationId")) });
        return { ok: Boolean(ok) };
    }, { limiter: rateLimiters.chatTyping, context: "typingAction" });
}

// Accept or decline a message request: { conversationId, accept }.
export async function respondRequestAction(input) {
    return runAction(
        async ({ userId }) => ({ state: (await chatService.respondRequest({ userId, ...parseChat(respondSchema, input) })).state }),
        { limiter: rateLimiters.chatSend, context: "respondRequestAction" }
    );
}

// Presign an image upload: { conversationId, contentType, size, width, height }.
export async function createChatUploadAction(input) {
    return runAction(
        async ({ userId }) => chatService.createUpload({ userId, ...parseChat(uploadSchema, input) }),
        { limiter: rateLimiters.chatUpload, context: "createChatUploadAction" }
    );
}

export async function blockUserAction(targetId) {
    return runAction(
        async ({ userId }) => chatService.block({ userId, targetId: parseChat(targetSchema, { userId: targetId }).userId }),
        { limiter: rateLimiters.chatSend, context: "blockUserAction" }
    );
}

export async function unblockUserAction(targetId) {
    return runAction(
        async ({ userId }) => chatService.unblock({ userId, targetId: parseChat(targetSchema, { userId: targetId }).userId }),
        { limiter: rateLimiters.chatSend, context: "unblockUserAction" }
    );
}

// Report a message to moderators: { messageId, reason }.
export async function reportMessageAction(input) {
    return runAction(
        async ({ userId }) => chatService.report({ userId, ...parseChat(chatReportSchema, input) }),
        { limiter: rateLimiters.feedback, context: "reportMessageAction" }
    );
}
