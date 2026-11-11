import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/clients/chat.client", () => ({ chatClient: { getMessage: vi.fn() } }));

import { chatClient } from "@/clients/chat.client";
import { chatKeys } from "@/keys/chat.keys";
import { TYPING_SHOW_MS } from "@/lib/chat/limits";
import { createChatHandlers } from "@/lib/chat/realtimeHandlers";
import { useChatOutboxStore } from "@/stores/chatOutboxStore";
import { selectTypingUsers, useChatTypingStore } from "@/stores/chatTypingStore";

const CID = "cnv_1";
const msg = (seq, extra = {}) => ({ id: `msg_${seq}`, seq: String(seq), clientId: `c${seq}`, body: "x", ...extra });
let qc, h;

beforeEach(() => {
    qc = new QueryClient();
    h = createChatHandlers(qc);
    chatClient.getMessage.mockReset();
    useChatTypingStore.setState(useChatTypingStore.getInitialState());
    useChatOutboxStore.setState(useChatOutboxStore.getInitialState());
});
afterEach(() => vi.useRealTimers());

const seedMessages = (items = [msg(1)]) => qc.setQueryData(chatKeys.messages(CID), { pages: [{ items, nextCursor: null }], pageParams: [undefined] });
const invalidated = (spy) => spy.mock.calls.map((c) => c[0].queryKey);

describe("chat-message", () => {
    it("inserts into a cached conversation and ignores a duplicate event", () => {
        seedMessages();
        h["chat-message"]({ conversationId: CID, message: msg(2) });
        h["chat-message"]({ conversationId: CID, message: msg(2) });
        expect(qc.getQueryData(chatKeys.messages(CID)).pages[0].items.map((m) => m.seq)).toEqual(["2", "1"]);
    });
    it("skips an uncached conversation but still refreshes inbox and unread", () => {
        const spy = vi.spyOn(qc, "invalidateQueries");
        h["chat-message"]({ conversationId: CID, message: msg(2) });
        expect(qc.getQueryData(chatKeys.messages(CID))).toBeUndefined();
        expect(invalidated(spy)).toEqual(expect.arrayContaining([chatKeys.inbox("all"), chatKeys.inbox("requests"), chatKeys.unread()]));
        expect(spy.mock.calls[0][1]).toEqual({ cancelRefetch: false });
    });
    it("fetches a ping then inserts; a failed fetch invalidates the messages query", async () => {
        seedMessages();
        chatClient.getMessage.mockResolvedValueOnce(msg(2));
        await h["chat-message"]({ conversationId: CID, messageId: "msg_2" });
        expect(qc.getQueryData(chatKeys.messages(CID)).pages[0].items[0].seq).toBe("2");

        const spy = vi.spyOn(qc, "invalidateQueries");
        chatClient.getMessage.mockRejectedValueOnce(new Error("boom"));
        await h["chat-message"]({ conversationId: CID, messageId: "msg_3" });
        expect(invalidated(spy)).toContainEqual(chatKeys.messages(CID));
    });
});

describe("chat-message and the outbox", () => {
    it("removes the unsent copy with the same clientId (event before the send response)", () => {
        seedMessages();
        useChatOutboxStore.getState().addUnsent(CID, { clientId: "c2", status: "sending" });
        h["chat-message"]({ conversationId: CID, message: msg(2) });
        expect(useChatOutboxStore.getState().byConversation[CID]).toEqual([]);
    });
});

describe("chat-read", () => {
    it("does not refetch the inbox or unread", () => {
        const spy = vi.spyOn(qc, "invalidateQueries");
        h["chat-read"]({ conversationId: CID, userId: "u2", seq: "10" });
        expect(spy).not.toHaveBeenCalled();
    });
    const seedDetail = (lastReadSeq) => qc.setQueryData(chatKeys.conversation(CID), { id: CID, members: [{ id: "u2", lastReadSeq }, { id: "u3", lastReadSeq: "0" }] });
    it("compares seq as BigInt strings, not text", () => {
        seedDetail("9");
        h["chat-read"]({ conversationId: CID, userId: "u2", seq: "10" });
        expect(qc.getQueryData(chatKeys.conversation(CID)).members[0].lastReadSeq).toBe("10");
        h["chat-read"]({ conversationId: CID, userId: "u2", seq: "9" });
        expect(qc.getQueryData(chatKeys.conversation(CID)).members[0].lastReadSeq).toBe("10");
    });
    it("does nothing when the detail is not cached", () => {
        h["chat-read"]({ conversationId: CID, userId: "u2", seq: "10" });
        expect(qc.getQueryData(chatKeys.conversation(CID))).toBeUndefined();
    });
});

describe("other events", () => {
    it("chat-typing does not refetch the inbox or unread", () => {
        const spy = vi.spyOn(qc, "invalidateQueries");
        h["chat-typing"]({ conversationId: CID, userId: "u2" });
        expect(spy).not.toHaveBeenCalled();
    });
    it("chat-typing sets then expires the typer", () => {
        vi.useFakeTimers();
        h["chat-typing"]({ conversationId: CID, userId: "u2" });
        expect(selectTypingUsers(useChatTypingStore.getState(), CID, Date.now())).toEqual(["u2"]);
        vi.advanceTimersByTime(TYPING_SHOW_MS + 100);
        expect(useChatTypingStore.getState().byConversation[CID]?.u2).toBeUndefined();
    });
    it("chat-conversation-updated invalidates the detail", () => {
        const spy = vi.spyOn(qc, "invalidateQueries");
        h["chat-conversation-updated"]({ conversationId: CID });
        expect(invalidated(spy)).toContainEqual(chatKeys.conversation(CID));
    });
    it("chat-message-updated invalidates that conversation's messages", () => {
        const spy = vi.spyOn(qc, "invalidateQueries");
        h["chat-message-updated"]({ conversationId: CID, messageId: "msg_1" });
        expect(invalidated(spy)).toContainEqual(chatKeys.messages(CID));
    });
});
