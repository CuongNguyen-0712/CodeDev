import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import PostFeedbackService from "@/app/services/postService/feedbackService";

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const sender = session.user.id;
        const { title, feedback } = await req.json();

        if (!title || !feedback) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { sender, title, feedback };

        const response = await PostFeedbackService(data);

        return NextResponse.json({ success: response }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}