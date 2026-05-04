import { postFeedback } from "@/app/actions/post/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function PostFeedbackService(data) {
    const { sender, title, feedback } = data;

    const result = await postFeedback({ sender, title, feedback });

    if (!result) {
        throw new ApiError("Failed to submit feedback", 500);
    }

    return true;
}