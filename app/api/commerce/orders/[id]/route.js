import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { commerceService } from "@/services/commerce.service";

const ORDER_ID = /^ord_[0-9a-f]{32}$/;

// One order of the signed-in user (another user's order is a 404). Polled by the return page.
export const GET = apiRoute(
    ({ userId, params }) => {
        if (!ORDER_ID.test(params.id || "")) throw new ApiError("Order not found", 404);
        return commerceService.getOrder({ userId, orderId: params.id });
    },
    { context: "api/commerce/orders/[id]" }
);
