import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { accountLinkService } from "@/services/accountLink.service";

export const dynamic = "force-dynamic";

/** GET /api/user/accounts: Settings > Sign-in methods, `{ password, providers[] }`. */
export const GET = apiRoute(({ userId }) => accountLinkService.listMethods(userId), {
    context: "api/user/accounts",
    limiter: rateLimiters.session,
});
