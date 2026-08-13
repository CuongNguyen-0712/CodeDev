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

        const search = searchParams.get("search") || "";
        const lastId = searchParams.get("lastId") || null;
        const prices = searchParams.getAll("price[]");
        const levels = searchParams.getAll("level[]");
        const ratings = searchParams.getAll("rating[]");

        const data = { userId, search, lastId, prices, levels, ratings };

        const response = await courseService.getList(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        if (error instanceof ApiError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}