import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { teamService } from "@/services/team.service";

/** GET /api/teams/invitations?cursor= -> { items, nextCursor }: the caller's pending team invitations, newest first. */
export const GET = apiRoute(async ({ req, userId }) => teamService.listInvitations({
    userId, cursor: new URL(req.url).searchParams.get("cursor") || null,
}), { context: "api/teams/invitations", limiter: rateLimiters.api });
