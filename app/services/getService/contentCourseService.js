import { getContentCourse } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetContentCourseService(data) {
    const { userId, courseId } = data;

    const result = await getContentCourse({ userId, courseId });

    if (!result) {
        throw new ApiError("Failed to load course content, try again later", 500);
    }

    return result;
}