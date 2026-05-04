import { getLesson } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function getLessonService(data) {
    const lesson = await getLesson(data);

    if (!lesson) {
        throw new ApiError("Failed to load lesson, try again later", 500);
    }

    return lesson;
}