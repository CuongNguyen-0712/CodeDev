import { describe, expect, it, vi } from "vitest";

/**
 * /api/user/notifications GET: signed out is 401; the list takes the unread filter and cursor.
 */
let session = null;
const list = vi.fn(async () => ({ items: [], hasMore: false, nextCursor: null, unreadCount: 0 }));

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
    rateLimiters: { profile: { limitRequest: async () => ({ allowed: true, headers: {} }) } },
}));
vi.mock("@/services/notification.service", async () => {
    const actual = await vi.importActual("@/services/notification.service");
    return {
        decodeNotificationCursor: actual.decodeNotificationCursor,
        notificationService: { list: (...a) => list(...a) },
    };
});
vi.mock("@/db/notification.db", () => ({ notificationDb: {} }));
vi.mock("@/lib/pusher", () => ({ publishToUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ parseUtcTimestamp: (v) => v }));

const { GET } = await import("@/app/api/user/notifications/route");
const get = (qs = "") => GET(new Request(`http://localhost/api/user/notifications${qs}`));

describe("/api/user/notifications", () => {
    it("is 401 signed out", async () => {
        session = null;
        expect((await get()).status).toBe(401);
    });

    it("lists with the unread filter and cursor", async () => {
        session = { user: { id: "u1" } };
        const res = await get("?unread=1");
        expect(res.status).toBe(200);
        expect((await res.json()).data).toEqual({ items: [], hasMore: false, nextCursor: null, unreadCount: 0 });
        expect(list).toHaveBeenLastCalledWith({ userId: "u1", unreadOnly: true, cursor: null });
        expect((await get("?nextCursor=garbage")).status).toBe(400);
    });
});
