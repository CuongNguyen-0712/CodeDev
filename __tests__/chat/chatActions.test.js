// Chat server actions: validation (422), limiter routing, service arguments (userId from the session only).
import { beforeEach, describe, expect, it, vi } from "vitest";

const chatService = {
    send: vi.fn(), editMessage: vi.fn(), recallMessage: vi.fn(), markRead: vi.fn(), respondRequest: vi.fn(),
    createUpload: vi.fn(), block: vi.fn(), unblock: vi.fn(), report: vi.fn(),
};
const chatRealtime = { typing: vi.fn() };
vi.mock("@/services/chat.service", () => ({ chatService }));
vi.mock("@/services/chatRealtime.service", () => ({ chatRealtime }));
vi.mock("@/lib/serverAction", () => ({
    runAction: async (handler, options) => {
        try {
            return { success: true, data: await handler({ userId: "u1" }), options };
        } catch (error) {
            return { success: false, status: error.status, message: error.message };
        }
    },
}));

const a = await import("@/actions/chat.actions");
const { rateLimiters } = await import("@/lib/rateLimit");

const CNV = `cnv_${"a".repeat(26)}`;
const MSG = `msg_${"b".repeat(26)}`;
const ATT = `att_${"c".repeat(26)}`;
const uuid = () => crypto.randomUUID();
const SOCKET = "123.456";

beforeEach(() => {
    Object.values(chatService).forEach((f) => f.mockReset().mockResolvedValue({ ok: 1 }));
    chatRealtime.typing.mockReset().mockResolvedValue(true);
});

describe("sendMessageAction", () => {
    it("rejects a whitespace-only body without images", async () => {
        const r = await a.sendMessageAction({ conversationId: CNV, clientId: uuid(), body: " \n\t " });
        expect(r).toMatchObject({ success: false, status: 422 });
        expect(chatService.send).not.toHaveBeenCalled();
    });

    it("accepts a whitespace-only body with an image", async () => {
        const r = await a.sendMessageAction({ conversationId: CNV, clientId: uuid(), body: " ", attachmentIds: [ATT] });
        expect(r.success).toBe(true);
        expect(chatService.send).toHaveBeenCalledWith(expect.objectContaining({ body: " ", attachmentIds: [ATT] }));
    });

    it("rejects both conversationId and toUserId, and neither", async () => {
        for (const extra of [{ conversationId: CNV, toUserId: "usr1" }, {}]) {
            expect(await a.sendMessageAction({ clientId: uuid(), body: "hi", ...extra })).toMatchObject({ success: false, status: 422 });
        }
        expect(chatService.send).not.toHaveBeenCalled();
    });

    it("keeps code indentation in the body", async () => {
        await a.sendMessageAction({ conversationId: CNV, clientId: uuid(), body: "  a\n    b" });
        expect(chatService.send).toHaveBeenCalledWith(expect.objectContaining({ body: "  a\n    b" }));
    });

    it("rejects the NUL character", async () => {
        expect(await a.sendMessageAction({ conversationId: CNV, clientId: uuid(), body: "a\u0000b" })).toMatchObject({ success: false, status: 422 });
        expect(chatService.send).not.toHaveBeenCalled();
    });

    it("rejects an oversized body, too many images and a bad socket id", async () => {
        const base = { conversationId: CNV, clientId: uuid(), body: "hi" };
        for (const bad of [{ body: "x".repeat(4001) }, { attachmentIds: Array(5).fill(ATT) }, { socketId: "abc" }, { clientId: "nope" }]) {
            expect(await a.sendMessageAction({ ...base, ...bad })).toMatchObject({ success: false, status: 422 });
        }
        expect(chatService.send).not.toHaveBeenCalled();
    });

    it("rate limits sends with chatSend", async () => {
        const r = await a.sendMessageAction({ conversationId: CNV, clientId: uuid(), body: "hi" });
        expect(r.options).toEqual({ limiter: rateLimiters.chatSend, context: "sendMessageAction" });
        expect(rateLimiters.chatSend).toMatchObject({ limit: 30, windowSeconds: 60, prefix: "chat-send" });
    });

    it("does not return recipients or created to the browser, and passes socketId", async () => {
        chatService.send.mockResolvedValue({ message: { id: MSG }, conversation: { id: CNV }, recipients: ["u2"], created: true });
        const r = await a.sendMessageAction({ conversationId: CNV, clientId: uuid(), body: "hi", socketId: SOCKET });
        expect(r.data).toEqual({ message: { id: MSG }, conversation: { id: CNV } });
        expect(chatService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", socketId: SOCKET }));
    });

    it("ignores a userId supplied by the client", async () => {
        await a.sendMessageAction({ userId: "evil", conversationId: CNV, clientId: uuid(), body: "hi" });
        expect(chatService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }));
    });
});

