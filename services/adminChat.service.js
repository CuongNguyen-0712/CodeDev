import { adminDb } from "@/db/admin.db";
import { chatDb } from "@/db/chat.db";
import { signRead } from "@/lib/chatMedia";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { decodeCursor, encodeCursor, pageOf } from "@/lib/keysetCursor";
import { chatService } from "@/services/chat.service";

const PAGE = 20;
const MESSAGE_ID = /^msg_[0-9a-z]{26}$/;

/** Moderation of reported chat messages: only the reported message leaves the service, never the rest of its conversation. */
export const adminChatService = {
    list: async ({ cursor = null, pageSize = PAGE }) => {
        const rows = await chatDb.listReported({ cursor: decodeCursor(cursor, MESSAGE_ID), limit: pageSize + 1 });
        const { items, nextCursor } = pageOf(rows, pageSize, (last) => encodeCursor(last.cursor_at, last.cursor_id));
        return {
            items: items.map(({ sender_id, sender_username, sender_nickname, firstReportedAt, ...row }) => ({
                ...row, firstReportedAt: firstReportedAt.toISOString(), sender: { id: sender_id, username: sender_username, nickname: sender_nickname },
            })),
            nextCursor,
        };
    },

    // hide = unsend (the member rules do not apply to an admin) + close the reports; dismiss only closes them. Both are audited.
    act: async ({ actor, messageId, action, reason = null, ip = null }) => {
        if (!MESSAGE_ID.test(messageId ?? "")) throw new ApiError("Invalid message id", 400);
        const ref = await chatDb.messageRef(null, { messageId, windowMs: 0 });
        if (!ref) throw new ApiError("Message not found", 404);
        if (!await chatDb.hasOpenReports(null, ref.id)) throw new ApiError("No open reports", 409);
        if (action === "hide") await chatService.recallMessage({ userId: actor.publicId, messageId, byAdmin: true });
        await withTransaction(async (client) => {
            const closed = await chatDb.resolveReports(client, { messageDbId: ref.id, adminDbId: actor.id });
            // Another admin may have closed them since the check; for dismiss there is then nothing left to do.
            if (action === "dismiss" && !closed) throw new ApiError("No open reports", 409);
            await adminDb.audit(client, {
                actorId: actor.id, action: `chat.report.${action}`, targetType: "chat_message", targetId: messageId, reason,
                before: { openReports: closed }, after: { openReports: 0, ...(action === "hide" ? { deleted: true } : {}) }, ip,
            });
        });
        return { changed: true };
    },

    // Signed read URL of an image on a message with an open report; each view is audited. 404 hides whether the ids exist.
    attachmentUrl: async ({ actor, messageId, attachmentId, ip = null }) => {
        const key = await chatDb.reportedAttachmentKey(null, { messageId, attachmentId });
        if (!key) throw new ApiError("Attachment not found", 404);
        await withTransaction((client) => adminDb.audit(client, {
            actorId: actor.id, action: "chat.report.view_image", targetType: "chat_message", targetId: messageId,
            after: { attachmentId }, ip,
        }));
        return (await signRead(key)).url;
    },
};
