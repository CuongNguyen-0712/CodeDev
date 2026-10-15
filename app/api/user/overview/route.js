import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";

import { userService } from "@/services/user.service";

export async function GET() {
    try {
        const session = await getAuthSession();

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;

        const response = await userService.getOverview(userId);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/user/overview");
    }
}