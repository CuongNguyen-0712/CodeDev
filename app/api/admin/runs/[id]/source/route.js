import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { parseOrThrow, publicId } from "@/lib/validation/premium";
import { adminRunService } from "@/services/adminRun.service";

// GET: the learner's code and the test outputs. Every read is written to the audit log.
export const GET = apiRoute(
    async ({ userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "submission.read"]);
        return adminRunService.source({ actor, runId: parseOrThrow(publicId, params.id) });
    },
    { context: "api/admin/runs/[id]/source" }
);
