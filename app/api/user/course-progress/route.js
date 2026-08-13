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

        const userId = session.user.id;

        const { searchParams } = new URL(req.url);

        const search = searchParams.get('search');
        const levels = searchParams.getAll('level[]');
        const statuses = searchParams.getAll('status[]');

        const cursor = searchParams.get('nextCursor');
        const nextCursor = cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) : null;

        const data = { userId, search, levels, statuses, nextCursor };

        const response = await userService.getCourseProgress(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}