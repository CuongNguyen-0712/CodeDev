import { beforeEach, describe, expect, it, vi } from "vitest";

const pushToUsers = vi.fn(async () => true);
const remove = vi.fn(async () => { });
const pushSummary = vi.fn();
const purge = vi.fn();
const send = vi.fn(async () => ({}));
let enabled = true;
vi.mock("@/lib/beams", () => ({ pushToUsers: (...a) => pushToUsers(...a) }));
vi.mock("@/lib/chatMedia", () => ({ remove: (...a) => remove(...a) }));
vi.mock("@/lib/inngest", async (original) => {
    const real = await original();
    return { ...real, inngestEnabled: () => enabled, inngest: Object.assign(real.inngest, { send: (...a) => send(...a) }) };
});
vi.mock("@/services/chat.service", () => ({ chatService: { pushSummary: (...a) => pushSummary(...a), purgeOrphanAttachments: (...a) => purge(...a) } }));

const { chatPush, chatAttachmentDelete, chatOrphanAttachments } = await import("@/jobs/chat");
const { functions } = await import("@/jobs/index");
const { installChatJobs, queueAttachmentDelete } = await import("@/services/chatJobs.service");

const step = { run: vi.fn(async (_name, fn) => fn()) };
const handler = (f) => f.fn ?? f["fn"];
const run = (f, event = { data: {} }) => handler(f)({ event, step });

beforeEach(() => {
    for (const m of [pushToUsers, remove, pushSummary, purge, send, step.run]) m.mockClear();
    enabled = true;
});

describe("chat push job", () => {
    const event = { data: { userId: "u_b", conversationId: "cnv_1", seq: "5" } };

    it("pushes nothing when there is nothing to say", async () => {
        pushSummary.mockResolvedValue(null);
        await run(chatPush, event);
        expect(pushSummary).toHaveBeenCalledWith({ userId: "u_b", conversationId: "cnv_1" });
        expect(pushToUsers).not.toHaveBeenCalled();
    });

    it("pushes the summary to the recipient", async () => {
        const summary = { title: "Ann", body: "3 new messages", link: "/messages/cnv_1" };
        pushSummary.mockResolvedValue(summary);
        await run(chatPush, event);
        expect(pushToUsers).toHaveBeenCalledWith(["u_b"], summary);
    });
});

describe("chat attachment delete job", () => {
    it("deletes every key", async () => {
        await run(chatAttachmentDelete, { data: { keys: ["a", "b"] } });
        expect(remove.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    });

    it("throws when a delete fails, after trying the rest", async () => {
        remove.mockRejectedValueOnce(new Error("boom"));
        await expect(run(chatAttachmentDelete, { data: { keys: ["a", "b"] } })).rejects.toThrow();
        expect(remove).toHaveBeenCalledTimes(2);
    });
});

describe("chat orphan cron", () => {
    it("purges in batches of 50 until nothing is removed", async () => {
        purge.mockResolvedValueOnce({ removed: 50 }).mockResolvedValueOnce({ removed: 3 }).mockResolvedValueOnce({ removed: 0 });
        expect(await run(chatOrphanAttachments)).toEqual({ removed: 53 });
        expect(purge).toHaveBeenCalledTimes(3);
        expect(purge).toHaveBeenCalledWith({ limit: 50 });
    });

    it("stops after 20 steps", async () => {
        purge.mockResolvedValue({ removed: 1 });
        await run(chatOrphanAttachments);
        expect(purge).toHaveBeenCalledTimes(20);
    });
});

describe("registration", () => {
    it("registers the three functions", () => {
        expect(functions.map((f) => f.id())).toEqual(expect.arrayContaining(["chat-push", "chat-attachment-delete", "chat-orphan-attachments"]));
    });
});

describe("installChatJobs", () => {
    const message = { id: "msg_1", conversationId: "cnv_1", seq: "9" };
    const recipients = [{ publicId: "u_b", state: "accepted" }, { publicId: "u_c", state: "pending" }, { publicId: "u_d", state: "accepted" }];

    it("keeps the realtime hook and sends one event per accepted recipient in one call", async () => {
        const realtime = vi.fn(async () => { });
        const service = { afterSend: realtime };
        installChatJobs(service);
        await service.afterSend({ message, recipients }, { socketId: "s" });
        expect(realtime).toHaveBeenCalledWith({ message, recipients }, { socketId: "s" });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toEqual([
            { id: "chat-msg-msg_1-u_b", name: "chat/message.created", data: { userId: "u_b", conversationId: "cnv_1", seq: "9" } },
            { id: "chat-msg-msg_1-u_d", name: "chat/message.created", data: { userId: "u_d", conversationId: "cnv_1", seq: "9" } },
        ]);
    });

    it("sends the events even when realtime fails, and never throws", async () => {
        const service = { afterSend: vi.fn(async () => { throw new Error("pusher"); }) };
        installChatJobs(service);
        send.mockRejectedValueOnce(new Error("inngest"));
        await expect(service.afterSend({ message, recipients })).resolves.toBeUndefined();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("skips sending when Inngest is off", async () => {
        enabled = false;
        const service = { afterSend: vi.fn(async () => { }) };
        installChatJobs(service);
        await service.afterSend({ message, recipients });
        await queueAttachmentDelete(["k"]);
        expect(send).not.toHaveBeenCalled();
    });

    it("queues failed deletes as one event", async () => {
        await queueAttachmentDelete(["k1", "k2"]);
        expect(send).toHaveBeenCalledWith([{ name: "chat/attachment.delete", data: { keys: ["k1", "k2"] } }]);
    });
});
