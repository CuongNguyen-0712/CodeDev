import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { commerceService } from "@/services/commerce.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Point balance (PostgreSQL, never Redis) + ledger page. Cursor: ?beforeAt=<ISO>&beforeId=<uuid>.
export const GET = apiRoute(
    ({ req, userId }) => {
        const params = new URL(req.url).searchParams;
        const beforeAt = params.get("beforeAt");
        const beforeId = params.get("beforeId");

        let before = null;
        if (beforeAt || beforeId) {
            if (!beforeId || !UUID.test(beforeId) || Number.isNaN(Date.parse(beforeAt))) {
                throw new ApiError("Invalid cursor", 400);
            }
            before = { createdAt: new Date(beforeAt).toISOString(), id: beforeId };
        }

        const limit = Math.min(Math.max(Number.parseInt(params.get("limit"), 10) || 20, 1), 50);
        return commerceService.getWallet({ userId, before, limit });
    },
    { context: "api/commerce/wallet" }
);
