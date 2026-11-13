import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { socialService } from "@/services/social.service";

/** GET /api/friends/invitations?direction=received|sent&cursor= -> { items, nextCursor }: pending invitations, newest first. */
export const GET = apiRoute(async ({ req, userId }) => {
    const q = new URL(req.url).searchParams;
    const direction = q.get("direction");
    if (direction !== "received" && direction !== "sent") throw new ApiError("Invalid direction", 400);
    return socialService.listInvitations({ userId, direction, cursor: q.get("cursor") || null });
}, { context: "api/friends/invitations", limiter: rateLimiters.api });
