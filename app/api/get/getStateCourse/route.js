import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import GetStateCourseService from "@/app/services/getService/stateCourseService";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session.user.id || null;

        const { searchParams } = new URL(req.url);

        const courseId = searchParams.get('courseId');

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, courseId };

        const response = await GetStateCourseService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}