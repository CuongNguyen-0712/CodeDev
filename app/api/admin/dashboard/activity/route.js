import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminDashboardService } from "@/services/adminDashboard.service";

// GET ?days=14|30|90: Overview activity per UTC day, the window and the one before it (cached 60 s).
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, "admin.read");
        const days = Number(new URL(req.url).searchParams.get("days")) || 14;
        return adminDashboardService.activity({ days });
    },
    { context: "api/admin/dashboard/activity" }
);
