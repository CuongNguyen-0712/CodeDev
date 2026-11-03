import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminCommentHideSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminFeedbackService } from "@/services/adminFeedback.service";

// PATCH { hidden, reason }: hide a comment from the course page or show it again (audited).
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "comment.moderate"]);
        const input = parseOrThrow(adminCommentHideSchema, await readJson(req));
        return adminFeedbackService.setCommentHidden({ actor, commentId: parseOrThrow(publicId, params.id), ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/comments/[id]", csrf: true, limiter: rateLimiters.admin }
);
