import { adminDb } from "@/db/admin.db";
import { blogDb } from "@/db/blog.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { decodeCursor, encodeCursor, pageOf } from "@/lib/keysetCursor";
import { revalidateBlog } from "@/lib/pageCache";
import { BLOG_HIDDEN_PURGE_DAYS, purgeAtOf } from "@/services/blog.service";
import { notificationService } from "@/services/notification.service";

const PAGE = 20;
const DAY = 86400000;
const POST_ID = /^pst_[0-9a-z]{26}$/;

// Reported queue cursor: [report_count, last_report_at, post id], base64url JSON like lib/keysetCursor.
const encodeReportedCursor = (last) => Buffer.from(JSON.stringify([last.report_count, last.cursor_at, last.cursor_id])).toString("base64url");
function decodeReportedCursor(raw) {
    if (!raw) return null;
    try {
        const [count, createdAt, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf-8"));
        if (Number.isInteger(count) && count >= 1 && /^\d{4}-\d{2}-\d{2}[ T][\d:.+-]{8,22}$/.test(createdAt) && POST_ID.test(id)) return { count, createdAt, id };
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

const iso = (date) => date.toISOString().slice(0, 10);

const TARGET = { approve: "published", reject: "rejected", hide: "hidden", show: "published" };
// [from status, action] -> to status; a pending post with appealed_at set is the appeal queue.
const ALLOWED = {
    "pending:approve": "published", "pending:reject": "rejected", "pending:appeal:approve": "published", "pending:appeal:reject": "hidden",
    "published:hide": "hidden", "hidden:show": "published",
};

const item = (row) => ({
    id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt, status: row.status,
    author: { id: row.author_id, username: row.author_username, image: row.author_image },
    rejectReason: row.reject_reason, hiddenReason: row.hidden_reason, hiddenAt: row.hidden_at, appealedAt: row.appealed_at,
    appealReason: row.appeal_reason, purgeAt: purgeAtOf(row.status, row.hidden_at), updatedAt: row.updated_at,
    ...(row.report_count === undefined ? {} : { reportCount: row.report_count, reports: row.reports }),
});

function notice({ action, appeal, post, reason, purgeDate }) {
    if (action === "approve") return { kind: "system", title: "Post published", message: "Your post is now live on the blog.", link: `/blog/${post.slug}` };
    if (action === "hide") {
        const appealNote = post.appealed_at ? "Your appeal was already used." : "You can appeal once from My posts.";
        return { kind: "content_hidden", title: "Post hidden", link: "/blog/me",
            message: `Hidden: ${reason.replace(/\.$/, "")}. It will be deleted on ${purgeDate} unless it is restored. ${appealNote}` };
    }
    if (action === "reject" && appeal) {
        return { kind: "content_hidden", title: "Appeal rejected", link: "/blog/me",
            message: `Your appeal was rejected: ${reason.replace(/\.$/, "")}. The post stays hidden and will be deleted on ${purgeDate}.` };
    }
    if (action === "reject") return { kind: "content_hidden", title: "Post not approved", message: `Your post was not approved: ${reason}`, link: "/blog/me" };
    return null;
}

/** Blog moderation: review queues, approve / reject / hide / show and appeal decisions, all audited. */
export const adminBlogService = {
    list: async ({ status, cursor = null, pageSize = PAGE }) => {
        const reported = status === "reported";
        const args = { cursor: reported ? decodeReportedCursor(cursor) : decodeCursor(cursor, POST_ID), limit: pageSize + 1 };
        const rows = reported ? await blogDb.listReported(args) : await blogDb.listAdmin({ ...args, status });
        const { items, nextCursor } = pageOf(rows, pageSize, reported ? encodeReportedCursor : (last) => encodeCursor(last.cursor_at, last.cursor_id));
        return { items: items.map(item), nextCursor };
    },

    // Moderators read the whole post before approving; the list only carries the excerpt.
    get: async ({ postId }) => {
        const row = await blogDb.getAdmin(postId);
        if (!row) throw new ApiError("Post not found", 404);
        return { ...item(row), body: row.body };
    },

    act: async ({ actor, postId, action, reason = null, ip = null }) => {
        const result = await withTransaction(async (client) => {
            const post = await blogDb.lockForModeration(client, postId);
            if (!post) throw new ApiError("Post not found", 404);
            if (action === "dismiss") {
                if (post.status !== "published") throw new ApiError(`Not allowed from ${post.status}`, 409);
                const openReports = await blogDb.resolveReports(client, { postId: post.id });
                if (!openReports) throw new ApiError("No open reports", 409);
                await adminDb.audit(client, {
                    actorId: actor.id, action: "blog.dismiss", targetType: "post", targetId: postId, reason,
                    before: { status: post.status, openReports }, after: { status: post.status, openReports: 0 }, ip,
                });
                return { changed: true, dismissed: true, status: "published" };
            }
            // A rejected appeal lands on hidden, so rejecting a hidden post that was appealed is a repeat.
            if (post.status === TARGET[action] || (action === "reject" && post.status === "hidden" && post.appealed_at)) return { changed: false, status: post.status };
            const appeal = post.status === "pending" && Boolean(post.appealed_at);
            const to = ALLOWED[`${post.status}${appeal ? ":appeal" : ""}:${action}`];
            if (!to) throw new ApiError(`Not allowed from ${post.status}`, 409);

            let updatedAt;
            if (action === "approve") updatedAt = await blogDb.approve(client, { id: post.id, actorDbId: actor.id, appeal });
            else if (action === "reject") updatedAt = await blogDb.reject(client, { id: post.id, reason, appeal });
            else if (action === "hide") {
                updatedAt = await blogDb.hide(client, { id: post.id, reason });
                await blogDb.resolveReports(client, { postId: post.id });
            }
            else updatedAt = await blogDb.show(client, { id: post.id });

            await adminDb.audit(client, {
                actorId: actor.id, action: `blog.${action}`, targetType: "post", targetId: postId, reason,
                before: { status: post.status }, after: { status: to }, ip,
            });
            return { changed: true, status: to, post, appeal, updatedAt };
        });
        if (!result.changed) return { changed: false, status: result.status };
        if (result.dismissed) return { changed: true, status: result.status };

        const { post, appeal, updatedAt } = result;
        // An appeal that is rejected keeps its original clock; a fresh hide starts one now.
        const purgeDate = iso(new Date((post.hidden_at ? new Date(post.hidden_at) : updatedAt).getTime() + BLOG_HIDDEN_PURGE_DAYS * DAY));
        const copy = notice({ action, appeal, post, reason, purgeDate });
        if (copy) await notificationService.notify(post.author_public_id, { ...copy, dedupeKey: `blog:${postId}:${action}:${updatedAt.toISOString()}` });
        // Every moderation change adds or removes a public post, so it must not be served stale.
        revalidateBlog(postId, { immediate: true });
        return { changed: true, status: result.status };
    },

    listComments: async ({ cursor = null }) => {
        const rows = await blogDb.listCommentsAdmin({ cursor: decodeCursor(cursor, /^pcm_[0-9a-z]{26}$/), limit: PAGE + 1 });
        const { items, nextCursor } = pageOf(rows, PAGE, (last) => encodeCursor(last.cursor_at, last.cursor_id));
        return {
            items: items.map((row) => ({
                id: row.id, body: row.body, createdAt: row.created_at, hidden: row.is_hidden,
                author: { id: row.author_id, username: row.author_username, image: row.author_image },
                post: { id: row.post_id, slug: row.post_slug, title: row.post_title },
            })),
            nextCursor,
        };
    },

    // The counter moves only when visibility changes; a deleted comment is already gone (404).
    setCommentHidden: async ({ actor, commentId, hidden, reason = null, ip = null }) => {
        const result = await withTransaction(async (client) => {
            const comment = await blogDb.lockComment(client, commentId);
            if (!comment) throw new ApiError("Comment not found", 404);
            if (comment.is_hidden === hidden) return { changed: false };
            const updatedAt = await blogDb.setCommentHidden(client, { id: comment.id, hidden, reason: hidden ? reason : null });
            await blogDb.bumpComments(client, { postId: comment.post_id, delta: hidden ? -1 : 1 });
            await adminDb.audit(client, {
                actorId: actor.id, action: hidden ? "blog.comment_hide" : "blog.comment_show", targetType: "post_comment", targetId: commentId, reason,
                before: { hidden: !hidden }, after: { hidden }, ip,
            });
            return { changed: true, comment, updatedAt };
        });
        if (!result.changed) return { changed: false };
        if (hidden) {
            await notificationService.notify(result.comment.author_public_id, {
                kind: "content_hidden", title: "Comment hidden", link: "/blog",
                message: `Your comment was hidden: ${(reason ?? "").replace(/\.$/, "")}.`,
                dedupeKey: `blog-comment:${commentId}:hide:${result.updatedAt.toISOString()}`,
            });
        }
        return { changed: true };
    },
};
