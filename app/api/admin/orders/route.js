import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminOrderListSchema } from "@/lib/validation/admin";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminService } from "@/services/admin.service";

// GET ?q=&status=&from=&to=: latest orders of every user (support / refunds), 50 at most.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "order.list"]);
        const input = parseOrThrow(adminOrderListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return adminService.listOrders(input);
    },
    { context: "api/admin/orders" }
);
