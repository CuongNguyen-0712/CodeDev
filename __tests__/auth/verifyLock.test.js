import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Lock after the 7-day verify grace period (docs/email-verification-plan.md 12.3): the
 * `verifyLockAt` claim, proxy.js redirects and the API guard in lib/session.js.
 */
const getToken = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...args) => getToken(...args) }));
vi.mock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [], get: () => undefined }),
    headers: async () => new Headers(),
}));
vi.mock("@/services/auth.service", () => ({
    authService: { getSessionStatus: vi.fn(async () => ({ userId: "u1" })) },
}));

const { isVerifyLocked, safeNextPath, goToVerifyRequired } = await import("@/lib/verifyLock");
const { getAuthSession, requireAuthSession } = await import("@/lib/session");
const { default: proxy } = await import("@/proxy");

const HOUR = 3600_000;
const tokenWith = (verifyLockAt) => ({ id: "u1", sid: "s1", accessExpiresAt: Date.now() + HOUR, verifyLockAt });

describe("verify lock claim", () => {
    it("locks only once the deadline has passed", () => {
        expect(isVerifyLocked(tokenWith(Date.now() - 1))).toBe(true);
        expect(isVerifyLocked(tokenWith(Date.now() + HOUR))).toBe(false);
        expect(isVerifyLocked(tokenWith(null))).toBe(false);
        expect(isVerifyLocked({ id: "u1" })).toBe(false); // cookies minted before the claim existed
    });

    it("keeps `next` on this site", () => {
        expect(safeNextPath("/learning/abc?tab=1")).toBe("/learning/abc?tab=1");
        expect(safeNextPath("/authors")).toBe("/authors");
        for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "/auth/verify-required", "/auth", "/auth?x=1", null]) {
            expect(safeNextPath(bad)).toBe("/home");
        }
    });
});

describe("client redirect on 403", () => {
    const at = (pathname) => {
        const assign = vi.fn();
        vi.stubGlobal("window", { location: { pathname, search: "?a=1", assign } });
        goToVerifyRequired();
        vi.unstubAllGlobals();
        return assign;
    };

    it("goes to the lock page with `next`, but never away from /auth pages", () => {
        expect(at("/learning/x")).toHaveBeenCalledWith("/auth/verify-required?next=%2Flearning%2Fx%3Fa%3D1");
        // /auth/verify-email must finish verifying even when the navbar's own requests get 403.
        for (const page of ["/auth/verify-email", "/auth/verify-required", "/auth"]) expect(at(page)).not.toHaveBeenCalled();
    });
});

describe("API guard", () => {
    beforeEach(() => getToken.mockReset());

    it("refuses a locked account with 403 EMAIL_VERIFICATION_REQUIRED unless the route allows it", async () => {
        getToken.mockResolvedValue(tokenWith(Date.now() - HOUR));
        await expect(requireAuthSession()).rejects.toMatchObject({ status: 403, errorCode: "EMAIL_VERIFICATION_REQUIRED" });
        expect(await getAuthSession({ soft: true })).toBeNull();
        expect((await requireAuthSession({ allowLocked: true })).user.id).toBe("u1");
    });

    it("lets an account in its grace period through", async () => {
        getToken.mockResolvedValue(tokenWith(Date.now() + HOUR));
        expect((await requireAuthSession()).user.id).toBe("u1");
    });

    it("asks for a refresh first when the access state expired (the refresh re-reads the claim)", async () => {
        getToken.mockResolvedValue({ ...tokenWith(Date.now() - HOUR), accessExpiresAt: Date.now() - 1 });
        await expect(requireAuthSession()).rejects.toMatchObject({ status: 401, errorCode: "ACCESS_TOKEN_EXPIRED" });
    });
});

describe("proxy", () => {
    beforeEach(() => getToken.mockReset());

    it("sends a locked account from a signed-in page to /auth/verify-required with `next`", async () => {
        getToken.mockResolvedValue(tokenWith(Date.now() - HOUR));
        const res = await proxy(new NextRequest("http://localhost/home?tab=2"));
        const location = new URL(res.headers.get("location"));
        expect(location.pathname).toBe("/auth/verify-required");
        expect(location.searchParams.get("next")).toBe("/home?tab=2");
    });

    it("leaves public pages, the lock page and unlocked accounts alone", async () => {
        getToken.mockResolvedValue(tokenWith(Date.now() - HOUR));
        expect((await proxy(new NextRequest("http://localhost/auth/verify-required"))).headers.get("location")).toBeNull();

        getToken.mockResolvedValue(tokenWith(Date.now() + HOUR));
        expect((await proxy(new NextRequest("http://localhost/home"))).headers.get("location")).toBeNull();
    });
});
