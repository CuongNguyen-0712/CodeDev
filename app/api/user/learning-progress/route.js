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

        const { searchParams } = new URL(req.url);

        const courseId = searchParams.get('courseId');

        if (!courseId) {
            throw new ApiError("Course is required", 400);
        }

        const userId = session.user.id;

        const data = { userId, courseId };

        const response = await userService.getLearningProgress(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/user/learning-progress");
    }
}