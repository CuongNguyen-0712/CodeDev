import { postCommentCourse } from "@/app/actions/post/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function PostCommentCourseService(data) {
    const { userId, courseId, comment } = data;

    const result = await postCommentCourse({ userId, courseId, comment });

    if (!result) {
        throw new ApiError("Failed to post comment, try again later", 500);
    }

    return true;
} 