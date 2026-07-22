import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import { userService } from "@/app/services/user.service";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const { searchParams } = new URL(req.url);

        const search = searchParams.get('search');
        const levels = searchParams.getAll('level[]');
        const statuses = searchParams.getAll('status[]');
        const markeds = searchParams.getAll('marked[]');

        const userId = session.user.id;

        const data = { userId, search, levels, statuses, markeds };

        const response = await userService.getCourseProgress(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}