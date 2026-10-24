import { NextResponse } from "next/server";

import { readLinkCookie, clearLinkCookie } from "@/lib/authCookies";
import { maskEmail } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/auth/link — what /auth/link shows for the pending OAuth link (cookie set by the
 * next-auth signIn callback, docs/email-verification-plan.md 10.3 case 5). 404 when there is none
 * or it expired. Never returns the provider account id.
 */
export async function GET() {
    const link = await readLinkCookie();
    if (!link) {
        return NextResponse.json({ success: false, message: "This link request expired." }, { status: 404, headers: NO_STORE });
    }

    return NextResponse.json({
        success: true,
        data: { provider: link.provider, username: link.targetUsername, email: maskEmail(link.targetEmail), mode: link.mode || "claim" },
    }, { headers: NO_STORE });
}

/** DELETE /api/auth/link — cancels the pending link. */
export async function DELETE() {
    await clearLinkCookie();
    return NextResponse.json({ success: true }, { headers: NO_STORE });
}
