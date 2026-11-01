import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminChallengeListSchema } from "@/lib/validation/admin";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminChallengeService } from "@/services/adminChallenge.service";

// GET ?course=<publicId>: every challenge of the course, published or not, in lesson order.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, "admin.read");
        const input = parseOrThrow(adminChallengeListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminChallengeService.listByCourse({ courseId: input.course });
    },
    { context: "api/admin/challenges" }
);
