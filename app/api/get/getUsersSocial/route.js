import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import GetUserSocialService from "@/app/services/getService/userSocialService";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const { searchParams } = new URL(req.url);

        const userId = session.user.id;
        const search = searchParams.get('search') || '';
        const limit = searchParams.get('limit') || 10;
        const offset = searchParams.get('offset') || 0;

        const data = { userId, search, limit, offset };

        const response = await GetUserSocialService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}