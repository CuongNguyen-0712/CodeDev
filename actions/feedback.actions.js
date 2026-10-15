'use server';

import { feedbackService } from "@/services/feedback.service";
import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";

// Guests may send feedback too (rate limited by IP).
export async function sendFeedbackAction({ title, feedback } = {}) {
    return runAction(async ({ userId }) => {
        if (!title?.trim() || !feedback?.trim()) {
            throw new ApiError("Title and feedback content are required.", 400);
        }

        return feedbackService.createFeedback({
            sender: userId || 'anonymous',
            title: title.trim(),
            feedback: feedback.trim()
        });
    }, { auth: false, limiter: rateLimiters.feedback, context: "sendFeedbackAction" });
}
