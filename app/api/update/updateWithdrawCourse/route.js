import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import UpdateWithdrawCourseService from "@/app/services/updateService/withdrawCourseService";

export async function PATCH(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { courseId } = await req.json();

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, courseId };
        const response = await UpdateWithdrawCourseService(data);

        return NextResponse.json({ success: response }, { status: 200 });
    } catch (error) {

        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}