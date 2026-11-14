import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { teamService } from "@/services/team.service";

/** GET /api/teams/[id]/members -> { team: { id, name }, items }: approved members by join order, plus the invited for the host. */
export const GET = apiRoute(async ({ userId, params }) => teamService.members({ userId, teamId: String(params.id) }),
    { context: "api/teams/members", limiter: rateLimiters.api });
