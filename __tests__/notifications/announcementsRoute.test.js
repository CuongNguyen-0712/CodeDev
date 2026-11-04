import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/admin/announcements: the permission is checked first, and the body is validated before
 * the service runs: plain text lengths, links on this site only, known audience shapes.
 */
let allowed = true;
const create = vi.fn(async (args) => ({ id: "a1", status: "sent", ...args.input }));

vi.mock("@/lib/session", () => ({ requireAuthSession: async () => ({ user: { id: "admin1" } }) }));
vi.mock("@/lib/requestGuard", () => ({ assertSameOrigin: () => {} }));
vi.mock("@/lib/rateLimit", () => ({
    RateLimiter: { getClientIp: () => "127.0.0.1" },
    rateLimiters: { admin: { limitRequest: async () => ({ allowed: true, headers: {} }) } },
}));
vi.mock("@/lib/authz", async () => {
    const { ApiError } = await import("@/lib/error/apiError");
    return {
        requirePermission: async (_id, needed) => {
            if (!allowed) throw new ApiError("You do not have permission to do this.", 403);
            return { id: "1", needed };
        },
        requireRecentAuth: async () => {},
    };
});
vi.mock("@/services/announcement.service", () => ({
    announcementService: { create: (...a) => create(...a), list: vi.fn() },
    decodeAnnouncementCursor: () => null,
}));

const { POST } = await import("@/app/api/admin/announcements/route");
const post = (body) => POST(new Request("http://localhost/api/admin/announcements", { method: "POST", body: JSON.stringify(body) }));
const valid = { title: "Maintenance", body: "Down at 22:00 for 1 hour.", link: "/help", audience: { type: "all" } };

describe("POST /api/admin/announcements", () => {
    beforeEach(() => { allowed = true; create.mockClear(); });

    it("is 403 without announcement.send", async () => {
        allowed = false;
        expect((await post(valid)).status).toBe(403);
        expect(create).not.toHaveBeenCalled();
    });

    it("accepts a valid send", async () => {
        const res = await post(valid);
        expect(res.status).toBe(201);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ title: "Maintenance", link: "/help" }) }));
    });

    it("keeps links on this site", async () => {
        for (const link of ["https://evil.example", "//evil.example", "/\\evil.example", "/a b", "javascript:alert(1)"]) {
            expect((await post({ ...valid, link })).status).toBe(400);
        }
        expect((await post({ ...valid, link: "" })).status).toBe(201);
    });

    it("rejects unknown audiences, extra fields and oversize text", async () => {
        expect((await post({ ...valid, audience: { type: "everyone" } })).status).toBe(400);
        expect((await post({ ...valid, audience: { type: "role", roles: ["root"] } })).status).toBe(400);
        expect((await post({ ...valid, audience: { type: "users", userIds: [] } })).status).toBe(400);
        expect((await post({ ...valid, html: "<b>x</b>" })).status).toBe(400);
        expect((await post({ ...valid, title: "x".repeat(121) })).status).toBe(400);
        expect((await post({ ...valid, body: "x".repeat(1001) })).status).toBe(400);
        expect(create).not.toHaveBeenCalled();
    });
});
