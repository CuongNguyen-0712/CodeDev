import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { runExpAudit } from "@/services/expAudit.service";

// GET /api/admin/exp-audit — the daily EXP audit report, computed now (read-only).
export const GET = apiRoute(
    async ({ userId }) => {
        await requirePermission(userId, "admin.read");
        return runExpAudit();
    },
    { context: "api/admin/exp-audit" }
);
