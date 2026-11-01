import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminRunListSchema } from "@/lib/validation/admin";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminRunService } from "@/services/adminRun.service";

// GET ?tab=active|failed|timeout|all&language=&type=&user=&cursor=: runs, tab counts and the queue per sandbox.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "submission.read"]);
        const input = parseOrThrow(adminRunListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminRunService.list({ tab: input.tab, language: input.language, runType: input.type, userId: input.user, cursor: input.cursor });
    },
    { context: "api/admin/runs/list" }
);
