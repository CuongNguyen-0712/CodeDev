import { NextResponse } from "next/server";

import { beamsToken } from "@/lib/beams";
import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";

/**
 * Beams Token for web push (docs/superpowers/specs/2026-11-07-beams-web-push-design.md 5.3).
 * The browser's TokenProvider sends a GET with `user_id` and the same-origin cookies; a user may
 * only bind a device to their own public id. The body is Beams' own `{ token }`, not the
 * `{ success, data }` envelope.
 */
export const GET = apiRoute(async ({ req, userId }) => {
    const requested = new URL(req.url).searchParams.get("user_id");
    if (requested !== userId) throw new ApiError("Forbidden", 403);

    const token = await beamsToken(userId);
    if (!token) throw new ApiError("Web push is not configured", 503);

    return NextResponse.json(token, { headers: { "Cache-Control": "no-store" } });
}, {
    context: "api/pusher/beams-auth",
    limiter: rateLimiters.realtime,
});
