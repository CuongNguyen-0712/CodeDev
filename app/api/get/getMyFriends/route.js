import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ApiError } from "@/lib/error/apiError";
import { userService } from "@/services/user.service";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';

        const response = await userService.getFriends({ userId, search });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { message: error.message || "Internal Server Error" },
            { status: error.status || 500 }
        );
    }
}