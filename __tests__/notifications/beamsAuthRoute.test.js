import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/pusher/beams-auth: the Beams TokenProvider asks for a token for `user_id`; only the
 * signed-in user's own public id gets one.
 */
let session = null;
const beamsToken = vi.fn();

vi.mock("@/lib/session", () => ({
    requireAuthSession: async () => {
        if (!session) {
            const { ApiError } = await import("@/lib/error/apiError");
            throw new ApiError("Unauthorized", 401);
        }
        return session;
    },
}));
vi.mock("@/lib/requestGuard", () => ({ assertSameOrigin: () => {} }));
vi.mock("@/lib/rateLimit", () => ({
    RateLimiter: { getClientIp: () => "127.0.0.1" },
    rateLimiters: { realtime: { limitRequest: async () => ({ allowed: true, headers: {} }) } },
}));
vi.mock("@/lib/beams", () => ({ beamsToken: (...a) => beamsToken(...a) }));

const { GET } = await import("@/app/api/pusher/beams-auth/route");
const get = (qs) => GET(new Request(`http://localhost/api/pusher/beams-auth${qs}`));

beforeEach(() => {
    beamsToken.mockReset();
    beamsToken.mockResolvedValue({ token: "jwt" });
    session = { user: { id: "P1" } };
});

describe("/api/pusher/beams-auth", () => {
    it("is 401 signed out", async () => {
        session = null;
        expect((await get("?user_id=P1")).status).toBe(401);
    });

    it("is 403 for another user's id", async () => {
        expect((await get("?user_id=P2")).status).toBe(403);
        expect(beamsToken).not.toHaveBeenCalled();
    });

    it("returns the token for the session user", async () => {
        const res = await get("?user_id=P1");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ token: "jwt" });
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(beamsToken).toHaveBeenCalledWith("P1");
    });

    it("is 503 when Beams is not configured", async () => {
        beamsToken.mockResolvedValue(null);
        expect((await get("?user_id=P1")).status).toBe(503);
    });
});
