import { NextResponse } from "next/server";

import { ApiError } from "@/app/lib/error/apiError";

import GetStateCourseService from "@/app/services/getService/stateCourseService";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);

        const data = searchParams.get('courseId');

        if (!data) {
            throw new ApiError("Missing credentials", 400);
        }

        const response = await GetStateCourseService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}