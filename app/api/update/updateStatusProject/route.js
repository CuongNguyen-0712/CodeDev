import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/app/lib/error/apiError";

import UpdateStatusProjectService from "@/app/services/updateService/statusProjectService";

export async function PATCH(req) {
    try {

        const session = await getServerSession(authOptions);
        if (!session) {
            throw new ApiError("Unauthorized", 401);
        }

        const userId = session.user.id;
        const { projectId, is_marked, is_deleted } = await req.json();

        if (!projectId) {
            throw new ApiError("Missing credentials", 400);
        }

        const isUpdate = is_marked !== null || is_deleted !== null;

        if (!isUpdate) {
            throw new ApiError("Nothing to update", 400);
        }

        const data = { userId, projectId, is_marked, is_deleted };

        const response = await UpdateStatusProjectService(data);

        return NextResponse.json({ success: response }, { status: 200 });
    } catch (error) {

        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: error.status || 500 });
    }
}