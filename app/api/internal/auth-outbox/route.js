import crypto from "crypto";
import { NextResponse } from "next/server";

import { processAuthOutbox, cleanupAuthState } from "@/services/authOutbox.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/auth-outbox — drains the auth outbox (cache invalidations) and clears
 * expired refresh recovery data. For schedulers / serverless deployments where the in-process
 * worker does not run. Requires `Authorization: Bearer $AUTH_CRON_SECRET`; disabled (404) when
 * the secret is not configured.
 */
export async function POST(req) {
    const secret = process.env.AUTH_CRON_SECRET;
    if (!secret) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    const presented = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const a = Buffer.from(presented);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const outbox = await processAuthOutbox({ limit: 200 });
    const cleanup = await cleanupAuthState();

    return NextResponse.json({ success: true, data: { outbox, cleanup } }, { headers: { "Cache-Control": "no-store" } });
}
