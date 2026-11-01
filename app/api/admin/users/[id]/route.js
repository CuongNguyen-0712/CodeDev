import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { parseOrThrow, publicId } from "@/lib/validation/premium";
import { adminUserService } from "@/services/adminUser.service";

// GET: profile, roles (with what this viewer may change), sessions and enrollments of one user.
export const GET = apiRoute(
    async ({ userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "user.read"]);
        return adminUserService.detail({ actor, userId: parseOrThrow(publicId, params.id) });
    },
    { context: "api/admin/users/[id]" }
);
