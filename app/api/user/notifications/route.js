import { apiRoute } from "@/lib/routeHandler";
import { decodeNotificationCursor, notificationService } from "@/services/notification.service";

/** GET /api/user/notifications?unread=1&nextCursor=: one page, newest first, plus the unread count. */
export const GET = apiRoute(async ({ req, userId }) => {
    const { searchParams } = new URL(req.url);
    return notificationService.list({
        userId,
        unreadOnly: searchParams.get("unread") === "1",
        cursor: decodeNotificationCursor(searchParams.get("nextCursor")),
    });
}, { context: "api/user/notifications" });
