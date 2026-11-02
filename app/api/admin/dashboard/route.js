import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminDashboardService } from "@/services/adminDashboard.service";

// GET: Overview figures (cached 60 s), the 14-day submission series, recent audit and health.
export const GET = apiRoute(
    async ({ userId }) => {
        const actor = await requirePermission(userId, "admin.read");
        return adminDashboardService.overview({ canReadAudit: actor.permissions.has("audit.read") });
    },
    { context: "api/admin/dashboard" }
);
