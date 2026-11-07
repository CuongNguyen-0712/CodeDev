import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNATURE_HEADER_NAME, encodeSignatureHeader } from "@sanity/webhook";

/**
 * POST /api/webhooks/sanity: a signed lesson event drops the cached lesson body (after the
 * Content Lake consistency wait); a bad or missing signature is 401; without a secret it is 404.
 */
const del = vi.fn(async () => 1);

vi.mock("@/lib/cache", () => ({ redis: { del: (...args) => del(...args) } }));
vi.mock("@/lib/rateLimit", () => ({
    rateLimiters: { webhook: { limitRequest: async () => ({ allowed: true, headers: {} }) } },
}));

const { POST } = await import("@/app/api/webhooks/sanity/route");
const { cacheKeys } = await import("@/lib/cacheKeys");

const SECRET = "test-webhook-secret";
const payload = JSON.stringify({ _id: "drafts.lesson-1", _type: "lesson" });

async function post(signature) {
    const headers = signature ? { [SIGNATURE_HEADER_NAME]: signature } : {};
    const pending = POST(new Request("http://localhost/api/webhooks/sanity", { method: "POST", headers, body: payload }));
    // The signature check finishes off the microtask queue, so keep the fake clock moving until done.
    let done = false;
    pending.finally(() => { done = true; });
    while (!done) await vi.advanceTimersByTimeAsync(500);
    return pending;
}

describe("sanity webhook", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout"] });
        vi.stubEnv("SANITY_WEBHOOK_SECRET", SECRET);
        del.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it("drops the cached lesson for a signed event", async () => {
        const res = await post(await encodeSignatureHeader(payload, Date.now(), SECRET));
        expect(res.status).toBe(200);
        expect(del).toHaveBeenCalledWith(cacheKeys.lessonContent("lesson-1"));
    });

    it("refuses a wrong or missing signature", async () => {
        expect((await post(await encodeSignatureHeader(payload, Date.now(), "other-secret"))).status).toBe(401);
        expect((await post("not-a-signature")).status).toBe(401);
        expect((await post(null)).status).toBe(401);
        expect(del).not.toHaveBeenCalled();
    });

    it("does not exist without a secret", async () => {
        vi.stubEnv("SANITY_WEBHOOK_SECRET", "");
        expect((await post(await encodeSignatureHeader(payload, Date.now(), SECRET))).status).toBe(404);
        expect(del).not.toHaveBeenCalled();
    });
});
