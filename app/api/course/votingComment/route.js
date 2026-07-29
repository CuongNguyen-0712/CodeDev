import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import { courseService } from "@/app/services/course.service";

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const { commentId, vote } = await req.json();

        if (!commentId) {
            throw new ApiError("Missing credentials", 400);
        }

        const userId = session.user.id;
        const data = { userId, commentId, vote }

        const response = await courseService.postVotingComment(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}

