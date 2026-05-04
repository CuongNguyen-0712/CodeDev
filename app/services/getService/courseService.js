import { getCourse } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetCourseService(data) {
    const { userId, search, limit, offset, prices, levels, ratings } = data;

    const result = await getCourse({ userId, search, limit, offset, prices, levels, ratings });

    if (!result) {
        throw new ApiError("Course not found", 404);
    }

    return result;
}