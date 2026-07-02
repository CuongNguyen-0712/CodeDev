import { getStateCourse } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetStateCourseService(data) {
    const { userId, courseId } = data;
    const result = await getStateCourse({ userId, courseId });

    if (!result) {
        throw new ApiError("Failed to load course state, try again later", 500);
    }

    return result;
}