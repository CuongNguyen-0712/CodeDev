import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import PostCommentCourseService from "@/app/services/postService/createCommentCourseService";

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { courseId, comment } = await req.json();

        if (!courseId || !comment) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, courseId, comment };

        const response = await PostCommentCourseService(data);

        return NextResponse.json({ success: response }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}