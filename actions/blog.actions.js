'use server';

import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import { commentInputSchema, postInputSchema, postPatchSchema, reportSchema } from "@/lib/validation/blog";
import { parseOrThrow } from "@/lib/validation/premium";
import { blogService } from "@/services/blog.service";
import { blogInteractionService } from "@/services/blogInteraction.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;
const postIdOf = (value) => {
    if (!POST_ID.test(String(value ?? ""))) throw new ApiError("Invalid post id", 400);
    return value;
};
const COMMENT_ID = /^pcm_[0-9a-z]{26}$/;

// Create a draft, or submit it for review. Returns { id, slug, status, rewards? }.
export async function createPostAction(input) {
    return runAction(
        async ({ userId }) => blogService.create({ userId, input: parseOrThrow(postInputSchema, input) }),
        { limiter: rateLimiters.blogCreate, context: "createPostAction" }
    );
}

// Edit or resubmit an own post: { id, title, tags, body, submit, appealReason? }.
export async function updatePostAction(arg) {
    return runAction(
        async ({ userId }) => {
            const { id, ...input } = arg ?? {};
            const postId = postIdOf(id);
            return blogService.update({ userId, postId, input: parseOrThrow(postPatchSchema, input) });
        },
        { limiter: rateLimiters.blogWrite, context: "updatePostAction" }
    );
}

// Remove an own post.
export async function deletePostAction(id) {
    return runAction(
        async ({ userId }) => blogService.remove({ userId, postId: postIdOf(id) }),
        { limiter: rateLimiters.blogWrite, context: "deletePostAction" }
    );
}

// Like or unlike a published post; both are idempotent and return { liked, likeCount }.
export async function setPostLikeAction(arg) {
    return runAction(async ({ userId }) => {
        const { postId, liked } = arg ?? {};
        postIdOf(postId);
        return liked === true
            ? blogInteractionService.like({ userId, postId })
            : blogInteractionService.unlike({ userId, postId });
    }, { limiter: rateLimiters.vote, context: "setPostLikeAction" });
}

// Comment on a published post: { postId, body }. Returns the new comment { id, body, createdAt, author, own }.
export async function addCommentAction(arg) {
    return runAction(async ({ userId }) => {
        const { postId, body } = arg ?? {};
        postIdOf(postId);
        return blogInteractionService.addComment({ userId, postId, input: parseOrThrow(commentInputSchema, { body }) });
    }, { limiter: rateLimiters.comment, context: "addCommentAction" });
}

// The author removes their own comment.
export async function deleteCommentAction(commentId) {
    return runAction(async ({ userId }) => {
        if (!COMMENT_ID.test(String(commentId ?? ""))) throw new ApiError("Invalid comment id", 400);
        return blogInteractionService.deleteComment({ userId, commentId });
    }, { limiter: rateLimiters.comment, context: "deleteCommentAction" });
}

// Report a published post for moderators: { postId, reason }.
export async function reportPostAction(arg) {
    return runAction(async ({ userId }) => {
        const { postId, reason } = arg ?? {};
        postIdOf(postId);
        return blogInteractionService.report({ userId, postId, input: parseOrThrow(reportSchema, { reason }) });
    }, { limiter: rateLimiters.feedback, context: "reportPostAction" });
}
