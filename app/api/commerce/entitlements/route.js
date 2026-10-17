import { apiRoute } from "@/lib/routeHandler";
import { commerceService } from "@/services/commerce.service";

// The signed-in user's course entitlements (ownership summary used by course lists and pages).
export const GET = apiRoute(
    ({ userId }) => commerceService.getEntitlements({ userId }),
    { context: "api/commerce/entitlements" }
);
