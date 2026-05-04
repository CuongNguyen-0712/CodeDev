import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import UpdateStatusCourseService from "@/app/services/updateService/statusCourseService";

export async function PATCH(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { courseId, marked } = await req.json();

        if (!courseId) {
            throw new ApiError("Missing credentials", 400);
        }

        if (marked === null) {
            throw new ApiError("Nothing to update", 400);
        }

        const validValues = [true, false, 'true', 'false'];
        if (!validValues.includes(marked)) {
            throw new ApiError("Invalid marked value", 400);
        }

        const is_marked = String(marked) === 'true';

        const data = { userId, courseId, is_marked };

        const response = await UpdateStatusCourseService(data);

        return NextResponse.json({ success: response }, { status: 200 });
    } catch (error) {
        console.error(error);

        if (error instanceof ApiError) {
            return NextResponse.json({ message: error.message, success: false }, { status: error.status });
        }

        return NextResponse.json({ message: "Internal Server Error", success: false }, { status: 500 });
    }
}