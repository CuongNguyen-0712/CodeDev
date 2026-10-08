import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ApiError } from "@/lib/error/apiError";
import { roadmapService } from "@/services/roadmap.service";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
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
        return NextResponse.json(
            { message: error.message || "Internal Server Error" },
            { status: error.status || 500 }
        );
    }
}