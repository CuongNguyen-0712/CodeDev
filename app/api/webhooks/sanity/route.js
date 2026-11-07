import { NextResponse } from "next/server";
import { SIGNATURE_HEADER_NAME, isValidSignature } from "@sanity/webhook";

import { ApiError, errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";

const CONSISTENCY_WAIT_MS = 3000;

/**
 * Sanity webhook (filter: _type == "lesson", projection { _id, _type }): drops the cached lesson
 * body, so an edit reaches learners at once instead of after TTL.LESSON_CONTENT. Authenticated by
 * the webhook signature (SANITY_WEBHOOK_SECRET); without the secret the endpoint does not exist.
 */
export async function POST(req) {
    try {
        const secret = process.env.SANITY_WEBHOOK_SECRET;
        if (!secret) throw new ApiError("Not found", 404);

        const limit = await rateLimiters.webhook.limitRequest(req);
        if (!limit.allowed) return limit.response;

        const signature = req.headers.get(SIGNATURE_HEADER_NAME);
        const raw = await req.text();
        const valid = signature ? await isValidSignature(raw, signature, secret.trim()).catch(() => false) : false;
        if (!valid) throw new ApiError("Invalid signature", 401);

        // Content Lake is eventually consistent: wait before dropping the cache so the next read
        // gets the edit (same 3 s wait next-sanity's parseBody used).
        await new Promise((resolve) => setTimeout(resolve, CONSISTENCY_WAIT_MS));
        const body = raw.trim() ? JSON.parse(raw) : null;

        if (body?._type === "lesson" && typeof body._id === "string") {
            await redis.del(cacheKeys.lessonContent(body._id.replace(/^drafts\./, "")));
        }

        return NextResponse.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return errorResponse(error, "api/webhooks/sanity");
    }
}
