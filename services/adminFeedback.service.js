import { adminDb } from "@/db/admin.db";
import { adminFeedbackDb, COMMENT_STATES, FEEDBACK_STATES } from "@/db/adminFeedback.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { notificationService } from "@/services/notification.service";

const PAGE = 30;
const encodeCursor = (createdAt, id) => Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");

function decodeCursor(raw, idPattern) {
    if (!raw) return null;
    try {
        const [createdAt, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf-8"));
        if (/^\d{4}-\d{2}-\d{2}[ T][\d:.+-]{8,22}$/.test(createdAt) && idPattern.test(id)) return { createdAt, id };
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

const page = (rows, cursorOf) => {
    const items = rows.slice(0, PAGE);
    const last = items[items.length - 1];
    return { items: items.map(({ cursor_at, cursor_id, ...item }) => item), nextCursor: rows.length > PAGE && last ? cursorOf(last) : null };
};

/**
 * Course comments (comment.moderate) and the CodeDev feedback inbox (feedback.read), docs/admin-panel-plan.md 11.3.
 * Hiding a comment removes it from the course page; the author's own text is never edited or deleted here.
 */
export const adminFeedbackService = {
    commentStates: COMMENT_STATES,
    feedbackStates: FEEDBACK_STATES,

    listComments: async ({ courseId = null, state = "all", cursor = null }) => {
        let courseDbId = null;
        if (courseId) {
            courseDbId = await adminFeedbackDb.courseId(courseId);
            if (!courseDbId) throw new ApiError("Course not found", 404);
        }
        const [{ rows }, counts] = await Promise.all([
            adminFeedbackDb.listComments({ courseDbId, state, cursor: decodeCursor(cursor, /^\d{1,19}$/), limit: PAGE + 1 }),
            cursor ? null : adminFeedbackDb.commentCounts(courseDbId),
        ]);
        return { ...page(rows, (last) => encodeCursor(last.cursor_at, last.cursor_id)), counts };
    },

    setCommentHidden: async ({ actor, commentId, hidden, reason, ip = null }) => {
        const result = await withTransaction(async (client) => {
            const comment = await adminFeedbackDb.lockComment(client, commentId);
            if (!comment) throw new ApiError("Comment not found", 404);
            if (comment.is_hidden === hidden) return { changed: false };
            await adminFeedbackDb.setCommentHidden(client, { id: comment.id, hidden });
            await adminDb.audit(client, {
                actorId: actor.id, action: hidden ? "comment.hide" : "comment.show", targetType: "comment", targetId: commentId,
                reason, before: { course: comment.course_id, hidden: comment.is_hidden }, after: { course: comment.course_id, hidden }, ip,
            });
            return { changed: true, authorId: comment.author_id };
        });
        // The moderator's reason is an internal note: the author only learns that the comment was hidden.
        if (result.changed && hidden && result.authorId) {
            await notificationService.notify(result.authorId, {
                kind: "content_hidden",
                title: "Comment hidden",
                message: "One of your comments was hidden because it breaks the community guidelines.",
                link: "/help",
                dedupeKey: `comment:${commentId}`,
            });
        }
        return { changed: result.changed };
    },

    listFeedback: async ({ state = "open", cursor = null }) => {
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const [{ rows }, counts] = await Promise.all([
            adminFeedbackDb.listFeedback({ state, cursor: decodeCursor(cursor, uuid), limit: PAGE + 1 }),
            cursor ? null : adminFeedbackDb.feedbackCounts(),
        ]);
        return { ...page(rows, (last) => encodeCursor(last.cursor_at, last.id)), counts };
    },

    setFeedbackHandled: async ({ actor, feedbackId, handled, ip = null }) => {
        const result = await withTransaction(async (client) => {
            const feedback = await adminFeedbackDb.lockFeedback(client, feedbackId);
            if (!feedback) throw new ApiError("Feedback not found", 404);
            if (Boolean(feedback.handled_at) === handled) return { changed: false };
            await adminFeedbackDb.setFeedbackHandled(client, { id: feedbackId, handledBy: handled ? actor.id : null });
            await adminDb.audit(client, {
                actorId: actor.id, action: handled ? "feedback.handle" : "feedback.reopen", targetType: "feedback", targetId: feedbackId,
                before: { handled: Boolean(feedback.handled_at) }, after: { handled }, ip,
            });
            return { changed: true, userId: feedback.user_id, title: feedback.title };
        });
        // Once per feedback: reopening and handling it again does not notify twice.
        if (result.changed && handled && result.userId) {
            await notificationService.notify(result.userId, {
                kind: "feedback_handled",
                title: "Feedback reviewed",
                message: `Thanks for your feedback "${result.title}". Our team has reviewed it.`,
                dedupeKey: feedbackId,
            });
        }
        return { changed: result.changed };
    },
};
