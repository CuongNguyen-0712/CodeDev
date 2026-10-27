import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";
import { ApiError, errorResponse } from "@/lib/error/apiError";
import { teamService } from "@/services/team.service";

export async function GET(req) {
    try {
        const session = await getAuthSession();

        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);

        const search = searchParams.get('search') || '';
        const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit'), 10) || 10, 1), 50);
        const offset = Math.max(Number.parseInt(searchParams.get('offset'), 10) || 0, 0);

        const response = await teamService.getTeamsSocial({ userId, search, limit, offset });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/get/getSocial");
    }
}