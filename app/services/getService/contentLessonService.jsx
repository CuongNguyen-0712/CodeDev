import { getContentLesson } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetContentLessonService(data) {
    const { userId, lessonId, courseId } = data;
    const result = await getContentLesson({ userId, lessonId, courseId });

    if (!result) {
        throw new ApiError("Content not found", 404);
    }

    return result;
}