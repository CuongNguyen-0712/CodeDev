import { NextResponse } from "next/server";
import { roadmapService } from "@/services/roadmap.service";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const roadmapId = searchParams.get("roadmapId");

        const response = await roadmapService.getRoadmap({ roadmapId });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { message: error.message || "Internal Server Error" },
            { status: error.status || 500 }
        );
    }
}