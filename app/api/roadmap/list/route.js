import { NextResponse } from "next/server";

import { ApiError } from "@/app/lib/error/apiError";

import { roadmapService } from "@/app/services/roadmap.service";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);

        const data = {};

        const response = await roadmapService.getList(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        if (error instanceof ApiError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}