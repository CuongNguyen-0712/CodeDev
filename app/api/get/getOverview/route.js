import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import GetOverviewService from "@/app/services/getService/overviewService";

export async function GET(req) {
    try {

        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const data = session.user.id;

        const response = await GetOverviewService(data);

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {

        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}