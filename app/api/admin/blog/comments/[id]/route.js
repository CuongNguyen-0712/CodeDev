import { ApiError } from "@/lib/error/apiError";
import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminCommentHideSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminBlogService } from "@/services/adminBlog.service";

const COMMENT_ID = /^pcm_[0-9a-z]{26}$/;

// PATCH { hidden, reason }: hide or show a comment (audited).
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "blog.moderate"]);
        if (!COMMENT_ID.test(params.id ?? "")) throw new ApiError("Invalid comment id", 400);
        const input = parseOrThrow(adminCommentHideSchema, await readJson(req));
        return adminBlogService.setCommentHidden({ actor, commentId: params.id, ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/blog/comments/[id]", csrf: true, limiter: rateLimiters.admin }
);
