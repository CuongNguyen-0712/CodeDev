import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminCommentListSchema } from "@/lib/validation/admin";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminFeedbackService } from "@/services/adminFeedback.service";

// GET ?course=&state=&cursor=: one page of course comments (every course without `course`), newest first.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "comment.moderate"]);
        const input = parseOrThrow(adminCommentListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminFeedbackService.listComments({ courseId: input.course || null, state: input.state, cursor: input.cursor });
    },
    { context: "api/admin/comments" }
);
