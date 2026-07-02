import { NextResponse } from "next/server";

import GetRoadmapService from "@/app/services/getService/roadmapService";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);

        const roadmapId = searchParams.get("roadmapId");

        const data = { roadmapId };

        const response = await GetRoadmapService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}