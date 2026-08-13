import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import { courseService } from "@/app/services/course.service";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        const userId = session?.user?.id || null;

        const { searchParams } = new URL(req.url);
        const courseId = searchParams.get('courseId');
        const lastCreated = searchParams.get('lastCreated');

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, courseId, lastCreated };

        const response = await courseService.getComments(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}