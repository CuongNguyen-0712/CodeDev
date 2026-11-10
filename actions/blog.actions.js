'use server';

import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import { blogInteractionService } from "@/services/blogInteraction.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;

// Like or unlike a published post; both are idempotent and return { liked, likeCount }.
export async function setPostLikeAction({ postId, liked } = {}) {
    return runAction(async ({ userId }) => {
        if (!POST_ID.test(String(postId ?? ""))) throw new ApiError("Invalid post id", 400);
        return liked === true
            ? blogInteractionService.like({ userId, postId })
            : blogInteractionService.unlike({ userId, postId });
    }, { limiter: rateLimiters.vote, context: "setPostLikeAction" });
}
