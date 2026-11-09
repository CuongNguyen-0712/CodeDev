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
    list: async ({ status, cursor = null }) => {
        const rows = await blogDb.listAdmin({ status, cursor: decodeCursor(cursor, /^pst_[0-9a-z]{26}$/), limit: PAGE + 1 });
        const { items, nextCursor } = pageOf(rows, PAGE, (last) => encodeCursor(last.cursor_at, last.cursor_id));
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
            // A rejected appeal lands on hidden, so rejecting a hidden post that was appealed is a repeat.
            if (post.status === TARGET[action] || (action === "reject" && post.status === "hidden" && post.appealed_at)) return { changed: false, status: post.status };
            const appeal = post.status === "pending" && Boolean(post.appealed_at);
            const to = ALLOWED[`${post.status}${appeal ? ":appeal" : ""}:${action}`];
            if (!to) throw new ApiError(`Not allowed from ${post.status}`, 409);

            let updatedAt;
            if (action === "approve") updatedAt = await blogDb.approve(client, { id: post.id, actorDbId: actor.id, appeal });
            else if (action === "reject") updatedAt = await blogDb.reject(client, { id: post.id, reason, appeal });
            else if (action === "hide") updatedAt = await blogDb.hide(client, { id: post.id, reason });
            else updatedAt = await blogDb.show(client, { id: post.id });

            await adminDb.audit(client, {
                actorId: actor.id, action: `blog.${action}`, targetType: "post", targetId: postId, reason,
                before: { status: post.status }, after: { status: to }, ip,
            });
            return { changed: true, status: to, post, appeal, updatedAt };
        });
        if (!result.changed) return { changed: false, status: result.status };

        const { post, appeal, updatedAt } = result;
        // An appeal that is rejected keeps its original clock; a fresh hide starts one now.
        const purgeDate = iso(new Date((post.hidden_at ? new Date(post.hidden_at) : updatedAt).getTime() + BLOG_HIDDEN_PURGE_DAYS * DAY));
        const copy = notice({ action, appeal, post, reason, purgeDate });
        if (copy) await notificationService.notify(post.author_public_id, { ...copy, dedupeKey: `blog:${postId}:${action}:${updatedAt.toISOString()}` });
        // Every moderation change adds or removes a public post, so it must not be served stale.
        revalidateBlog(postId, { immediate: true });
        return { changed: true, status: result.status };
    },
};
