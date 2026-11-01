import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminMfaService } from "@/services/adminMfa.service";

// GET: whether this account needs the second factor, has enrolled, and this session passed it.
export const GET = apiRoute(
    async ({ userId, session }) => {
        const actor = await requirePermission(userId, "admin.read", { mfa: false });
        return adminMfaService.status({ actor, sessionId: session?.user?.sessionId ? String(session.user.sessionId) : null });
    },
    { context: "api/admin/mfa" }
);
