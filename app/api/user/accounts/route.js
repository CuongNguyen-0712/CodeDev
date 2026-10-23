import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { requireAuthSession } from "@/lib/session";

import { accountLinkService } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

/** GET /api/user/accounts — Settings > Sign-in methods: `{ password, providers[] }`. */
export async function GET(req) {
    try {
        const session = await requireAuthSession();
        const userId = session.user.id;

        const limit = await rateLimiters.session.limitRequest(req, userId);
        if (!limit.allowed) return limit.response;

        const data = await accountLinkService.listMethods(userId);
        return NextResponse.json({ success: true, data }, { headers: { ...limit.headers, "Cache-Control": "no-store" } });
    } catch (error) {
        return errorResponse(error, "api/user/accounts");
    }
}
