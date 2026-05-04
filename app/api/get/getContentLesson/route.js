import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import GetContentLessonService from "@/app/services/getService/contentLessonService";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;

        const { searchParams } = new URL(req.url);
        const lessonId = searchParams.get("lessonId");
        const courseId = searchParams.get("courseId");

        if (!lessonId || !courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, lessonId, courseId }

        const response = await GetContentLessonService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {

        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}