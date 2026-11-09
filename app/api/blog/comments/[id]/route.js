import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { blogInteractionService } from "@/services/blogInteraction.service";

const COMMENT_ID = /^pcm_[0-9a-z]{26}$/;

// DELETE: the author removes their own comment.
export const DELETE = apiRoute(
    async ({ userId, params }) => {
        if (!COMMENT_ID.test(params.id ?? "")) throw new ApiError("Invalid comment id", 400);
        return blogInteractionService.deleteComment({ userId, commentId: params.id });
    },
    { context: "api/blog/comments/[id]", csrf: true, limiter: rateLimiters.comment }
);
