import crypto from "crypto";
import { NextResponse } from "next/server";

import { runAccountMaintenance } from "@/services/accountMaintenance.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET|POST /api/internal/account-maintenance[?dryRun=1] — daily job for unverified accounts
 * (docs/email-verification-plan.md 11.2, 12): reminder mails 2 days before the lock and 2 days before the deletion, then permanent
 * deletion. Vercel Cron (vercel.json) calls it with GET and `Authorization: Bearer $CRON_SECRET`;
 * AUTH_CRON_SECRET works too for other schedulers. 404 when neither secret is configured.
 */
async function handle(req) {
    const secrets = [process.env.CRON_SECRET, process.env.AUTH_CRON_SECRET].filter(Boolean);
    if (secrets.length === 0) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    const presented = Buffer.from((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    const allowed = secrets.some((secret) => {
        const expected = Buffer.from(secret);
        return presented.length === expected.length && crypto.timingSafeEqual(presented, expected);
    });
    if (!allowed) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
    const data = await runAccountMaintenance({ dryRun });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
}

export { handle as GET, handle as POST };
