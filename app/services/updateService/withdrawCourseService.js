import { updateWithdrawCourse } from "@/app/actions/patch/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function UpdateWithdrawCourseService(data) {
    const { userId, courseId } = data;

    const result = await updateWithdrawCourse({ userId, courseId });

    if (!result) {
        throw new ApiError("Failed to withdraw course", 500);
    }

    return result;
}