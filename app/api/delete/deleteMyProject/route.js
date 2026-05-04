import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import DeleteMyProjectService from "@/app/services/deleteService/myProjectService";

export async function DELETE(req) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const body = await req.json();
        const { projectId } = body;

        if (!projectId) {
            throw new ApiError("Missing projectId", 400);
        }

        const userId = session.user.id;

        const data = { userId, projectId };

        const response = await DeleteMyProjectService(data);

        return NextResponse.json({ success: response }, { status: 200 });
    } catch (error) {
        console.error("Error deleting project:", error);
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }

}