import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * fetchWithAuthRetry (docs/superpowers/specs/2026-11-14-realtime-auth-retry-design.md): the
 * Pusher and Beams auth calls follow the axios rule — 401 ACCESS_TOKEN_EXPIRED -> refresh ->
 * retry once; anything else is returned as is.
 */
describe("fetchWithAuthRetry (lib/authRefresh)", () => {
    let mod;
    let target;
    let refresh;

    const response = (status, body) => {
        const res = {
            ok: status >= 200 && status < 300,
            status,
            headers: new Headers(),
            json: body === undefined ? async () => { throw new SyntaxError("Unexpected end of JSON input"); } : async () => body,
        };
        res.clone = () => res;
        return res;
    };
    const ok = (body = {}) => response(200, body);
    const fail = (status, code) => response(status, { success: false, code, message: code });
    const okRefresh = () => ok({ success: true, data: { accessExpiresAt: Date.now() + 900_000 } });

    beforeEach(async () => {
        vi.resetModules();
        globalThis.window = globalThis;
        target = vi.fn();
        refresh = vi.fn();
        globalThis.fetch = vi.fn((url, init) => (String(url) === "/api/auth/refresh" ? refresh(url, init) : target(url, init)));
        mod = await import("@/lib/authRefresh");
    });

    afterEach(() => {
        delete globalThis.window;
    });

    it("retries once after refreshing on 401 ACCESS_TOKEN_EXPIRED", async () => {
        target.mockResolvedValueOnce(fail(401, "ACCESS_TOKEN_EXPIRED")).mockResolvedValueOnce(ok({ auth: "a" }));
        refresh.mockResolvedValue(okRefresh());
        const res = await mod.fetchWithAuthRetry("/api/pusher/auth", { method: "POST" });
        expect(res.status).toBe(200);
        expect(target).toHaveBeenCalledTimes(2);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(target.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
        expect(target.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    });

    it("does not retry a second 401", async () => {
        target.mockResolvedValue(fail(401, "ACCESS_TOKEN_EXPIRED"));
        refresh.mockResolvedValue(okRefresh());
        const res = await mod.fetchWithAuthRetry("/api/pusher/auth");
        expect(res.status).toBe(401);
        expect(target).toHaveBeenCalledTimes(2);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it.each([[401, "UNAUTHENTICATED"], [403, "FORBIDDEN"], [429, "RATE_LIMITED"], [503, "AUTH_UNAVAILABLE"]])(
        "returns %i %s as is",
        async (status, code) => {
            target.mockResolvedValue(fail(status, code));
            const res = await mod.fetchWithAuthRetry("/api/pusher/auth");
            expect(res.status).toBe(status);
            expect(target).toHaveBeenCalledTimes(1);
            expect(refresh).not.toHaveBeenCalled();
        },
    );

    it("does not retry a 401 without a JSON body", async () => {
        target.mockResolvedValue(response(401));
        const res = await mod.fetchWithAuthRetry("/api/pusher/auth");
        expect(res.status).toBe(401);
        expect(target).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("returns the original 401 when the refresh fails", async () => {
        const first = fail(401, "ACCESS_TOKEN_EXPIRED");
        target.mockResolvedValue(first);
        refresh.mockResolvedValue(fail(401, "REFRESH_TOKEN_REUSED"));
        const res = await mod.fetchWithAuthRetry("/api/pusher/auth");
        expect(res).toBe(first);
        expect(target).toHaveBeenCalledTimes(1);
    });

    it("shares one refresh between concurrent expired calls", async () => {
        target
            .mockResolvedValueOnce(fail(401, "ACCESS_TOKEN_EXPIRED"))
            .mockResolvedValueOnce(fail(401, "ACCESS_TOKEN_EXPIRED"))
            .mockResolvedValue(ok());
        refresh.mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 20));
            return okRefresh();
        });
        const [a, b] = await Promise.all([
            mod.fetchWithAuthRetry("/api/pusher/auth", { method: "POST" }),
            mod.fetchWithAuthRetry("/api/pusher/beams-auth?user_id=P1"),
        ]);
        expect([a.status, b.status]).toEqual([200, 200]);
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});
