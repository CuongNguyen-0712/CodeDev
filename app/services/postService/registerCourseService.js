import { postRegisterCourse } from "@/app/actions/post/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function PostRegisterCourseService(data) {
    const { userId, courseId } = data;

    const result = await postRegisterCourse({ userId, courseId });

    if (!result) {
        throw new ApiError("Failed to register course, try again later", 500);
    }

    return result;
}