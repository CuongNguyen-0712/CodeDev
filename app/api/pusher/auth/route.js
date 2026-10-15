import { NextResponse } from "next/server";

import { getAuthSession } from "@/lib/session";
import { getPusherServer } from "@/lib/pusher";
import { channels } from "@/lib/realtime";
import { ApiError, errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";

/**
 * Pusher private channel authorization (pusher-js posts form data: socket_id, channel_name).
 * A user may only subscribe to their own `private-user-{id}` channel.
 */
export async function POST(req) {
    try {
        const session = await getAuthSession();
        const userId = session?.user?.id;

        if (!userId) {
            throw new ApiError("Unauthorized", 401);
        }

        const limit = await rateLimiters.realtime.limitRequest(req, userId);
        if (!limit.allowed) return limit.response;

        const pusher = getPusherServer();
        if (!pusher) {
            throw new ApiError("Realtime is not configured", 503);
        }

        const form = await req.formData().catch(() => null);
        const socketId = String(form?.get("socket_id") || "");
        const channelName = String(form?.get("channel_name") || "");

        if (!/^\d+\.\d+$/.test(socketId) || !channelName) {
            throw new ApiError("Invalid channel authorization request", 400);
        }

        if (channelName !== channels.user(userId)) {
            throw new ApiError("Forbidden", 403);
        }

        const auth = pusher.authorizeChannel(socketId, channelName);

        return NextResponse.json(auth, { status: 200, headers: limit.headers });
    } catch (error) {
        return errorResponse(error, "api/pusher/auth");
    }
}
