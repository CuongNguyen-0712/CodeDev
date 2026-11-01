import { requirePermission } from "@/lib/authz";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminMfaService } from "@/services/adminMfa.service";

// POST: a new secret for the authenticator app (409 once two-factor is set up).
export const POST = apiRoute(
    async ({ userId, session }) => {
        const actor = await requirePermission(userId, "admin.read", { mfa: false });
        return adminMfaService.setup({ actor, account: session?.user?.username || session?.user?.email || actor.publicId });
    },
    { context: "api/admin/mfa/setup", csrf: true, limiter: rateLimiters.adminMfa }
);
