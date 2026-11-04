import { describe, expect, it, vi } from "vitest";

/**
 * /api/user/notifications: signed out is 401; PATCH takes { all: true } or 1-100 uuids.
 */
let session = null;
const list = vi.fn(async () => ({ items: [], hasMore: false, nextCursor: null, unreadCount: 0 }));
const markRead = vi.fn(async ({ ids }) => ({ updated: ids.length }));
const markAllRead = vi.fn(async () => ({ updated: 2 }));
const dismiss = vi.fn(async ({ ids }) => ({ updated: ids.length }));

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
        notificationService: { list: (...a) => list(...a), markRead: (...a) => markRead(...a), markAllRead: (...a) => markAllRead(...a), dismiss: (...a) => dismiss(...a) },
    };
});
vi.mock("@/db/notification.db", () => ({ notificationDb: {} }));
vi.mock("@/lib/pusher", () => ({ publishToUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ parseUtcTimestamp: (v) => v }));

const { GET, PATCH } = await import("@/app/api/user/notifications/route");
const get = (qs = "") => GET(new Request(`http://localhost/api/user/notifications${qs}`));
const patch = (body) => PATCH(new Request("http://localhost/api/user/notifications", { method: "PATCH", body: JSON.stringify(body) }));
const UUID = "6f3a1c2e-0000-4000-8000-000000000001";

describe("/api/user/notifications", () => {
    it("is 401 signed out", async () => {
        session = null;
        expect((await get()).status).toBe(401);
        expect((await patch({ all: true })).status).toBe(401);
    });

    it("lists with the unread filter and cursor", async () => {
        session = { user: { id: "u1" } };
        const res = await get("?unread=1");
        expect(res.status).toBe(200);
        expect((await res.json()).data).toEqual({ items: [], hasMore: false, nextCursor: null, unreadCount: 0 });
        expect(list).toHaveBeenLastCalledWith({ userId: "u1", unreadOnly: true, cursor: null });
        expect((await get("?nextCursor=garbage")).status).toBe(400);
    });

    it("marks read by ids or all, and rejects anything else", async () => {
        session = { user: { id: "u1" } };
        expect((await patch({})).status).toBe(400);
        expect((await patch({ ids: [] })).status).toBe(400);
        expect((await patch({ ids: ["not-a-uuid"] })).status).toBe(400);
        expect((await patch({ ids: Array(101).fill(UUID) })).status).toBe(400);

        expect((await (await patch({ ids: [UUID] })).json()).data).toEqual({ updated: 1 });
        expect(markRead).toHaveBeenCalledWith({ userId: "u1", ids: [UUID] });
        expect((await (await patch({ all: true })).json()).data).toEqual({ updated: 2 });
    });

    it("removes items with dismiss, never every item at once", async () => {
        session = { user: { id: "u1" } };
        expect((await (await patch({ ids: [UUID], dismiss: true })).json()).data).toEqual({ updated: 1 });
        expect(dismiss).toHaveBeenCalledWith({ userId: "u1", ids: [UUID] });
        markAllRead.mockClear();
        await patch({ all: true, dismiss: true });
        expect(dismiss).toHaveBeenCalledTimes(1);
    });
});
