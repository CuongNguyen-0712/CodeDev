import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { parseOrThrow, purchaseSchema, readJson } from "@/lib/validation/premium";
import { commerceService } from "@/services/commerce.service";

/**
 * Redeems a premium course with points. Body: { courseId, idempotencyKey }. The price comes from
 * the course's active points offer on the server; the same key replays the first result.
 */
export const POST = apiRoute(
    async ({ req, userId }) => {
        const input = parseOrThrow(purchaseSchema, await readJson(req));
        return commerceService.redeem({ userId, ...input });
    },
    { context: "api/commerce/redeem", csrf: true, limiter: rateLimiters.commerce }
);
