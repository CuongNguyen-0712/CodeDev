import { ulid } from "ulid";

import { blogDb } from "@/db/blog.db";
import { userDb } from "@/db/user.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { decodeCursor, encodeCursor, pageOf } from "@/lib/keysetCursor";

const COMMENT_PAGE = 20;
const COMMENT_ID = /^pcm_[0-9a-z]{26}$/;
const POST_ID = /^pst_[0-9a-z]{26}$/;
const MAX_IDS = 50;
const notFound = () => new ApiError("Post not found", 404);

// One transaction: lock the live post, change the like row, then the counter only when a row changed.
async function setLiked({ userId, postId, liked }) {
    return withTransaction(async (client) => {
        const user = await blogDb.userByPublicId(client, userId);
        const post = user && await blogDb.lockLive(client, postId);
        if (!post) throw notFound();
        if (liked && post.author_id === user.id) throw new ApiError("You cannot like your own post", 400);
        const args = { postId: post.id, userId: user.id };
        const changed = await (liked ? blogDb.insertLike : blogDb.deleteLike)(client, args);
        const likeCount = await blogDb.bumpLikes(client, { postId: post.id, delta: changed ? (liked ? 1 : -1) : 0 });
        return { liked, likeCount };
    });
}

const commentItem = (row, userId) => ({
    id: row.id, body: row.body, createdAt: row.created_at,
    author: { id: row.author_id, username: row.author_username, image: row.author_image },
    own: Boolean(userId) && row.author_id === userId,
});

export const blogInteractionService = {
    like: async ({ userId, postId }) => {
        if (!(await userDb.isEmailVerified({ userId }))) throw new ApiError("Verify your email to write on the blog", 403);
        return setLiked({ userId, postId, liked: true });
    },

    unlike: ({ userId, postId }) => setLiked({ userId, postId, liked: false }),

    viewer: async ({ userId, postId }) => {
        const row = await blogDb.viewerState(postId, userId ? await blogDb.userDbId(userId) : null);
        if (!row) throw notFound();
        return { likeCount: row.like_count, commentCount: row.comment_count, liked: row.liked, reported: row.reported, own: row.own };
    },

    /**
     * For a feed page of (at most 50) post ids: `ids` the viewer liked ([] signed out) and the live
     * `counts` of each published post. Ids of the wrong shape are ignored.
     */
    feedState: async ({ userId, postIds }) => {
        if (postIds.length > MAX_IDS) throw new ApiError(`At most ${MAX_IDS} ids`, 400);
        const valid = postIds.filter((id) => POST_ID.test(id));
        if (!valid.length) return { ids: [], counts: {} };
        const rows = await blogDb.feedState(userId ? await blogDb.userDbId(userId) : null, valid);
        return {
            ids: rows.filter((row) => row.liked).map((row) => row.id),
            counts: Object.fromEntries(rows.map((row) => [row.id, { likeCount: row.like_count, commentCount: row.comment_count }])),
        };
    },

    listComments: async ({ userId, postId, cursor = null }) => {
        const parsed = decodeCursor(cursor, COMMENT_ID);
        if (!(await blogDb.viewerState(postId, null))) throw notFound();
        const rows = await blogDb.listComments({ postId, cursor: parsed, limit: COMMENT_PAGE + 1 });
        const { items, nextCursor } = pageOf(rows, COMMENT_PAGE, (last) => encodeCursor(last.cursor_at, last.cursor_id));
        return { items: items.map((row) => commentItem(row, userId)), nextCursor };
    },

    addComment: async ({ userId, postId, input }) => {
        if (!(await userDb.isEmailVerified({ userId }))) throw new ApiError("Verify your email to write on the blog", 403);
        return withTransaction(async (client) => {
            const user = await blogDb.userByPublicId(client, userId);
            const post = user && await blogDb.lockLive(client, postId);
            if (!post) throw notFound();
            const id = `pcm_${ulid().toLowerCase()}`;
            const row = await blogDb.insertComment(client, { publicId: id, postId: post.id, userId: user.id, body: input.body });
            await blogDb.bumpComments(client, { postId: post.id, delta: 1 });
            return commentItem({ id, body: input.body, created_at: row.created_at, author_id: userId, author_username: row.username, author_image: row.image }, userId);
        });
    },

    report: async ({ userId, postId, input }) => {
        if (!(await userDb.isEmailVerified({ userId }))) throw new ApiError("Verify your email to write on the blog", 403);
        return withTransaction(async (client) => {
            const user = await blogDb.userByPublicId(client, userId);
            const post = user && await blogDb.lockLive(client, postId);
            if (!post) throw notFound();
            if (post.author_id === user.id) throw new ApiError("You cannot report your own post", 400);
            if (!(await blogDb.insertReport(client, { postId: post.id, userId: user.id, reason: input.reason }))) throw new ApiError("You already reported this post", 409);
            return { reported: true };
        });
    },

    /** Only the author may delete; the counter drops only if the comment was still visible. */
    deleteComment: ({ userId, commentId }) => withTransaction(async (client) => {
        const comment = await blogDb.lockComment(client, commentId);
        if (!comment || comment.author_public_id !== userId) throw new ApiError("Comment not found", 404);
        await blogDb.markCommentDeleted(client, { id: comment.id });
        if (!comment.is_hidden) await blogDb.bumpComments(client, { postId: comment.post_id, delta: -1 });
        return { deleted: true };
    }),
};
