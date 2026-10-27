import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";

import { courseService } from "@/services/course.service";

export async function GET(req) {
    try {
        const session = await getAuthSession({ allowLocked: true }); // public read (plan 12.3)

        const userId = session?.user?.id || null;

        const { searchParams } = new URL(req.url);
        const courseId = searchParams.get('courseId');

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, courseId: decodeURIComponent(courseId) };

        const response = await courseService.getDetails(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/course/course-details");
    }
}