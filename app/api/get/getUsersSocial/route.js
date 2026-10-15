import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";
import { ApiError, errorResponse } from "@/lib/error/apiError";
import { socialService } from "@/services/social.service";

export async function GET(req) {
    try {
        const session = await getAuthSession();

        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401);
        }

        const { searchParams } = new URL(req.url);

        const userId = session.user.id;
        const search = searchParams.get('search') || '';
        const limit = Number(searchParams.get('limit')) || 10;
        const offset = Number(searchParams.get('offset')) || 0;

        const response = await socialService.getUsersSocial({ userId, search, limit, offset });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/get/getUsersSocial");
    }
}