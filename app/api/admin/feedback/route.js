import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminFeedbackListSchema } from "@/lib/validation/admin";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminFeedbackService } from "@/services/adminFeedback.service";

// GET ?state=open|handled|all&cursor=: feedback sent about CodeDev, newest first, with counts.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "feedback.read"]);
        const input = parseOrThrow(adminFeedbackListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminFeedbackService.listFeedback({ state: input.state, cursor: input.cursor });
    },
    { context: "api/admin/feedback" }
);
