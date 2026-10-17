import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminService } from "@/services/admin.service";

// Latest orders of every user (support / refunds).
export const GET = apiRoute(
    async ({ userId }) => {
        await requirePermission(userId, "order.list");
        return adminService.listOrders();
    },
    { context: "api/admin/orders" }
);
