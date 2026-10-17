import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { parseOrThrow, purchaseSchema, readJson } from "@/lib/validation/premium";
import { commerceService } from "@/services/commerce.service";

/**
 * Starts a money purchase: creates (or reuses) a pending order and returns the provider's
 * checkout URL. Access is granted only by the verified webhook, never by the return redirect.
 */
export const POST = apiRoute(
    async ({ req, userId }) => {
        const input = parseOrThrow(purchaseSchema, await readJson(req));
        return commerceService.checkout({ userId, ...input });
    },
    { context: "api/commerce/checkout", csrf: true, limiter: rateLimiters.commerce }
);
