import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminMfaCodeSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminMfaService } from "@/services/adminMfa.service";

// POST { code }: the first code from the app; enrols and returns the recovery codes (shown once).
export const POST = apiRoute(
    async ({ req, userId, session }) => {
        const actor = await requirePermission(userId, "admin.read", { mfa: false });
        const input = parseOrThrow(adminMfaCodeSchema, await readJson(req));
        return adminMfaService.confirm({ actor, sessionId: session?.user?.sessionId ? String(session.user.sessionId) : null, code: input.code, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/mfa/confirm", csrf: true, limiter: rateLimiters.adminMfa }
);
