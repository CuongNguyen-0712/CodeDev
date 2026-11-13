// Friend server actions: session userId, friend limiter, 400 on bad ids.
import { beforeEach, describe, expect, it, vi } from "vitest";

const socialService = { sendRequest: vi.fn(), respond: vi.fn(), cancel: vi.fn(), remove: vi.fn() };
vi.mock("@/services/social.service", () => ({ socialService }));
vi.mock("@/lib/serverAction", () => ({
    runAction: async (handler, options) => {
        try {
            return { success: true, data: await handler({ userId: "u1" }), options };
        } catch (error) {
            return { success: false, status: error.status, message: error.message };
        }
    },
}));

const a = await import("@/actions/social.actions");
const { rateLimiters } = await import("@/lib/rateLimit");

const result = { friendship: "sent", user: { id: "usr_x" }, extra: "hidden" };

beforeEach(() => {
    Object.values(socialService).forEach((f) => f.mockReset().mockResolvedValue(result));
});

describe("friend actions", () => {
    it.each([
        ["sendFriendRequestAction", "sendRequest", ["usr_t"], { userId: "u1", targetId: "usr_t" }],
        ["cancelFriendRequestAction", "cancel", ["usr_t"], { userId: "u1", targetId: "usr_t" }],
        ["removeFriendAction", "remove", ["usr_t"], { userId: "u1", targetId: "usr_t" }],
        ["respondFriendRequestAction", "respond", [{ userId: "usr_t", accept: true }], { userId: "u1", targetId: "usr_t", accept: true }],
    ])("%s calls the service with the session user and the friend limiter", async (action, method, args, expected) => {
        const r = await a[action](...args);
        expect(socialService[method]).toHaveBeenCalledWith(expected);
        expect(r.success).toBe(true);
        expect(r.options.limiter).toBe(rateLimiters.friend);
        expect(r.data).toEqual({ friendship: "sent", user: { id: "usr_x" } });
    });

    it.each([
        ["sendFriendRequestAction", ""], ["sendFriendRequestAction", undefined], ["cancelFriendRequestAction", 5],
        ["removeFriendAction", "x".repeat(65)], ["respondFriendRequestAction", { userId: "usr_t" }],
        ["respondFriendRequestAction", { userId: "", accept: true }],
    ])("%s rejects bad input with 400", async (action, input) => {
        expect(await a[action](input)).toMatchObject({ success: false, status: 400 });
        Object.values(socialService).forEach((f) => expect(f).not.toHaveBeenCalled());
    });
});
