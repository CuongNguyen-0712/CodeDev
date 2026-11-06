import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminDashboardService } from "@/services/adminDashboard.service";

// GET ?days=14|30|90: Overview activity per UTC day, the window and the one before it (cached 60 s).
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, "admin.read");
        const params = new URL(req.url).searchParams;
        return adminDashboardService.activity({ days: Number(params.get("days")) || 14, tz: params.get("tz") || "UTC" });
    },
    { context: "api/admin/dashboard/activity" }
);
