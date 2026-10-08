import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ApiError } from "@/lib/error/apiError";
import { teamService } from "@/services/team.service";

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);

        const search = searchParams.get('search') || '';
        const limit = Number(searchParams.get('limit')) || 10;
        const offset = Number(searchParams.get('offset')) || 0;

        const response = await teamService.getTeamsSocial({ userId, search, limit, offset });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { message: error.message || "Internal Server Error" },
            { status: error.status || 500 }
        );
    }
}