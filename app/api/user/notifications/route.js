import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { ApiError } from "@/lib/error/apiError";
import { decodeNotificationCursor, notificationService } from "@/services/notification.service";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_IDS = 100;

/** GET /api/user/notifications?unread=1&nextCursor=: one page, newest first, plus the unread count. */
export const GET = apiRoute(async ({ req, userId }) => {
    const { searchParams } = new URL(req.url);
    return notificationService.list({
        userId,
        unreadOnly: searchParams.get("unread") === "1",
        cursor: decodeNotificationCursor(searchParams.get("nextCursor")),
    });
}, { context: "api/user/notifications" });

/**
 * PATCH body `{ all: true }` or `{ ids: string[] }` (1-100 uuids): marks them read.
 * `{ ids, dismiss: true }` removes them from the inbox instead.
 */
export const PATCH = apiRoute(async ({ req, userId }) => {
    const body = await req.json().catch(() => {
        throw new ApiError("Invalid JSON body", 400);
    });
    if (body?.all === true) return notificationService.markAllRead({ userId });

    const ids = Array.isArray(body?.ids) ? body.ids : null;
    if (!ids?.length || ids.length > MAX_IDS || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
        throw new ApiError("Body must be { all: true } or { ids: [uuid, ...] }", 400);
    }
    if (body.dismiss === true) return notificationService.dismiss({ userId, ids });
    return notificationService.markRead({ userId, ids });
}, { context: "api/user/notifications", csrf: true, limiter: rateLimiters.profile });
