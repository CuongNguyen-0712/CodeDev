import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/session";

import { errorResponse } from "@/lib/error/apiError";

import { authService } from "@/services/auth.service";

// Idempotent: signing out of a session that is already gone (revoked elsewhere, expired)
// still succeeds so the client can always finish clearing its cookie.
export async function PATCH() {
    try {
        const session = await getAuthSession({ validate: false });

        const userId = session?.user?.id;
        const sessionId = session?.user?.sessionId;

        if (userId && sessionId) {
            await authService.logout({ userId, sessionId });
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        return errorResponse(error, "api/user/logout");
    }
}
