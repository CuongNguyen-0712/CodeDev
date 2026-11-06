import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminUserListSchema } from "@/lib/validation/admin";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminUserService } from "@/services/adminUser.service";

// GET ?tab=&q=&role=&sort=newest|oldest|seen&joinedFrom=&joinedTo=&cursor=: one page of users, with the count of each tab.
export const GET = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, ["admin.read", "user.read"]);
        const input = parseOrThrow(adminUserListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminUserService.list({
            actor, tab: input.tab, search: input.q, role: input.role, sort: input.sort,
            joinedFrom: input.joinedFrom, joinedTo: input.joinedTo, cursor: input.cursor,
        });
    },
    { context: "api/admin/users/list" }
);
