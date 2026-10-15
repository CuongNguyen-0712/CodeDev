import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";

import { userService } from "@/services/user.service";

export async function GET(req) {
    try {
        const session = await getAuthSession();

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;

        const { searchParams } = new URL(req.url);

        const search = searchParams.get('search');
        const levels = searchParams.getAll('level[]');
        const statuses = searchParams.getAll('status[]');

        const cursor = searchParams.get('nextCursor');
        const nextCursor = cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) : null;

        const data = { userId, search, levels, statuses, nextCursor };

        const response = await userService.getCourseProgress(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/user/course-progress");
    }
}