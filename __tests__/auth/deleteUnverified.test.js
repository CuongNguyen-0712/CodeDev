import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/user/delete-unverified (docs/email-verification-plan.md 12.4): only right after a
 * Connect refused for this very session (sealed conflict cookie), and only with the username typed.
 */
const session = { user: { id: "a1", username: "alice", sessionId: "s1" } };
let conflict = null;
const deleteUnverified = vi.fn(async () => {});

vi.mock("@/lib/session", () => ({ requireAuthSession: async () => session }));
vi.mock("@/lib/requestGuard", () => ({ assertSameOrigin: () => {} }));
vi.mock("@/lib/rateLimit", () => ({
    RateLimiter: { getClientIp: () => "127.0.0.1" },
    rateLimiters: { profile: { limitRequest: async () => ({ allowed: true, headers: {} }) } },
}));
vi.mock("@/lib/authCookies", () => ({
    readLinkConflictCookie: async () => conflict,
    clearLinkConflictCookie: vi.fn(async () => {}),
    clearRefreshCookie: vi.fn(async () => {}),
}));
vi.mock("@/services/accountLink.service", () => ({ accountLinkService: { deleteUnverified: (...args) => deleteUnverified(...args) } }));

const { GET, POST } = await import("@/app/api/user/delete-unverified/route");
const post = (body) => POST(new Request("http://localhost/api/user/delete-unverified", { method: "POST", body: JSON.stringify(body) }));
const ownConflict = { userId: "a1", sessionId: "s1", provider: "google", ownerUsername: "bob", deletable: true, purgeAfter: null };

describe("delete-unverified", () => {
    beforeEach(() => { conflict = null; deleteUnverified.mockClear(); });

    it("refuses without a conflict of this session", async () => {
        expect((await post({ confirm: "alice" })).status).toBe(409);
        conflict = { ...ownConflict, sessionId: "other" };
        expect((await post({ confirm: "alice" })).status).toBe(409);
        expect((await (await GET()).json()).data.conflict).toBeNull();
        expect(deleteUnverified).not.toHaveBeenCalled();
    });

    it("needs the username typed, then deletes", async () => {
        conflict = ownConflict;
        expect((await (await GET()).json()).data.conflict).toMatchObject({ provider: "google", ownerUsername: "bob", deletable: true });
        expect((await post({ confirm: "bob" })).status).toBe(422);
        expect(deleteUnverified).not.toHaveBeenCalled();

        expect((await post({ confirm: " alice " })).status).toBe(200);
        expect(deleteUnverified).toHaveBeenCalledWith(expect.objectContaining({ userId: "a1", sessionId: "s1" }));
    });
});
