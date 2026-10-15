import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";
import { ApiError, errorResponse } from "@/lib/error/apiError";
import { userService } from "@/services/user.service";

export async function GET(req) {
    try {
        const session = await getAuthSession();

        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';

        const response = await userService.getFriends({ userId, search });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/get/getMyFriends");
    }
}