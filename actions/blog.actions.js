'use server';

import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import { postInputSchema, postPatchSchema } from "@/lib/validation/blog";
import { parseOrThrow } from "@/lib/validation/premium";
import { blogService } from "@/services/blog.service";
import { blogInteractionService } from "@/services/blogInteraction.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;
const postIdOf = (value) => {
    if (!POST_ID.test(String(value ?? ""))) throw new ApiError("Invalid post id", 400);
    return value;
};

// Create a draft, or submit it for review. Returns { id, slug, status, rewards? }.
export async function createPostAction(input) {
    return runAction(
        async ({ userId }) => blogService.create({ userId, input: parseOrThrow(postInputSchema, input) }),
        { limiter: rateLimiters.blogCreate, context: "createPostAction" }
    );
}

// Edit or resubmit an own post: { id, title, tags, body, submit, appealReason? }.
export async function updatePostAction({ id, ...input } = {}) {
    return runAction(
        async ({ userId }) => {
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
export async function setPostLikeAction({ postId, liked } = {}) {
    return runAction(async ({ userId }) => {
        postIdOf(postId);
        return liked === true
            ? blogInteractionService.like({ userId, postId })
            : blogInteractionService.unlike({ userId, postId });
    }, { limiter: rateLimiters.vote, context: "setPostLikeAction" });
}
