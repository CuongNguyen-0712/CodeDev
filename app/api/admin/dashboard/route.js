import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminDashboardService } from "@/services/adminDashboard.service";

// GET: Overview figures (cached 60 s), the 14-day submission series, recent audit and health.
export const GET = apiRoute(
    async ({ userId }) => {
        await requirePermission(userId, "admin.read");
        return adminDashboardService.overview();
    },
    { context: "api/admin/dashboard" }
);
