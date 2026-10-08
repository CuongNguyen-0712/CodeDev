import { feedbackDb } from "@/db/feedback.db";
import { ApiError } from "@/lib/error/apiError";

export const feedbackService = {
    createFeedback: async ({ sender, title, feedback }) => {
        if (!title?.trim() || !feedback?.trim()) {
            throw new ApiError("Title and feedback content are required", 400);
        }

        const result = await feedbackDb.create({
            sender: sender || "anonymous",
            title: title.trim(),
            feedback: feedback.trim()
        });

        if (!result) {
            throw new ApiError("Failed to submit feedback", 500);
        }

        return true;
    }
};

export default feedbackService;
