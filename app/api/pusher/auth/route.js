import { NextResponse } from "next/server";

import { getPusherServer } from "@/lib/pusher";
import { channels } from "@/lib/realtime";
import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";

/**
 * Pusher private channel authorization (form data: socket_id, channel_name), posted by
 * authorizeChannel in lib/pusherClient.js, which refreshes an expired access state and retries.
 * A user may only subscribe to their own `private-user-{id}` channel. The body is Pusher's own
 * format, not the `{ success, data }` envelope.
 */
export const POST = apiRoute(async ({ req, userId }) => {
    const pusher = getPusherServer();
    if (!pusher) throw new ApiError("Realtime is not configured", 503);

    const form = await req.formData().catch(() => null);
    const socketId = String(form?.get("socket_id") || "");
    const channelName = String(form?.get("channel_name") || "");
    if (!/^\d+\.\d+$/.test(socketId) || !channelName) {
        throw new ApiError("Invalid channel authorization request", 400);
    }
    if (channelName !== channels.user(userId)) throw new ApiError("Forbidden", 403);

    return NextResponse.json(pusher.authorizeChannel(socketId, channelName), { headers: { "Cache-Control": "no-store" } });
}, {
    context: "api/pusher/auth",
    allowLocked: true, // the lock page hears "verified" (plan 12.3)
    limiter: rateLimiters.realtime,
});
