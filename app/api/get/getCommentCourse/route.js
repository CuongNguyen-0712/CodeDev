import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import GetCommentCourseService from "@/app/services/getService/commentCourseService";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;

        const { searchParams } = new URL(req.url);
        const courseId = searchParams.get("courseId");

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        const offset = searchParams.get("offset") || 0;
        const limit = searchParams.get("limit") || 10;

        const data = { userId, courseId, offset, limit };

        const response = await GetCommentCourseService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        console.error("Error fetching comments:", error);
        if (error instanceof ApiError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}