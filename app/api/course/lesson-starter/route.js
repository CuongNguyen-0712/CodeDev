import { NextResponse } from "next/server";

import { ApiError } from "@/lib/error/apiError";
import { getLessonContent, isLessonAssetKey } from "@/lib/lessonContent";
import { apiRoute } from "@/lib/routeHandler";
import { s3, buckets } from "@/lib/s3";
import { courseService } from "@/services/course.service";

/**
 * GET /api/course/lesson-starter?lessonId=<id>: redirects to a short-lived download URL for the
 * lesson's starter project (`environmentSetup.starterAssetKey` in Sanity), for learners who can
 * open the lesson.
 */
export const GET = apiRoute(async ({ req, userId }) => {
    const lessonId = new URL(req.url).searchParams.get("lessonId");
    if (!lessonId) throw new ApiError("Missing lessonId", 400);

    const learning = await courseService.getLearning({ userId, lessonId });
    if (!learning?.source) throw new ApiError("Lesson not available", 404);

    const lesson = await getLessonContent(learning.source);
    const key = lesson?.environmentSetup?.starterAssetKey;
    if (!isLessonAssetKey(key)) throw new ApiError("This lesson has no starter project", 404);

    const url = await s3.getDownloadUrl(key, { bucket: buckets.public, filename: key.split("/").slice(-2).join("-") });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}, { context: "api/course/lesson-starter" });
