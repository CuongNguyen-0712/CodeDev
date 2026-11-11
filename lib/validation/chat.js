import { z } from "zod";

import { MAX_ATTACHMENTS, MAX_BODY } from "@/lib/chat/limits";
import { ApiError } from "@/lib/error/apiError";
import { reportSchema } from "@/lib/validation/blog";

const conversationId = z.string().regex(/^cnv_[0-9a-z]{26}$/, "Invalid conversation id");
const messageId = z.string().regex(/^msg_[0-9a-z]{26}$/, "Invalid message id");
const attachmentId = z.string().regex(/^att_[0-9a-z]{26}$/, "Invalid attachment id");
const userId = z.string().min(1, "Invalid user id").max(64, "Invalid user id");
const socketId = z.string().regex(/^\d+\.\d+$/, "Invalid socket id").optional();
const BIGINT_MAX = 9223372036854775807n;
// Never trimmed: indentation in code blocks is content. NUL cannot be stored by Postgres.
const body = z.string()
    .refine((v) => [...v].length <= MAX_BODY, `A message can be at most ${MAX_BODY} characters`)
    .refine((v) => !v.includes("\u0000"), "Message contains an invalid character");

export const sendMessageSchema = z.object({
    conversationId: conversationId.optional(),
    toUserId: userId.optional(),
    clientId: z.string().uuid("Invalid client id"),
    body,
    attachmentIds: z.array(attachmentId).max(MAX_ATTACHMENTS).default([]),
    socketId,
})
    .refine((v) => !v.conversationId !== !v.toUserId, { message: "Give either a conversation or a recipient", path: ["conversationId"] })
    .refine((v) => v.body.trim().length > 0 || v.attachmentIds.length > 0, { message: "Message is empty", path: ["body"] });

export const editMessageSchema = z.object({
    messageId,
    body: body.refine((v) => v.trim().length > 0, "Message is empty"),
    socketId,
});

export const recallSchema = z.object({ messageId, socketId });

export const markReadSchema = z.object({
    conversationId,
    seq: z.string().regex(/^\d{1,19}$/, "Invalid sequence").refine((v) => !/^\d+$/.test(v) || BigInt(v) <= BIGINT_MAX, "Invalid sequence"),
});

export const uploadSchema = z.object({
    conversationId,
    contentType: z.string().min(1).max(100),
    size: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
});

export const respondSchema = z.object({ conversationId, accept: z.boolean() });

export const typingSchema = z.object({ conversationId, socketId });

export const targetSchema = z.object({ userId });

export const chatReportSchema = z.object({ messageId, reason: reportSchema.shape.reason });

/** Like parseOrThrow, but a bad chat input is 422. */
export function parseChat(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    const field = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    throw new ApiError(`${field}${issue?.message || "Invalid request"}`, 422, { code: "INVALID_REQUEST" });
}
