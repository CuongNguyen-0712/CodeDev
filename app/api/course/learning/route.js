import { ApiError } from "@/lib/error/apiError";
import { getLessonContent } from "@/lib/lessonContent";
import { apiRoute } from "@/lib/routeHandler";
import { courseService } from "@/services/course.service";

/** GET /api/course/learning?lessonId=: the lesson body, for learners who can open the lesson. */
export const GET = apiRoute(async ({ req, userId }) => {
    const lessonId = new URL(req.url).searchParams.get("lessonId");
    if (!lessonId) throw new ApiError("Missing lessonId", 400);

    const response = await courseService.getLearning({ userId, lessonId });
    if (!response?.source) throw new ApiError("Lesson not available", 404);

    // Access was checked above per user; the lesson body itself is the same for everyone.
    const lesson = await getLessonContent(response.source);
    if (!lesson) throw new ApiError("Lesson content not found", 404);

    return lesson;
}, { context: "api/course/learning" });
