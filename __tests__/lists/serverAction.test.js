import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_ERROR } from "@/constants/auth";
import { ApiError } from "@/lib/error/apiError";

const getAuthSession = vi.fn();
const requireAuthSession = vi.fn();
vi.mock("@/lib/session", () => ({ getAuthSession, requireAuthSession, getRequestMeta: async () => ({ headers: new Headers() }) }));
vi.mock("@/lib/rateLimit", () => ({ RateLimiter: { getClientIp: () => "203.0.113.7" } }));

const { runAction } = await import("@/lib/serverAction");

describe("runAction", () => {
    beforeEach(() => {
        getAuthSession.mockReset();
        requireAuthSession.mockReset();
    });

    it("signed out: 401 UNAUTHENTICATED and the handler never runs", async () => {
        requireAuthSession.mockRejectedValue(new ApiError("Unauthorized: please sign in to continue.", 401, { code: AUTH_ERROR.UNAUTHENTICATED }));
        const handler = vi.fn();
        expect(await runAction(handler)).toMatchObject({ success: false, status: 401, code: AUTH_ERROR.UNAUTHENTICATED });
        expect(handler).not.toHaveBeenCalled();
        expect(requireAuthSession).toHaveBeenCalledWith({ allowLocked: false });
    });

    it("locked account: 403 EMAIL_VERIFICATION_REQUIRED and the handler never runs", async () => {
        requireAuthSession.mockRejectedValue(new ApiError("Verify your email to keep using CodeDev.", 403, { code: AUTH_ERROR.EMAIL_VERIFICATION_REQUIRED, expose: true }));
        const handler = vi.fn();
        expect(await runAction(handler)).toMatchObject({ success: false, status: 403, code: AUTH_ERROR.EMAIL_VERIFICATION_REQUIRED });
        expect(handler).not.toHaveBeenCalled();
    });

    it("limiter refusal: 429 with retryAfter, keyed by the session user", async () => {
        requireAuthSession.mockResolvedValue({ user: { id: "usr_1" } });
        const limiter = { check: vi.fn(async () => ({ success: false, retryAfter: 30 })) };
        const handler = vi.fn();
        expect(await runAction(handler, { limiter })).toMatchObject({ success: false, status: 429, retryAfter: 30 });
        expect(limiter.check).toHaveBeenCalledWith("usr_1");
        expect(handler).not.toHaveBeenCalled();
    });

    it("gives the handler the session's user id and returns plain data", async () => {
        requireAuthSession.mockResolvedValue({ user: { id: "usr_1" } });
        const handler = vi.fn(async () => ({ at: new Date(0) }));
        expect(await runAction(handler)).toEqual({ success: true, data: { at: "1970-01-01T00:00:00.000Z" } });
        expect(handler.mock.calls[0][0].userId).toBe("usr_1");
    });

    it("auth false: guests are rate limited by client IP", async () => {
        getAuthSession.mockResolvedValue(null);
        const limiter = { check: vi.fn(async () => ({ success: true })) };
        const handler = vi.fn(async ({ userId }) => userId);
        expect(await runAction(handler, { auth: false, limiter })).toEqual({ success: true, data: null });
        expect(limiter.check).toHaveBeenCalledWith("203.0.113.7");
    });

    it("an unexpected error is a 500 without its internals", async () => {
        requireAuthSession.mockResolvedValue({ user: { id: "usr_1" } });
        const result = await runAction(async () => { throw new Error("relation secret_table does not exist"); });
        expect(result).toMatchObject({ success: false, status: 500 });
        expect(result.message).not.toMatch(/secret_table/);
    });
});
