import { NextResponse } from "next/server";

import { ApiError, errorResponse } from "@/lib/error/apiError";

import { roadmapService } from "@/services/roadmap.service";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);

        const data = {};

        const response = await roadmapService.getList(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/roadmap/list");
    }
}