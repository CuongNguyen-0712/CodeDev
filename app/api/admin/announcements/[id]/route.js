import { requirePermission, requireRecentAuth } from "@/lib/authz";
import { ApiError } from "@/lib/error/apiError";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminAnnouncementActionSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { announcementService } from "@/services/announcement.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH { action: "cancel" } before it is sent, or { action: "retract", reason? } after (audited).
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "announcement.send"]);
        await requireRecentAuth(actor);
        if (!UUID.test(String(params.id))) throw new ApiError("Invalid id", 400);
        const input = parseOrThrow(adminAnnouncementActionSchema, await readJson(req));
        const ip = RateLimiter.getClientIp(req);
        return input.action === "cancel"
            ? announcementService.cancel({ actor, id: params.id, ip })
            : announcementService.retract({ actor, id: params.id, reason: input.reason || null, ip });
    },
    { context: "api/admin/announcements/[id]", csrf: true, limiter: rateLimiters.admin }
);
