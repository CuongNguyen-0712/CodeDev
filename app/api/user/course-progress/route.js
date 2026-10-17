import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";
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

export async function GET(req) {
    try {
        const session = await getAuthSession();

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;

        const { searchParams } = new URL(req.url);

        // status defaults to enrolled + in_progress; `status=all` lists every enrolment.
        const { search, filter } = parseListQuery("learning", searchParams);
        const nextCursor = decodeCursor(searchParams.get("nextCursor"));

        const response = await userService.getCourseProgress({ userId, search, filter, nextCursor });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/user/course-progress");
    }
}
