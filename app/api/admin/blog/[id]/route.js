import { ApiError } from "@/lib/error/apiError";
import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminBlogActionSchema } from "@/lib/validation/blog";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminBlogService } from "@/services/adminBlog.service";

const POST_ID = /^pst_[0-9a-z]{26}$/;

// GET: the post with its body, for the moderator's read-only preview.
export const GET = apiRoute(
    async ({ userId, params }) => {
        await requirePermission(userId, ["admin.read", "blog.moderate"]);
        if (!POST_ID.test(params.id)) throw new ApiError("Invalid post id", 400);
        return adminBlogService.get({ postId: params.id });
    },
    { context: "api/admin/blog/[id]" }
);

// PATCH { action: approve|reject|hide|show, reason }: moderate a post or decide its appeal (audited).
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "blog.moderate"]);
        if (!POST_ID.test(params.id)) throw new ApiError("Invalid post id", 400);
        const input = parseOrThrow(adminBlogActionSchema, await readJson(req));
        return adminBlogService.act({ actor, postId: params.id, ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/blog/[id]", csrf: true, limiter: rateLimiters.admin }
);
