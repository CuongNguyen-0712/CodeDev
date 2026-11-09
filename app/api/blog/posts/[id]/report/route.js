import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { reportSchema } from "@/lib/validation/blog";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { blogInteractionService } from "@/services/blogInteraction.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;
const postId = (value) => {
    if (!POST_ID.test(value ?? "")) throw new ApiError("Invalid post id", 400);
    return value;
};

// POST { reason }: report a published post for moderators.
export const POST = apiRoute(
    async ({ req, userId, params }) => blogInteractionService.report({
        userId, postId: postId(params.id), input: parseOrThrow(reportSchema, await readJson(req)),
    }),
    { context: "api/blog/posts/[id]/report", csrf: true, limiter: rateLimiters.feedback, status: 201 }
);
