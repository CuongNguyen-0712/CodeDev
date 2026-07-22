import { NextResponse } from "next/server";

import { ApiError } from "@/app/lib/error/apiError";

import { courseService } from "@/app/services/course.service";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const courseId = searchParams.get('courseId');

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        const response = await courseService.getDetails(courseId);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}