describe("edit and recall", () => {
    it("edits with chatSend, keeping the body untouched", async () => {
        const r = await a.editMessageAction({ messageId: MSG, body: "  x ", socketId: SOCKET });
        expect(r.options).toEqual({ limiter: rateLimiters.chatSend, context: "editMessageAction" });
        expect(chatService.editMessage).toHaveBeenCalledWith({ userId: "u1", messageId: MSG, body: "  x ", socketId: SOCKET });
        expect(await a.editMessageAction({ messageId: MSG, body: "  " })).toMatchObject({ success: false, status: 422 });
    });

    it("recalls and never passes byAdmin", async () => {
        const r = await a.recallMessageAction(MSG);
        expect(r.options).toEqual({ limiter: rateLimiters.chatSend, context: "recallMessageAction" });
        await a.recallMessageAction({ messageId: MSG, socketId: SOCKET, byAdmin: true });
        for (const [arg] of chatService.recallMessage.mock.calls) expect(arg).not.toHaveProperty("byAdmin");
        expect(chatService.recallMessage).toHaveBeenLastCalledWith({ userId: "u1", messageId: MSG, socketId: SOCKET });
        expect(await a.recallMessageAction("msg_x")).toMatchObject({ success: false, status: 422 });
    });
});

describe("markReadAction", () => {
    it("uses chatRead and passes seq", async () => {
        const r = await a.markReadAction({ conversationId: CNV, seq: "42" });
        expect(r.options).toEqual({ limiter: rateLimiters.chatRead, context: "markReadAction" });
        expect(rateLimiters.chatRead).toMatchObject({ limit: 120, prefix: "chat-read" });
        expect(chatService.markRead).toHaveBeenCalledWith({ userId: "u1", conversationId: CNV, seq: "42" });
    });

    it("rejects a seq above the bigint max, and non-digits", async () => {
        expect((await a.markReadAction({ conversationId: CNV, seq: "9223372036854775807" })).success).toBe(true);
        for (const seq of ["9223372036854775808", "9999999999999999999", "-1", "1.5", "", 5]) {
            expect(await a.markReadAction({ conversationId: CNV, seq })).toMatchObject({ success: false, status: 422 });
        }
        expect(chatService.markRead).toHaveBeenCalledTimes(1);
    });
});

describe("typingAction", () => {
    it("goes through chatTyping and chatRealtime.typing", async () => {
        const r = await a.typingAction({ conversationId: CNV, socketId: SOCKET });
        expect(r).toMatchObject({ success: true, data: { ok: true } });
        expect(r.options).toEqual({ limiter: rateLimiters.chatTyping, context: "typingAction" });
        expect(rateLimiters.chatTyping).toMatchObject({ limit: 30, prefix: "chat-typing" });
        expect(chatRealtime.typing).toHaveBeenCalledWith({ userId: "u1", conversationId: CNV, socketId: SOCKET });
    });

    it("returns { ok: false } instead of throwing when not allowed", async () => {
        chatRealtime.typing.mockResolvedValue(false);
        expect((await a.typingAction(CNV)).data).toEqual({ ok: false });
    });

    it("validates ids", async () => {
        expect(await a.typingAction("nope")).toMatchObject({ success: false, status: 422 });
        expect(chatRealtime.typing).not.toHaveBeenCalled();
    });
});

