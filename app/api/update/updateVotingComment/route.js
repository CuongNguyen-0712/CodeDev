import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import UpdateVotingCommentService from "@/app/services/updateService/votingCourseService";

export async function PATCH(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { commentId, voting } = await req.json();

        if (!commentId) {
            throw new ApiError("Missing credentials", 400);
        }

        let isVoted;

        if (voting === true || voting === 'true') {
            isVoted = true;
        } else if (voting === false || voting === 'false') {
            isVoted = false;
        } else if (voting === null) {
            isVoted = null;
        } else {
            throw new Error('Invalid voting value');
        }

        const data = { userId, commentId, isVoted };

        const response = await UpdateVotingCommentService(data);

        return NextResponse.json({ success: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}