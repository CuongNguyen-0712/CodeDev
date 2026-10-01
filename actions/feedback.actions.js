'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import PostFeedbackService from "@/services/postService/feedbackService";

export async function sendFeedbackAction({ title, feedback }) {
    if (!title?.trim() || !feedback?.trim()) {
        return { success: false, message: "Title and feedback content are required.", status: 400 };
    }

    try {
        const session = await getServerSession(authOptions);
        const sender = session?.user?.id || 'anonymous';

        const result = await PostFeedbackService({
            sender,
            title: title.trim(),
            feedback: feedback.trim()
        });

        return { success: !!result };
    } catch (error) {
        return {
            success: false,
            message: error.message || "Failed to submit feedback",
            status: error.status || 500
        };
    }
}
