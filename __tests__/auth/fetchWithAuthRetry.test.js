import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * fetchWithAuthRetry (docs/superpowers/specs/2026-11-14-realtime-auth-retry-design.md): the
 * Pusher and Beams auth calls follow the axios rule — 401 ACCESS_TOKEN_EXPIRED -> refresh ->
 * retry once; anything else is returned as is. Real `Response` objects, so a body read by the
 * helper is a body the caller can no longer read.
 */
describe("fetchWithAuthRetry (lib/authRefresh)", () => {
    let mod;
    let target;
    let refresh;

    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const ok = (body = {}) => json(200, body);
    const fail = (status, code) => json(status, { success: false, code, message: code });
    const okRefresh = () => ok({ success: true, data: { accessExpiresAt: Date.now() + 900_000 } });
    // A fresh Response per call: a body can be read only once.
    const answers = (...makers) => {
        let i = 0;
        return () => Promise.resolve(makers[Math.min(i++, makers.length - 1)]());
    };

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
        vi.restoreAllMocks();
    });

    it("retries once after refreshing on 401 ACCESS_TOKEN_EXPIRED", async () => {
        target.mockImplementation(answers(() => fail(401, "ACCESS_TOKEN_EXPIRED"), () => ok({ auth: "a" })));
        refresh.mockImplementation(answers(okRefresh));
        const body = new URLSearchParams({ socket_id: "1.2", channel_name: "private-user-u1" });
        const res = await mod.fetchWithAuthRetry("/api/pusher/auth", { method: "POST", body });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ auth: "a" });
        expect(target).toHaveBeenCalledTimes(2);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(target.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
        expect(target.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
        expect(target.mock.calls[1][1].body).toBe(body);
    });

    it("does not retry a second 401", async () => {
        target.mockImplementation(answers(() => fail(401, "ACCESS_TOKEN_EXPIRED")));
        refresh.mockImplementation(answers(okRefresh));
        const res = await mod.fetchWithAuthRetry("/api/pusher/auth");
        expect(res.status).toBe(401);
        expect(target).toHaveBeenCalledTimes(2);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it.each([[401, "UNAUTHENTICATED"], [403, "FORBIDDEN"], [429, "RATE_LIMITED"], [503, "AUTH_UNAVAILABLE"]])(
        "returns %i %s as is",
        async (status, code) => {
            target.mockImplementation(answers(() => fail(status, code)));
            const res = await mod.fetchWithAuthRetry("/api/pusher/auth");
            expect(res.status).toBe(status);
            expect((await res.json()).code).toBe(code);
            expect(target).toHaveBeenCalledTimes(1);
            expect(refresh).not.toHaveBeenCalled();
        },
    );

    it("does not retry a 401 without a JSON body", async () => {
        target.mockImplementation(answers(() => new Response("<html>Unauthorized</html>", { status: 401 })));
        const res = await mod.fetchWithAuthRetry("/api/pusher/auth");
        expect(res.status).toBe(401);
        expect(await res.text()).toBe("<html>Unauthorized</html>");
        expect(target).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("returns the original 401, body still readable, when the refresh fails", async () => {
        target.mockImplementation(answers(() => fail(401, "ACCESS_TOKEN_EXPIRED")));
        refresh.mockImplementation(answers(() => fail(401, "REFRESH_TOKEN_REUSED")));
        const res = await mod.fetchWithAuthRetry("/api/pusher/auth");
        expect(res.status).toBe(401);
        expect((await res.json()).code).toBe("ACCESS_TOKEN_EXPIRED");
        expect(target).toHaveBeenCalledTimes(1);
    });

    it("shares one refresh between concurrent expired calls", async () => {
        target.mockImplementation(answers(
            () => fail(401, "ACCESS_TOKEN_EXPIRED"),
            () => fail(401, "ACCESS_TOKEN_EXPIRED"),
            () => ok(),
        ));
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

    it("skips its own refresh when another one finished after the request started", async () => {
        // SessionWatcher (or another tab) refreshed while the auth request was in flight: the
        // retry already carries the new cookie, so no second rotation.
        let now = 1_000_000;
        vi.spyOn(Date, "now").mockImplementation(() => now);
        let answer;
        target
            .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }))
            .mockImplementation(answers(ok));
        refresh.mockImplementation(answers(okRefresh));

        const pending = mod.fetchWithAuthRetry("/api/pusher/auth");
        now += 50;
        await mod.refreshSession({ force: true });
        expect(refresh).toHaveBeenCalledTimes(1);

        now += 50;
        answer(fail(401, "ACCESS_TOKEN_EXPIRED"));
        const res = await pending;
        expect(res.status).toBe(200);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(target).toHaveBeenCalledTimes(2);
    });

    it("gives each attempt its own timeout signal", async () => {
        target.mockImplementation(answers(() => fail(401, "ACCESS_TOKEN_EXPIRED"), ok));
        refresh.mockImplementation(answers(okRefresh));
        await mod.fetchWithAuthRetry("/api/pusher/auth");
        const [first, second] = target.mock.calls.map(([, init]) => init.signal);
        expect(first).toBeInstanceOf(AbortSignal);
        expect(second).toBeInstanceOf(AbortSignal);
        expect(second).not.toBe(first);
    });

    it("keeps a caller's own signal", async () => {
        target.mockImplementation(answers(ok));
        const controller = new AbortController();
        await mod.fetchWithAuthRetry("/api/pusher/auth", { signal: controller.signal });
        expect(target.mock.calls[0][1].signal).toBe(controller.signal);
    });
});
