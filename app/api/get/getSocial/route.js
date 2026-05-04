import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import GetSocialService from "@/app/services/getService/teamsSocialService";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);

        const search = searchParams.get('search') || '';
        const limit = searchParams.get('limit') || 10;
        const offset = searchParams.get('offset') || 0;

        const data = { userId, search, limit, offset };

        const response = await GetSocialService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {


        throw new ApiError(500, "Internal Server Error");
    }
}