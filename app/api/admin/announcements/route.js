import { requirePermission, requireRecentAuth } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminAnnouncementListSchema, adminAnnouncementSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { announcementService, decodeAnnouncementCursor } from "@/services/announcement.service";

// GET ?cursor=: announcements newest first, with recipients and read counts.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "announcement.send"]);
        const input = parseOrThrow(adminAnnouncementListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return announcementService.list({ cursor: decodeAnnouncementCursor(input.cursor) });
    },
    { context: "api/admin/announcements" }
);

// POST { title, body, link?, audience, sendAt? }: sends now, or schedules when sendAt is ahead (audited).
export const POST = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, ["admin.read", "announcement.send"]);
        await requireRecentAuth(actor);
        const input = parseOrThrow(adminAnnouncementSchema, await readJson(req));
        return announcementService.create({ actor, input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/announcements", csrf: true, limiter: rateLimiters.admin, status: 201 }
);
