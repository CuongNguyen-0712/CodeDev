import { blogDb } from "@/db/blog.db";
import { userDb } from "@/db/user.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";

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

    /** Which of the (at most 50) post ids the viewer has liked; ids of the wrong shape are ignored. */
    likedIds: async ({ userId, postIds }) => {
        if (postIds.length > MAX_IDS) throw new ApiError(`At most ${MAX_IDS} ids`, 400);
        const valid = postIds.filter((id) => POST_ID.test(id));
        const userDbId = userId && valid.length ? await blogDb.userDbId(userId) : null;
        return userDbId ? blogDb.likedIds(userDbId, valid) : [];
    },
};
