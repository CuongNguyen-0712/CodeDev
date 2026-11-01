import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminChallengePatchSchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId, readJson } from "@/lib/validation/premium";
import { adminChallengeService } from "@/services/adminChallenge.service";

// PATCH { status?, isPublished?, points?, reason }: audited with the values before and after.
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "challenge.update"]);
        const input = parseOrThrow(adminChallengePatchSchema, await readJson(req));
        return adminChallengeService.update({ actor, challengeId: parseOrThrow(publicId, params.id), input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/challenges/[id]", csrf: true, limiter: rateLimiters.admin }
);
