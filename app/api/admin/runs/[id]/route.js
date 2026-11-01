import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { parseOrThrow, publicId } from "@/lib/validation/premium";
import { adminRunService } from "@/services/adminRun.service";

// GET: one run with its timeline and test results (no learner code or outputs: see ./source).
export const GET = apiRoute(
    async ({ userId, params }) => {
        await requirePermission(userId, ["admin.read", "submission.read"]);
        return adminRunService.detail({ runId: parseOrThrow(publicId, params.id) });
    },
    { context: "api/admin/runs/[id]" }
);
