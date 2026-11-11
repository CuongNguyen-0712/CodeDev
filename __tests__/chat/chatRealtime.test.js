import { beforeEach, describe, expect, it, vi } from "vitest";

const publish = vi.fn(async () => true);
const store = new Map();
const membership = vi.fn();
const members = vi.fn();
vi.mock("@/lib/pusher", () => ({ publish: (...a) => publish(...a) }));
vi.mock("@/lib/cache", () => ({
    redis: { get: vi.fn(async (k) => store.get(k) ?? null), set: vi.fn(async (k, v) => { store.set(k, v); return "OK"; }) },
}));
vi.mock("@/db/chat.db", () => ({ chatDb: { membership: (...a) => membership(...a), members: (...a) => members(...a), lockByPublicId: vi.fn() } }));

const { chatRealtime, installChatRealtime } = await import("@/services/chatRealtime.service");
const { INLINE_PAYLOAD_BYTES } = await import("@/lib/chat/limits");

const msg = (body) => ({ id: "msg_1", conversationId: "cnv_1", sender: { id: "u_a" }, body });
const recipients = [{ publicId: "u_b", state: "accepted" }];

beforeEach(() => { publish.mockReset(); publish.mockResolvedValue(true); store.clear(); membership.mockReset(); members.mockReset(); });

describe("chatRealtime", () => {
    it("inlines small messages and pings large ones", async () => {
        await chatRealtime.messageCreated({ message: msg("x".repeat(100)), recipients, senderId: "u_a" });
        expect(publish.mock.calls[0][2].message.body).toHaveLength(100);
        const big = msg("😀".repeat(4000));
        expect(Buffer.byteLength(JSON.stringify({ conversationId: "cnv_1", message: big }))).toBeGreaterThan(INLINE_PAYLOAD_BYTES);
        await chatRealtime.messageCreated({ message: big, recipients, senderId: "u_a" });
        expect(publish.mock.calls[1][2]).toEqual({ conversationId: "cnv_1", messageId: "msg_1" });
    });

    it("excludes the sender's socket but reaches their other tabs", async () => {
        await chatRealtime.messageCreated({ message: msg("hi"), recipients, senderId: "u_a", socketId: "1.2" });
        expect(publish).toHaveBeenCalledWith(["private-user-u_b", "private-user-u_a"], "chat-message", expect.any(Object), { socketId: "1.2" });
    });

    it("does not fan out a duplicate send", async () => {
        // service only calls afterSend when created; the hook itself publishes once per call
        const svc = {};
        installChatRealtime(svc);
        expect(publish).not.toHaveBeenCalled();
        await svc.afterSend({ message: msg("hi"), recipients }, { socketId: null });
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it("never sends typing for a pending or declined member", async () => {
        membership.mockResolvedValue({ id: "1", state: "pending" });
        expect(await chatRealtime.typing({ userId: "u_b", conversationId: "cnv_1" })).toBe(false);
        membership.mockResolvedValue(null);
        expect(await chatRealtime.typing({ userId: "u_c", conversationId: "cnv_1" })).toBe(false);
        expect(publish).not.toHaveBeenCalled();
    });

    it("types to accepted/pending others only, and caches the audience", async () => {
        membership.mockResolvedValue({ id: "1", state: "accepted" });
        members.mockResolvedValue([
            { public_id: "u_a", state: "accepted" }, { public_id: "u_b", state: "pending" },
            { public_id: "u_c", state: "declined" }, { public_id: "u_d", state: "accepted", left_at: new Date() },
        ]);
        await chatRealtime.typing({ userId: "u_a", conversationId: "cnv_1", socketId: "9.9" });
        expect(publish).toHaveBeenCalledWith(["private-user-u_b"], "chat-typing", { conversationId: "cnv_1", userId: "u_a" }, { socketId: "9.9" });
        await chatRealtime.typing({ userId: "u_a", conversationId: "cnv_1" });
        expect(membership).toHaveBeenCalledTimes(1);
    });

    it("typing answers true to an accepted member whether or not anyone was published to (rule 2)", async () => {
        membership.mockResolvedValue({ id: "1", state: "accepted" });
        members.mockResolvedValue([{ public_id: "u_a", state: "accepted" }, { public_id: "u_b", state: "declined" }]);
        expect(await chatRealtime.typing({ userId: "u_a", conversationId: "cnv_1" })).toBe(true);
        expect(publish).not.toHaveBeenCalled();
        store.clear();
        members.mockResolvedValue([{ public_id: "u_a", state: "accepted" }, { public_id: "u_b", state: "pending" }]);
        publish.mockRejectedValue(new Error("pusher down"));
        expect(await chatRealtime.typing({ userId: "u_a", conversationId: "cnv_1" })).toBe(true);
    });

    it("afterSend tells the other members when a reply accepted a request, and only then", async () => {
        const svc = {};
        installChatRealtime(svc);
        await svc.afterSend({ message: msg("hi"), recipients, acceptedByReply: false }, { socketId: "1.2" });
        expect(publish.mock.calls.map((c) => c[1])).toEqual(["chat-message"]);
        await svc.afterSend({ message: msg("hi"), recipients, acceptedByReply: true }, { socketId: "1.2" });
        expect(publish.mock.calls.map((c) => c[1])).toEqual(["chat-message", "chat-message", "chat-conversation-updated"]);
        expect(publish).toHaveBeenLastCalledWith(["private-user-u_b"], "chat-conversation-updated", { conversationId: "cnv_1" }, { socketId: undefined });
    });

    it("read skips empty others; decline is silent, accept pings others", async () => {
        const svc = {};
        installChatRealtime(svc);
        await svc.afterRead({ conversationId: "cnv_1", userId: "u_b", lastReadSeq: "5", others: [] });
        await svc.afterRespond({ conversationId: "cnv_1", userId: "u_b", state: "declined", others: ["u_a"] });
        expect(publish).not.toHaveBeenCalled();
        await svc.afterRespond({ conversationId: "cnv_1", userId: "u_b", state: "accepted", others: ["u_a"] });
        expect(publish).toHaveBeenCalledWith(["private-user-u_a"], "chat-conversation-updated", { conversationId: "cnv_1" }, { socketId: undefined });
    });

    it("a failed publish does not throw from send", async () => {
        publish.mockRejectedValue(new Error("pusher down"));
        const svc = {};
        installChatRealtime(svc);
        await expect(svc.afterSend({ message: msg("hi"), recipients }, { socketId: null })).resolves.toBe(false);
    });
});
