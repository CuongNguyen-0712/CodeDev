'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { feedbackService } from "@/services/feedback.service";

export async function sendFeedbackAction({ title, feedback }) {
    if (!title?.trim() || !feedback?.trim()) {
        return { success: false, message: "Title and feedback content are required.", status: 400 };
    }

    try {
        const session = await getServerSession(authOptions);
        const sender = session?.user?.id || 'anonymous';

        const result = await feedbackService.createFeedback({
            sender,
            title: title.trim(),
            feedback: feedback.trim()
        });

        return { success: Boolean(result) };
    } catch (error) {
        return {
            success: false,
            message: error.message || "Failed to submit feedback",
            status: error.status || 500
        };
    }
}
