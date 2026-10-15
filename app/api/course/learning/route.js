import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";

import { client } from "@/lib/sanity";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";

import { courseService } from "@/services/course.service";

const LESSON_QUERY = `*[_type == "lesson" && _id == $id][0]{
    title,
    slug,
    description,
    content
}`;

export async function GET(req) {
    try {
        const session = await getAuthSession();

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

        const source = response?.source;

        if (!source) {
            throw new ApiError("Lesson not available", 404);
        }

        // Access was checked above per user; the lesson body itself is the same for everyone.
        const lesson = await redis.remember(cacheKeys.lessonContent(source), TTL.LESSON_CONTENT, () =>
            client.fetch(LESSON_QUERY, { id: source })
        );

        if (!lesson) {
            throw new ApiError("Lesson content not found", 404);
        }

        return NextResponse.json({ success: true, data: lesson }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/course/learning");
    }
}