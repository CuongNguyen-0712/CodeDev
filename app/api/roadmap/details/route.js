import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { ApiError, errorResponse } from "@/lib/error/apiError";
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
            const session = await getAuthSession({ allowLocked: true }); // public read (plan 12.3)
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
        return errorResponse(error, "api/roadmap/details");
    }
}
