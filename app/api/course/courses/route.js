import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";
import { parseListQuery } from "@/lib/listFilters";

import { courseService } from "@/services/course.service";

const PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(req) {
    try {
        // Not soft: an expired access token gets 401 so the client refreshes instead of seeing guest results.
        const session = await getAuthSession({ allowLocked: true }); // public read (plan 12.3)

        const userId = session?.user?.id || null;

        const { searchParams } = new URL(req.url);

        // Unknown keys and values outside the database enums / id ranges are dropped here.
        const { search, filter } = parseListQuery("course", searchParams);

        const lastId = searchParams.get("lastId") || null;
        if (lastId && !PUBLIC_ID.test(lastId)) {
            throw new ApiError("Invalid cursor", 400);
        }

        const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit"), 10) || 20, 1), 50);

        const response = await courseService.getList({ userId, search, filter, lastId, limit });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/course/courses");
    }
}
