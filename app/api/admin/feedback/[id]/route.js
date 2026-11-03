import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminFeedbackHandleSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminFeedbackService } from "@/services/adminFeedback.service";

// PATCH { handled }: mark one feedback handled or open again (audited).
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "feedback.read"]);
        const input = parseOrThrow(adminFeedbackHandleSchema, await readJson(req));
        return adminFeedbackService.setFeedbackHandled({ actor, feedbackId: parseOrThrow(publicId, params.id), ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/feedback/[id]", csrf: true, limiter: rateLimiters.admin }
);
