import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import GetCourseService from "@/app/services/getService/courseService";

export async function GET(req) {
    try {

        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;

        const { searchParams } = new URL(req.url);

        const search = searchParams.get("search") || "";
        const limit = searchParams.get("limit") || 10;
        const offset = searchParams.get("offset") || 0;
        const prices = searchParams.getAll("prices[]");
        const levels = searchParams.getAll("levels[]");
        const ratings = searchParams.getAll("ratings[]");

        const data = { userId, search, limit, offset, prices, levels, ratings };

        const response = await GetCourseService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        if (error instanceof ApiError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}