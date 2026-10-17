import { z } from "zod";

import { ApiError } from "@/lib/error/apiError";
import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { getWebhookProvider } from "@/services/payments";
import { commerceService } from "@/services/commerce.service";

const ORDER_ID = /^ord_[0-9a-f]{32}$/;
const outcomeSchema = z.object({ outcome: z.enum(["succeeded", "failed", "cancelled"]) }).strict();

/**
 * Development only: plays the payment provider for the mock checkout page. It builds the event a
 * provider would send, signs it, and feeds it through the same signature check and handler as
 * the real webhook. 404 whenever the mock provider is disabled (always in production).
 */
export const POST = apiRoute(
    async ({ req, userId, params }) => {
        const provider = getWebhookProvider("mock");
        if (!provider) throw new ApiError("Not found", 404);
        if (!ORDER_ID.test(params.orderId || "")) throw new ApiError("Order not found", 404);

        const { outcome } = parseOrThrow(outcomeSchema, await readJson(req));
        // Scoped to the signed-in user: someone else's order is a 404.
        const order = await commerceService.getOrder({ userId, orderId: params.orderId });
        const paymentId = order.payment?.id;
        if (order.method !== "gateway" || !paymentId || order.payment.provider !== provider.name) {
            throw new ApiError("Order not found", 404);
        }

        const delivery = provider.signEvent({
            id: `evt_mock_${paymentId}_${outcome}`,
            type: `payment.${outcome}`,
            data: { paymentId, providerRef: `mock_${paymentId}`, amountMinor: order.amountMinor, currency: order.currency },
        });
        const event = provider.parseWebhook(delivery.rawBody, delivery.headers);
        return commerceService.applyPaymentEvent({ provider: provider.name, event, rawBody: delivery.rawBody });
    },
    { context: "api/payments/mock", csrf: true, limiter: rateLimiters.commerce }
);
