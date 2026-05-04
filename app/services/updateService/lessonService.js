import { updateLesson } from "@/app/actions/patch/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function UpdateLessonService(data) {
    const { userId, courseId, lessonId } = data;
    const result = await updateLesson({ userId, courseId, lessonId });

    if (!result) {
        throw new ApiError("Failed to update lesson, try again later", 500);
    }

    return result;
}