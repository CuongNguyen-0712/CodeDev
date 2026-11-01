import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminOpsService } from "@/services/adminOps.service";

// GET: health, the code-run queue, the outbox, open dead letters and database figures.
export const GET = apiRoute(
    async ({ userId }) => {
        await requirePermission(userId, ["admin.read", "ops.read"]);
        return adminOpsService.overview();
    },
    { context: "api/admin/system" }
);
