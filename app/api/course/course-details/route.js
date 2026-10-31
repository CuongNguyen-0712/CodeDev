import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";

import { courseService } from "@/services/course.service";

// catalog.course.public_id is a slug (varchar 255); searchParams already decoded it.
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,255}$/;

export async function GET(req) {
    try {
        const session = await getAuthSession({ allowLocked: true }); // public read (plan 12.3)

        const userId = session?.user?.id || null;

        const { searchParams } = new URL(req.url);
        const courseId = searchParams.get('courseId');

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }
        if (!PUBLIC_ID.test(courseId)) {
            throw new ApiError("Invalid course id", 400);
        }

        const data = { userId, courseId };

        const response = await courseService.getDetails(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/course/course-details");
    }
}