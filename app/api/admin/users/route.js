import { actorCan, requirePermission } from "@/lib/authz";
import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { adminService } from "@/services/admin.service";

// GET ?q=: find users by username / email prefix or public id (for point adjustments and grants).
export const GET = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, "admin.read");
        if (!actorCan(actor, "points.adjust") && !actorCan(actor, "entitlement.grant")) {
            throw new ApiError("You do not have permission to do this.", 403, { code: "FORBIDDEN" });
        }
        const query = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
        if (query.length < 2) return [];
        return adminService.findUsers({ query });
    },
    { context: "api/admin/users" }
);
