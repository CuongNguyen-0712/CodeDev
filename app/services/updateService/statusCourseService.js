import { updateStatusCourse } from "@/app/actions/patch/action";
import { ApiError } from "@/app/lib/error/apiError";

export default async function UpdateStatusCourseService(data) {
    const { userId, courseId, is_marked } = data;

    const result = await updateStatusCourse({ userId, courseId, is_marked });

    if (!result) {
        throw new ApiError("Failed to update course: ", 500);
    }

    return true
}