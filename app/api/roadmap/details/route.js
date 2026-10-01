import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { ApiError } from "@/lib/error/apiError";
import { roadmapService } from "@/services/roadmap.service";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, message: "Roadmap ID is required" },
                { status: 400 }
            );
        }

        let userId = null;
        try {
            const session = await getServerSession(authOptions);
            if (session?.user?.id) {
                userId = session.user.id;
            }
        } catch (authErr) {
            // Public roadmap access allows non-authenticated visitors
            userId = null;
        }

        const response = await roadmapService.getDetails({ publicId: id, userId });

        return NextResponse.json({ success: true, data: response }, { status: 200 });
    } catch (error) {
        if (error instanceof ApiError) {
            return NextResponse.json({ success: false, message: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { success: false, message: error.message || "Internal Server Error" },
            { status: error.status || 500 }
        );
    }
}
