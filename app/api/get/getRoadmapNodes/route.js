import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";
import { ApiError, errorResponse } from "@/lib/error/apiError";
import { roadmapService } from "@/services/roadmap.service";

export async function GET(req) {
    try {
        const session = await getAuthSession();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);
        const roadmapId = searchParams.get("roadmapId");

        if (!roadmapId) {
            throw new ApiError("Missing credentials", 400);
        }

        const response = await roadmapService.getRoadmapNodes({ userId, roadmapId });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/get/getRoadmapNodes");
    }
}