describe("respondRequestAction", () => {
    it("passes a boolean accept and rejects the string \"false\"", async () => {
        const r = await a.respondRequestAction({ conversationId: CNV, accept: false });
        expect(r.options).toEqual({ limiter: rateLimiters.chatSend, context: "respondRequestAction" });
        expect(chatService.respondRequest).toHaveBeenCalledWith({ userId: "u1", conversationId: CNV, accept: false });
        expect(await a.respondRequestAction({ conversationId: CNV, accept: "false" })).toMatchObject({ success: false, status: 422 });
        expect(chatService.respondRequest).toHaveBeenCalledTimes(1);
    });
});

describe("createChatUploadAction", () => {
    it("uses chatUpload", async () => {
        const input = { conversationId: CNV, contentType: "image/png", size: 1000, width: 10, height: 10 };
        const r = await a.createChatUploadAction(input);
        expect(r.options).toEqual({ limiter: rateLimiters.chatUpload, context: "createChatUploadAction" });
        expect(rateLimiters.chatUpload).toMatchObject({ limit: 20, prefix: "chat-upload" });
        expect(chatService.createUpload).toHaveBeenCalledWith({ userId: "u1", ...input });
        expect(await a.createChatUploadAction({ ...input, size: "1000" })).toMatchObject({ success: false, status: 422 });
    });
});

describe("block, unblock, report", () => {
    it("block and unblock use chatSend with targetId", async () => {
        const b = await a.blockUserAction("usr_1");
        const u = await a.unblockUserAction("usr_1");
        expect(b.options).toEqual({ limiter: rateLimiters.chatSend, context: "blockUserAction" });
        expect(u.options).toEqual({ limiter: rateLimiters.chatSend, context: "unblockUserAction" });
        expect(chatService.block).toHaveBeenCalledWith({ userId: "u1", targetId: "usr_1" });
        expect(chatService.unblock).toHaveBeenCalledWith({ userId: "u1", targetId: "usr_1" });
        expect(await a.blockUserAction(undefined)).toMatchObject({ success: false, status: 422 });
    });

    it("report uses the feedback limiter and the blog reason rules", async () => {
        const r = await a.reportMessageAction({ messageId: MSG, reason: "  spam spam " });
        expect(r.options).toEqual({ limiter: rateLimiters.feedback, context: "reportMessageAction" });
        expect(chatService.report).toHaveBeenCalledWith({ userId: "u1", messageId: MSG, reason: "spam spam" });
        expect(await a.reportMessageAction({ messageId: MSG, reason: "no" })).toMatchObject({ success: false, status: 422 });
    });
});

describe("actions return only what the browser needs", () => {
    it("edit returns { message }", async () => {
        chatService.editMessage.mockResolvedValue({ message: { id: MSG }, recipients: [{ state: "pending" }] });
        expect((await a.editMessageAction({ messageId: MSG, body: "x" })).data).toEqual({ message: { id: MSG } });
    });

    it("recall returns { message }", async () => {
        chatService.recallMessage.mockResolvedValue({ message: { id: MSG }, recipients: [1], removedKeys: ["chat/k"] });
        expect((await a.recallMessageAction(MSG)).data).toEqual({ message: { id: MSG } });
    });

    it("markRead returns { lastReadSeq }", async () => {
        chatService.markRead.mockResolvedValue({ changed: true, lastReadSeq: "7", others: [1] });
        expect((await a.markReadAction({ conversationId: CNV, seq: "7" })).data).toEqual({ lastReadSeq: "7" });
    });

    it("respond returns { state }", async () => {
        chatService.respondRequest.mockResolvedValue({ state: "accepted", others: [1] });
        expect((await a.respondRequestAction({ conversationId: CNV, accept: true })).data).toEqual({ state: "accepted" });
    });
});
