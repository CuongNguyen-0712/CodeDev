import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminDashboardService } from "@/services/adminDashboard.service";

// GET: Overview figures (cached 60 s), the 14-day submission series, recent audit and health.
export const GET = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, "admin.read");
        const fresh = new URL(req.url).searchParams.get("fresh") === "1";
        return adminDashboardService.overview({ canReadAudit: actor.permissions.has("audit.read"), fresh });
    },
    { context: "api/admin/dashboard" }
);
