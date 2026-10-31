import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { parseListQuery } from "@/lib/listFilters";

import { userService } from "@/services/user.service";

/** Keyset cursor produced by userService.getCourseProgress; anything else is a client bug. */
function decodeCursor(raw) {
    if (!raw) return null;
    try {
        const cursor = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
        if (typeof cursor?.sortTime === "string" && !Number.isNaN(Date.parse(cursor.sortTime)) && /^\d{1,19}$/.test(String(cursor.id))) {
            return { sortTime: cursor.sortTime, id: String(cursor.id) };
        }
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

/** GET /api/user/course-progress: "My learning" list (status defaults to enrolled + in_progress; `status=all` lists every enrolment). */
export const GET = apiRoute(async ({ req, userId }) => {
    const { searchParams } = new URL(req.url);
    const { search, filter } = parseListQuery("learning", searchParams);
    const nextCursor = decodeCursor(searchParams.get("nextCursor"));
    return userService.getCourseProgress({ userId, search, filter, nextCursor });
}, { context: "api/user/course-progress" });
