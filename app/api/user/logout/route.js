import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import { authService } from "@/app/services/auth.service";

export async function PATCH() {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const sessionId = session.user.session_id;

        if (!userId || !sessionId) {
            throw new ApiError("Unauthorized", 401);
        }

        const response = await authService.logout({ userId, sessionId });

        return NextResponse.json({ success: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status || 500 });
    }
}