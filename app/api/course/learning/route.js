import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import { client } from "@/app/lib/sanity";

import { courseService } from "@/app/services/course.service";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);

        const lessonId = searchParams.get('lessonId');

        if (!lessonId) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, lessonId };

        const response = await courseService.getLearning(data);

        const source = response[0]?.source;

        if (!source) {
            throw new ApiError("Lesson not available", 404);
        }

        const query = `*[_type == "lesson" && _id == $id][0]{
            title,
            slug,
            description,
            content
        }`;

        const lesson = await client.fetch(query, { id: source });

        return NextResponse.json({ success: true, data: lesson }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}