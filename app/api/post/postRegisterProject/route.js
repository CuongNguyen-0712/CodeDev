import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import PostRegisterProjectService from "@/app/services/postService/registerProjectService";

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { projectId } = await req.json();

        if (!projectId) {
            throw new ApiError("Missing credentials", 400);
        }

        const data = { userId, projectId };

        const response = await PostRegisterProjectService(data);

        return NextResponse.json({ success: response }, { status: 200 });
    } catch (error) {


        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}