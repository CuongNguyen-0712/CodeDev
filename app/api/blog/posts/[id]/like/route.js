import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { blogInteractionService } from "@/services/blogInteraction.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;
const postId = (value) => {
    if (!POST_ID.test(value ?? "")) throw new ApiError("Invalid post id", 400);
    return value;
};
const options = { context: "api/blog/posts/[id]/like", csrf: true, limiter: rateLimiters.vote };

// POST: like a published post (idempotent).
export const POST = apiRoute(
    async ({ userId, params }) => blogInteractionService.like({ userId, postId: postId(params.id) }), options
);

// DELETE: remove the caller's like.
export const DELETE = apiRoute(
    async ({ userId, params }) => blogInteractionService.unlike({ userId, postId: postId(params.id) }), options
);
