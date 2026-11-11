import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/clients/chat.client", () => ({ chatClient: { getMessage: vi.fn() } }));

import { chatClient } from "@/clients/chat.client";
import { chatKeys } from "@/keys/chat.keys";
import { TYPING_SHOW_MS } from "@/lib/chat/limits";
import { setOpenConversation } from "@/lib/chat/openConversation";
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
    it("own read with no inbox row cached refetches the unread badge", () => {
        const spy = vi.spyOn(qc, "invalidateQueries");
        createChatHandlers(qc, "me")["chat-read"]({ conversationId: CID, userId: "me", seq: "10" });
        expect(invalidated(spy)).toContainEqual(chatKeys.unread());
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

describe("revision 3 thread and typing", () => {
    it("patches an edited message from the event without refetching", () => {
        seedMessages([msg(2), msg(1)]);
        const spy = vi.spyOn(qc, "invalidateQueries");
        h["chat-message-updated"]({ conversationId: CID, message: msg(1, { body: "edited", editedAt: "2026-01-01T00:00:00Z", sender: { id: "me" } }) });
        expect(qc.getQueryData(chatKeys.messages(CID)).pages[0].items[1].body).toBe("edited");
        expect(invalidated(spy)).not.toContainEqual(chatKeys.messages(CID));
    });
    it("an update for a message missing from a cached thread refetches it", () => {
        seedMessages([msg(1)]);
        const spy = vi.spyOn(qc, "invalidateQueries");
        h["chat-message-updated"]({ conversationId: CID, message: msg(2, { deleted: true, sender: { id: "me" } }) });
        expect(invalidated(spy)).toContainEqual(chatKeys.messages(CID));
    });
    it("clears the typer when their message arrives", () => {
        useChatTypingStore.getState().setTyping(CID, "u2");
        h["chat-message"]({ conversationId: CID, message: msg(2, { sender: { id: "u2" } }) });
        expect(useChatTypingStore.getState().byConversation[CID]?.u2).toBeUndefined();
    });
});

describe("inbox and unread follow events without refetching", () => {
    const row = (id, extra = {}) => ({ id, kind: "direct", title: id, image: null, state: "active", lastMessage: { seq: "1", preview: "old", senderId: "u2", createdAt: "t0" }, lastMessageAt: "t0", unread: false, ...extra });
    const seedInbox = (tab, ...items) => qc.setQueryData(chatKeys.inbox(tab), { pages: [{ items, nextCursor: null }], pageParams: [undefined] });
    const seedUnread = (unread = 0, requests = 0) => qc.setQueryData(chatKeys.unread(), { unread, requests });
    const ids = (tab) => qc.getQueryData(chatKeys.inbox(tab)).pages[0].items.map((r) => r.id);
    const incoming = (extra = {}) => ({ conversationId: CID, message: { ...msg(2), sender: { id: "u2" }, createdAt: "t1" }, preview: "new", ...extra });
    let me;
    beforeEach(() => { me = createChatHandlers(qc, "me"); setOpenConversation(null); });
    afterEach(() => setOpenConversation(null));

    it("updates a cached row and raises the badge once, without invalidating", () => {
        seedInbox("all", row("other"), row(CID));
        seedUnread(3);
        const spy = vi.spyOn(qc, "invalidateQueries");
        me["chat-message"](incoming());
        me["chat-message"](incoming({ message: { ...msg(3), sender: { id: "u2" }, createdAt: "t2" } }));
        expect(ids("all")).toEqual([CID, "other"]);
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0]).toMatchObject({ unread: true, lastMessage: { seq: "3", preview: "new" } });
        expect(qc.getQueryData(chatKeys.unread()).unread).toBe(4);
        expect(spy).not.toHaveBeenCalled();
    });
    it("handles a ping payload", () => {
        seedInbox("all", row(CID));
        seedUnread(0);
        me["chat-message"]({ conversationId: CID, messageId: "msg_2", preview: "p", seq: "2", senderId: "u2", createdAt: "t1" });
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0]).toMatchObject({ unread: true, lastMessage: { seq: "2", preview: "p" } });
    });
    it("leaves the badge alone for the open conversation and for own messages", () => {
        seedInbox("all", row(CID));
        seedUnread(2);
        setOpenConversation(CID);
        me["chat-message"](incoming());
        me["chat-message"](incoming({ message: { ...msg(3), sender: { id: "me" }, createdAt: "t2" } }));
        expect(qc.getQueryData(chatKeys.unread()).unread).toBe(2);
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0].lastMessage.seq).toBe("3");
    });
    it("does not touch the badge for a cached request", () => {
        seedInbox("requests", row(CID));
        seedUnread(2, 1);
        const spy = vi.spyOn(qc, "invalidateQueries");
        me["chat-message"](incoming());
        expect(qc.getQueryData(chatKeys.unread())).toEqual({ unread: 2, requests: 1 });
        expect(qc.getQueryData(chatKeys.inbox("requests")).pages[0].items[0].lastMessage.seq).toBe("2");
        expect(spy).not.toHaveBeenCalled();
    });
    it("invalidates inbox and unread only for an unknown conversation", () => {
        seedInbox("all", row("other"));
        const spy = vi.spyOn(qc, "invalidateQueries");
        me["chat-message"](incoming());
        expect(invalidated(spy)).toEqual(expect.arrayContaining([chatKeys.inbox("all"), chatKeys.inbox("requests"), chatKeys.unread()]));
        expect(ids("all")).toEqual(["other"]);
    });
    it("updates the row preview when the last message is edited or unsent", () => {
        seedInbox("all", row(CID, { lastMessage: { seq: "2", preview: "old", senderId: "u2", createdAt: "t1" } }));
        const spy = vi.spyOn(qc, "invalidateQueries");
        me["chat-message-updated"]({ conversationId: CID, message: msg(2, { sender: { id: "u2" } }), preview: "edited" });
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0].lastMessage.preview).toBe("edited");
        expect(invalidated(spy)).not.toContainEqual(chatKeys.inbox("all"));
        me["chat-message-updated"]({ conversationId: CID, message: msg(1), preview: "older" });
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0].lastMessage.preview).toBe("edited");
    });
    it("unsending a message from someone else refetches the lists; own unsend does not", () => {
        seedInbox("all", row(CID));
        const spy = vi.spyOn(qc, "invalidateQueries");
        me["chat-message-updated"]({ conversationId: CID, message: msg(1, { deleted: true, sender: { id: "me" } }), preview: "[unsent]" });
        expect(invalidated(spy)).not.toContainEqual(chatKeys.unread());
        me["chat-message-updated"]({ conversationId: CID, message: msg(1, { deleted: true, sender: { id: "u2" } }), preview: "[unsent]" });
        expect(invalidated(spy)).toEqual(expect.arrayContaining([chatKeys.inbox("all"), chatKeys.unread()]));
    });
    it("an own chat-read from another tab clears the row and lowers the badge once", () => {
        seedInbox("all", row(CID, { unread: true, lastMessage: { seq: "5", preview: "p", senderId: "u2", createdAt: "t" } }));
        seedUnread(1);
        const spy = vi.spyOn(qc, "invalidateQueries");
        me["chat-read"]({ conversationId: CID, userId: "me", seq: "5" });
        me["chat-read"]({ conversationId: CID, userId: "me", seq: "5" });
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0].unread).toBe(false);
        expect(qc.getQueryData(chatKeys.unread()).unread).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });
    it("another user chat-read leaves the row and badge alone", () => {
        seedInbox("all", row(CID, { unread: true }));
        seedUnread(1);
        me["chat-read"]({ conversationId: CID, userId: "u2", seq: "5" });
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0].unread).toBe(true);
        expect(qc.getQueryData(chatKeys.unread()).unread).toBe(1);
    });
    it("a chat-message-updated ping still invalidates the lists", () => {
        const spy = vi.spyOn(qc, "invalidateQueries");
        me["chat-message-updated"]({ conversationId: CID, messageId: "msg_1" });
        expect(invalidated(spy)).toEqual(expect.arrayContaining([chatKeys.inbox("all"), chatKeys.inbox("requests"), chatKeys.unread()]));
    });
});
