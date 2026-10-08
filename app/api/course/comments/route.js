import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { courseService } from "@/services/course.service";

export async function GET(req) {
    try {
        const rateCheck = await rateLimiters.comment.limitRequest(req);
        if (!rateCheck.allowed) {
            return rateCheck.response;
        }

        const session = await getServerSession(authOptions);

        const userId = session?.user?.id || null;

        const { searchParams } = new URL(req.url);
        const courseId = searchParams.get('courseId');
        const lastCreated = searchParams.get('lastCreated');

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, courseId, lastCreated };

        const response = await courseService.getComments(data);

        return NextResponse.json(
            { success: true, data: response },
            { status: 200, headers: rateCheck.headers }
        );
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}