import { deleteMyCourse } from "@/app/actions/delete/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function DeleteMyCourseService(data) {
    const { userId, courseId } = data;

    const result = await deleteMyCourse({ userId, courseId });

    if (!result) {
        throw new ApiError("Failed to delete course", 400);
    }

    return result;
}