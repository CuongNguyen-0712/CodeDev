import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Notification inbox service (migration 20261104_017): a row is written once per fact and the
 * user's tabs are told only when a row was written; course kinds carry the looked-up title.
 */
const insert = vi.fn();
const courseTitle = vi.fn(async () => ({ rows: [{ title: "Rust basics" }] }));
const publishToUser = vi.fn();

vi.mock("@/db/notification.db", () => ({
    notificationDb: {
        insert: (...args) => insert(...args),
        courseTitle: (...args) => courseTitle(...args),
        list: vi.fn(), unreadCount: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(),
    },
}));
vi.mock("@/lib/pusher", () => ({ publishToUser: (...args) => publishToUser(...args) }));
vi.mock("@/lib/db", () => ({ parseUtcTimestamp: (v) => v }));

const { notificationService, decodeNotificationCursor } = await import("@/services/notification.service");

describe("notificationService.notify", () => {
    beforeEach(() => { insert.mockReset(); publishToUser.mockClear(); courseTitle.mockClear(); });

    it("publishes notification-created with the new row's id and kind", async () => {
        insert.mockResolvedValue({ rows: [{ id: "n1", kind: "level_up" }] });
        const row = await notificationService.notify("u1", { kind: "level_up", title: "Level 2 reached", message: "x", dedupeKey: "2" });
        expect(row).toEqual({ id: "n1", kind: "level_up" });
        expect(insert).toHaveBeenCalledWith({ userId: "u1", kind: "level_up", title: "Level 2 reached", message: "x", link: null, dedupeKey: "2" });
        expect(publishToUser).toHaveBeenCalledWith("u1", "notification-created", { id: "n1", kind: "level_up" });
    });

    it("stays quiet when the fact was already notified (no row back)", async () => {
        insert.mockResolvedValue({ rows: [] });
        expect(await notificationService.notify("u1", { kind: "level_up", title: "t", message: "m", dedupeKey: "2" })).toBeNull();
        expect(publishToUser).not.toHaveBeenCalled();
    });

    it("never throws: the write that caused it already succeeded", async () => {
        insert.mockRejectedValue(new Error("db down"));
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await notificationService.notify("u1", { kind: "achievement", title: "t", message: "m" })).toBeNull();
        spy.mockRestore();
    });

    it("notifyCourse looks the title up and links a revoke to /orders", async () => {
        insert.mockResolvedValue({ rows: [{ id: "n2", kind: "access_revoked" }] });
        await notificationService.notifyCourse("u1", "access_revoked", "course-1", "ent-9");
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            kind: "access_revoked", link: "/orders", dedupeKey: "ent-9", message: "Your access to Rust basics was revoked.",
        }));
        await notificationService.notifyCourse("u1", "access_granted", "course-1");
        expect(insert).toHaveBeenLastCalledWith(expect.objectContaining({ link: "/course/course-1", dedupeKey: "course-1", title: "Course unlocked" }));
    });

    it("notifyRewards writes a level-up only when the level rose, and one row per achievement", async () => {
        insert.mockResolvedValue({ rows: [{ id: "n", kind: "k" }] });
        await notificationService.notifyRewards("u1", { level: 3, previousLevel: 3, achievements: [{ code: "first_blood", title: "First blood" }] });
        expect(insert).toHaveBeenCalledTimes(1);
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "achievement", message: "First blood", dedupeKey: "first_blood" }));
        await notificationService.notifyRewards("u1", { level: 4, previousLevel: 3 });
        expect(insert).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "level_up", title: "Level 4 reached", dedupeKey: "4" }));
        await notificationService.notifyRewards("u1", {});
        expect(insert).toHaveBeenCalledTimes(2);
    });
});

describe("decodeNotificationCursor", () => {
    it("accepts only what encodeCursor produced", () => {
        const raw = Buffer.from(JSON.stringify(["2026-11-04 10:00:00.123456", "6f3a1c2e-0000-4000-8000-000000000001"])).toString("base64url");
        expect(decodeNotificationCursor(raw)).toEqual({ createdAt: "2026-11-04 10:00:00.123456", id: "6f3a1c2e-0000-4000-8000-000000000001" });
        expect(decodeNotificationCursor(null)).toBeNull();
        expect(() => decodeNotificationCursor("nope")).toThrow(/Invalid cursor/);
        const bad = Buffer.from(JSON.stringify(["2026-11-04", "x"])).toString("base64url");
        expect(() => decodeNotificationCursor(bad)).toThrow(/Invalid cursor/);
    });
});
