import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminService } from "@/services/admin.service";

// Latest admin actions (append-only audit log).
export const GET = apiRoute(
    async ({ userId }) => {
        await requirePermission(userId, "admin.read");
        return adminService.listAudit();
    },
    { context: "api/admin/audit" }
);
