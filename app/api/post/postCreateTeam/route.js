import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ApiError } from "@/lib/error/apiError";
import { teamService } from "@/services/team.service";

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { name, size, description } = await req.json();

        if (!name || !size) {
            throw new ApiError("Missing credentials", 400);
        }

        const response = await teamService.createTeam({
            userId,
            name,
            size,
            description
        });

        return NextResponse.json({ success: response }, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { message: error.message || "Internal Server Error" },
            { status: error.status || 500 }
        );
    }
}