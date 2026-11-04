import { requirePermission } from "@/lib/authz";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminAnnouncementAudienceSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { announcementService } from "@/services/announcement.service";

// POST { audience }: how many active learners it reaches now (unknown users fail with 422). Writes nothing.
export const POST = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "announcement.send"]);
        const input = parseOrThrow(adminAnnouncementAudienceSchema, await readJson(req));
        return announcementService.preview(input);
    },
    { context: "api/admin/announcements/preview", csrf: true, limiter: rateLimiters.admin }
);
