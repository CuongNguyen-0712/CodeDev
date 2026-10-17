import { isProductionEnv } from "@/lib/appEnv.mjs";
import { ApiError } from "@/lib/error/apiError";
import { signatureHeader, verifySignatureHeader } from "@/services/payments/signature";

/**
 * Payment provider adapters. A provider implements:
 *   name                         lower-case id stored in commerce.payment.provider
 *   isEnabled()                  configured for this environment
 *   createCheckout(payment)      -> { providerRef, checkoutUrl }
 *   parseWebhook(rawBody, headers) -> normalised event, or throws ApiError 401 on a bad signature
 *
 * Normalised event: { eventId, type: payment.succeeded|failed|cancelled|refunded|disputed,
 *                     providerRef, paymentId, amountMinor, currency }
 *
 * No real provider is wired yet (choice pending: see docs/premium-onboarding-design.md). The
 * `mock` provider exercises the whole flow (signed webhooks included) outside production only.
 */

const EVENT_TYPES = new Set(["payment.succeeded", "payment.failed", "payment.cancelled", "payment.refunded", "payment.disputed"]);

function parseSignedEvent(secret, rawBody, headers) {
    if (!verifySignatureHeader(secret, rawBody, headers.get("x-codedev-signature"))) {
        throw new ApiError("Invalid signature", 401, { code: "INVALID_SIGNATURE" });
    }

    let body;
    try {
        body = JSON.parse(rawBody);
    } catch {
        throw new ApiError("Invalid payload", 400);
    }

    const event = {
        eventId: String(body?.id || ""),
        type: String(body?.type || ""),
        providerRef: body?.data?.providerRef ? String(body.data.providerRef) : null,
        paymentId: body?.data?.paymentId ? String(body.data.paymentId) : null,
        amountMinor: Number.isSafeInteger(body?.data?.amountMinor) ? body.data.amountMinor : null,
        currency: typeof body?.data?.currency === "string" ? body.data.currency.toUpperCase() : null,
    };

    if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(event.eventId) || !EVENT_TYPES.has(event.type)) {
        throw new ApiError("Invalid event", 400);
    }

    return event;
}

const mockProvider = {
    name: "mock",
    secret: () => process.env.PAYMENT_MOCK_WEBHOOK_SECRET || "",
    isEnabled() {
        return !isProductionEnv() && this.secret().length >= 16;
    },
    async createCheckout({ orderId, paymentId }) {
        return {
            providerRef: `mock_${paymentId}`,
            // Relative URL: the mock checkout page of this app (never used in production).
            checkoutUrl: `/checkout/mock/${encodeURIComponent(orderId)}`,
        };
    },
    parseWebhook(rawBody, headers) {
        return parseSignedEvent(this.secret(), rawBody, headers);
    },
    /** Builds a signed delivery as the provider would send it (mock checkout page, tests). */
    signEvent(event) {
        const rawBody = JSON.stringify(event);
        return { rawBody, headers: new Headers({ "x-codedev-signature": signatureHeader(this.secret(), rawBody) }) };
    },
};

const PROVIDERS = { [mockProvider.name]: mockProvider };

/** The provider used for new checkouts (PAYMENT_PROVIDER), or null when payments are off. */
export function getCheckoutProvider() {
    const name = String(process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
    const provider = PROVIDERS[name];
    return provider?.isEnabled() ? provider : null;
}

/** Provider addressed by a webhook URL; disabled providers do not exist from the outside. */
export function getWebhookProvider(name) {
    const provider = PROVIDERS[String(name || "").toLowerCase()];
    return provider?.isEnabled() ? provider : null;
}
