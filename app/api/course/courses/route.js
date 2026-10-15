import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";

import { courseService } from "@/services/course.service";

export async function GET(req) {
    try {
        const session = await getAuthSession();

        const userId = session?.user?.id || null;

        const { searchParams } = new URL(req.url);

        const search = searchParams.get("search") || "";
        const lastId = searchParams.get("lastId") || null;
        const prices = searchParams.getAll("price[]");
        const levels = searchParams.getAll("level[]");
        const ratings = searchParams.getAll("rating[]");
        const limit = searchParams.get("limit") || 20;

        const data = { userId, search, lastId, prices, levels, ratings, limit };

        const response = await courseService.getList(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/course/courses");
    }
}