import { getCommentCourse } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetCommentCourseService(data) {
    const { userId, courseId, offset, limit } = data;

    const result = await getCommentCourse({ userId, courseId, offset, limit });

    if (!result) {
        throw new ApiError("Failed to fetch comments", 500);
    }

    return result;
}