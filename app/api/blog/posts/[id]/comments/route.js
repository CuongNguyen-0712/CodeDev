import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { commentInputSchema } from "@/lib/validation/blog";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { blogInteractionService } from "@/services/blogInteraction.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;
const postId = (value) => {
    if (!POST_ID.test(value ?? "")) throw new ApiError("Invalid post id", 400);
    return value;
};

// GET ?cursor=: visible comments, newest first. Guests may read.
export const GET = apiRoute(
    async ({ req, userId, params }) => blogInteractionService.listComments({
        userId, postId: postId(params.id), cursor: new URL(req.url).searchParams.get("cursor") || null,
    }),
    { context: "api/blog/posts/[id]/comments", auth: "optional", limiter: rateLimiters.commentRead }
);

// POST { body }: comment on a published post.
export const POST = apiRoute(
    async ({ req, userId, params }) => blogInteractionService.addComment({
        userId, postId: postId(params.id), input: parseOrThrow(commentInputSchema, await readJson(req)),
    }),
    { context: "api/blog/posts/[id]/comments", csrf: true, limiter: rateLimiters.comment, status: 201 }
);
