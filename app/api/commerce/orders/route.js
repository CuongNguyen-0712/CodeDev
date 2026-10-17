import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { commerceService } from "@/services/commerce.service";

const ORDER_ID = /^ord_[0-9a-f]{32}$/;

// Order history of the signed-in user, newest first. Cursor: ?before=<order id>.
export const GET = apiRoute(
    ({ req, userId }) => {
        const params = new URL(req.url).searchParams;
        const before = params.get("before");
        if (before && !ORDER_ID.test(before)) throw new ApiError("Invalid cursor", 400);

        const limit = Math.min(Math.max(Number.parseInt(params.get("limit"), 10) || 20, 1), 50);
        return commerceService.getOrders({ userId, before, limit });
    },
    { context: "api/commerce/orders" }
);
