import { NextResponse } from "next/server";

import { ApiError } from "@/app/lib/error/apiError";

import getLessonService from "@/app/services/getService/lessonService";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);

        const data = searchParams.get("lessonId");

        if (!data) {
            throw new ApiError("Missing credentials", 400);
        }

        const response = await getLessonService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}