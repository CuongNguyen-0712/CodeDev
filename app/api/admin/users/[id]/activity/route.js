import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminUserActivitySchema } from "@/lib/validation/admin";
import { parseOrThrow, publicId } from "@/lib/validation/premium";
import { adminUserService } from "@/services/adminUser.service";

// GET ?kinds=admin,session,run,submission,points,order&before=<iso>: the activity timeline.
export const GET = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "user.read"]);
        const input = parseOrThrow(adminUserActivitySchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminUserService.activity({ actor, userId: parseOrThrow(publicId, params.id), kinds: input.kinds, before: input.before });
    },
    { context: "api/admin/users/[id]/activity" }
);
