import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { accountLinkService } from "@/services/accountLink.service";

/** GET /api/user/accounts: Settings > Sign-in methods, `{ password, providers[] }`. */
export const GET = apiRoute(({ userId }) => accountLinkService.listMethods(userId), {
    context: "api/user/accounts",
    limiter: rateLimiters.session,
});
