import { requirePermission } from "@/lib/authz";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminMfaCodeSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminMfaService } from "@/services/adminMfa.service";

// POST { code }: a code from the app or a recovery code; verifies this session and confirms it for
// 15 minutes of sensitive actions.
export const POST = apiRoute(
    async ({ req, userId, session }) => {
        const actor = await requirePermission(userId, "admin.read", { mfa: false });
        const input = parseOrThrow(adminMfaCodeSchema, await readJson(req));
        return adminMfaService.verify({ actor, sessionId: session?.user?.sessionId ? String(session.user.sessionId) : null, code: input.code });
    },
    { context: "api/admin/mfa/verify", csrf: true, limiter: rateLimiters.adminMfa }
);
