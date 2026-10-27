import crypto from "crypto";
import { NextResponse } from "next/server";

import { auditSummary, runExpAudit } from "@/services/expAudit.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET|POST /api/internal/exp-audit — daily EXP reconciliation + anomaly report
 * (docs/master-plan-v1.3-adaptation.md P8). Reports and logs only; EXP is never changed.
 * Same auth as /api/internal/account-maintenance: Vercel Cron (vercel.json) sends
 * `Authorization: Bearer $CRON_SECRET`, AUTH_CRON_SECRET works too. 404 when neither is configured.
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

    try {
        const data = await runExpAudit();
        const summary = auditSummary(data);
        if (summary.startsWith("flagged")) console.warn(`[exp-audit] ${summary}`, JSON.stringify(data));
        else console.info(`[exp-audit] ${summary}`);
        return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[exp-audit] failed:", error?.message);
        return NextResponse.json({ success: false, message: "EXP audit failed" }, { status: 500 });
    }
}

export { handle as GET, handle as POST };
