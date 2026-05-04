import { getMyCourse } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetMyCourseService(data) {
    const { userId, search, limit, offset, markeds, statuses, levels } = data;

    const result = await getMyCourse({ userId, search, limit, offset, markeds, statuses, levels });

    if (!result) {
        throw new ApiError("Failed to load courses", 500);
    }

    return result;
}