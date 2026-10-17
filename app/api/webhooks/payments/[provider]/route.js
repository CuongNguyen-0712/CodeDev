import { NextResponse } from "next/server";

import { ApiError, errorResponse } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { getWebhookProvider } from "@/services/payments";
import { commerceService } from "@/services/commerce.service";

const MAX_BODY = 64 * 1024;

/**
 * Payment provider webhook. Authenticated by the provider's signature over the raw body (no
 * session, no CSRF check). 2xx = processed or duplicate; 401 bad signature; 5xx = retry later.
 * Logs never contain the payload.
 */
export async function POST(req, { params }) {
    try {
        const limit = await rateLimiters.webhook.limitRequest(req);
        if (!limit.allowed) return limit.response;

        const { provider: name } = await params;
        const provider = getWebhookProvider(name);
        if (!provider) throw new ApiError("Not found", 404);

        const rawBody = await req.text();
        if (rawBody.length > MAX_BODY) throw new ApiError("Payload too large", 413);

        const event = provider.parseWebhook(rawBody, req.headers);
        const result = await commerceService.applyPaymentEvent({ provider: provider.name, event, rawBody });

        return NextResponse.json({ received: true, result: result.result }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return errorResponse(error, "api/webhooks/payments");
    }
}
