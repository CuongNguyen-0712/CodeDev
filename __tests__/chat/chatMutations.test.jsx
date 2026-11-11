// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/chat.actions", () => ({
    sendMessageAction: vi.fn(), editMessageAction: vi.fn(), recallMessageAction: vi.fn(), markReadAction: vi.fn(),
    typingAction: vi.fn(), respondRequestAction: vi.fn(), createChatUploadAction: vi.fn(), blockUserAction: vi.fn(),
    unblockUserAction: vi.fn(), reportMessageAction: vi.fn(),
}));
vi.mock("@/lib/actionResult", () => ({ callAction: (run) => run() }));
vi.mock("@/lib/pusherClient", () => ({ getPusherClient: () => null, isPusherConnected: () => false }));

import { editMessageAction, markReadAction, recallMessageAction, sendMessageAction, typingAction } from "@/actions/chat.actions";
import { chatKeys } from "@/keys/chat.keys";
import { insertMessage, mergeOutbox, patchMessage } from "@/lib/chat/messageCache";
import { useEditMessage, useMarkRead, useRecallMessage, useSendMessage, useTypingPing } from "@/mutations/chat.mutation";
import { useChatOutboxStore } from "@/stores/chatOutboxStore";

const CID = "cnv_1";
const server = (seq, extra = {}) => ({ id: `msg_${seq}`, seq: String(seq), clientId: `c${seq}`, conversationId: CID, body: `m${seq}`, attachments: ["x"], deleted: false, editedAt: null, ...extra });
const pagesOf = (...items) => ({ pages: [{ items, nextCursor: null }], pageParams: [undefined] });

let qc;
const wrapper = ({ children }) => createElement(QueryClientProvider, { client: qc }, children);
let deferred;
const outbox = () => useChatOutboxStore.getState().byConversation[CID] ?? [];
const cached = () => qc.getQueryData(chatKeys.messages(CID)).pages[0].items;

beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    useChatOutboxStore.setState(useChatOutboxStore.getInitialState());
    vi.clearAllMocks();
    let reject;
    deferred = { promise: new Promise((_, r) => { reject = r; }) };
    deferred.reject = () => reject(new Error("nope"));
    deferred.promise.catch(() => { });
});

describe("useSendMessage", () => {
    const vars = { clientId: "k1", body: "hi", sender: { id: "u1" } };

    it("keeps an unsent message across a full cache replacement (refetch)", async () => {
        qc.setQueryData(chatKeys.messages(CID), pagesOf(server(1)));
        sendMessageAction.mockReturnValue(new Promise(() => { })); // never settles
        const { result } = renderHook(() => useSendMessage(CID), { wrapper });
        act(() => { result.current.mutate(vars); });
        await waitFor(() => expect(outbox()).toHaveLength(1));

        qc.setQueryData(chatKeys.messages(CID), pagesOf(server(2), server(1))); // what a refetch does
        expect(outbox()[0]).toMatchObject({ clientId: "k1", status: "sending" });
        expect(mergeOutbox(cached(), outbox()).map((m) => m.clientId)).toEqual(["k1", "c2", "c1"]);
    });

    it("puts the picked attachments into the outbox entry", async () => {
        sendMessageAction.mockReturnValue(new Promise(() => { }));
        const attachments = [{ id: "a1", kind: "image", width: 4, height: 3, previewUrl: "blob:x" }, { id: "a2", kind: "file", name: "n.pdf", size: 9 }];
        const { result } = renderHook(() => useSendMessage(CID), { wrapper });
        act(() => { result.current.mutate({ ...vars, attachmentIds: ["a1", "a2"], attachments }); });
        await waitFor(() => expect(outbox()).toHaveLength(1));
        expect(outbox()[0]).toMatchObject({ attachments, attachmentIds: ["a1", "a2"] });
        expect(sendMessageAction.mock.calls[0][0]).not.toHaveProperty("attachments");
    });

    it("leaves a failed item, then a retry with the same clientId flips it back and clears it on success", async () => {
        qc.setQueryData(chatKeys.messages(CID), pagesOf(server(1)));
        sendMessageAction.mockRejectedValueOnce(new Error("offline"));
        const { result } = renderHook(() => useSendMessage(CID), { wrapper });
        await act(async () => { await result.current.mutateAsync(vars).catch(() => { }); });
        expect(outbox()).toHaveLength(1);
        expect(outbox()[0]).toMatchObject({ clientId: "k1", status: "failed" });

        sendMessageAction.mockResolvedValueOnce({ message: server(2, { clientId: "k1" }) });
        await act(async () => { await result.current.mutateAsync(vars); });
        expect(sendMessageAction.mock.calls[1][0].clientId).toBe("k1");
        expect(outbox()).toEqual([]);
        expect(cached().map((m) => m.seq)).toEqual(["2", "1"]);
    });
});

describe("useSendMessage refreshes the conversation", () => {
    const detail = (state) => ({ id: CID, members: [{ id: "u1", state, lastReadSeq: "0" }, { id: "u2", state: "accepted", lastReadSeq: "0" }] });
    const send = async () => {
        sendMessageAction.mockResolvedValueOnce({ message: server(2) });
        const invalidate = vi.spyOn(qc, "invalidateQueries");
        const { result } = renderHook(() => useSendMessage(CID), { wrapper });
        await act(async () => { await result.current.mutateAsync({ clientId: "k2", body: "hey", sender: { id: "u1" } }); });
        return invalidate;
    };

    it("refetches the detail while my own state is not accepted, so a reply drops the banner", async () => {
        qc.setQueryData(chatKeys.conversation(CID), detail("pending"));
        expect(await send()).toHaveBeenCalledWith({ queryKey: chatKeys.conversation(CID) });
    });

    it("refetches the sender's detail only while their own state is not accepted", async () => {
        qc.setQueryData(chatKeys.conversation(CID), detail("accepted"));
        expect(await send()).not.toHaveBeenCalledWith({ queryKey: chatKeys.conversation(CID) });
    });

    it("R55: refreshes the sender's own inbox row without touching unread", async () => {
        qc.setQueryData(chatKeys.conversation(CID), detail("accepted"));
        const spy = await send();
        expect(spy).toHaveBeenCalledWith({ queryKey: chatKeys.inbox("all") }, { cancelRefetch: false });
        expect(spy).not.toHaveBeenCalledWith({ queryKey: chatKeys.unread() });
        expect(spy).not.toHaveBeenCalledWith({ queryKey: chatKeys.inbox("requests") });
    });
});

describe("useTypingPing", () => {
    const visibility = (v) => Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
    it("skips typing pings while the tab is hidden and resets after a send", async () => {
        const T = "cnv_typing";
        const { result } = renderHook(() => useTypingPing(T), { wrapper });
        typingAction.mockResolvedValue({ success: true });
        visibility("hidden");
        result.current();
        expect(typingAction).not.toHaveBeenCalled();
        visibility("visible");
        result.current();
        result.current(); // throttled
        expect(typingAction).toHaveBeenCalledTimes(1);

        sendMessageAction.mockResolvedValueOnce({ message: server(3, { conversationId: T }) });
        const send = renderHook(() => useSendMessage(T), { wrapper });
        await act(async () => { await send.result.current.mutateAsync({ clientId: "k3", body: "x", sender: { id: "u1" } }); });
        result.current();
        expect(typingAction).toHaveBeenCalledTimes(2);
    });
});

describe("optimistic edit and unsend", () => {
    beforeEach(() => qc.setQueryData(chatKeys.messages(CID), pagesOf(server(2), server(1))));

    it("edit applies at once and rolls back on error", async () => {
        editMessageAction.mockReturnValue(deferred.promise);
        const { result } = renderHook(() => useEditMessage(), { wrapper });
        act(() => { result.current.mutate({ conversationId: CID, messageId: "msg_2", body: "new" }); });
        await waitFor(() => expect(cached()[0].body).toBe("new"));
        deferred.reject();
        await waitFor(() => expect(cached()[0]).toMatchObject({ body: "m2", editedAt: null }));
        expect(editMessageAction).toHaveBeenCalledWith({ messageId: "msg_2", body: "new" });
    });

    it("a hide that lands during a failing edit stays deleted", async () => {
        editMessageAction.mockReturnValue(deferred.promise);
        const { result } = renderHook(() => useEditMessage(), { wrapper });
        act(() => { result.current.mutate({ conversationId: CID, messageId: "msg_2", body: "new" }); });
        await waitFor(() => expect(cached()[0].body).toBe("new"));
        qc.setQueryData(chatKeys.messages(CID), (d) => patchMessage(d, server(2, { deleted: true, body: "", editedAt: "2000-01-01T00:00:00Z" })));
        deferred.reject();
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(cached()[0]).toMatchObject({ deleted: true });
    });

    it("applies the server copy even when the browser clock ran ahead", async () => {
        editMessageAction.mockResolvedValue({ message: server(2, { body: "new", editedAt: "2000-01-01T00:00:00Z" }) });
        const { result } = renderHook(() => useEditMessage(), { wrapper });
        await act(async () => { await result.current.mutateAsync({ conversationId: CID, messageId: "msg_2", body: "new" }); });
        expect(cached()[0]).toMatchObject({ body: "new", editedAt: "2000-01-01T00:00:00Z" });
    });

    it("a recall carrying an older editedAt is applied", () => {
        qc.setQueryData(chatKeys.messages(CID), pagesOf(server(2, { editedAt: "2030-01-01T00:00:00Z" })));
        qc.setQueryData(chatKeys.messages(CID), (d) => patchMessage(d, server(2, { deleted: true, body: "", editedAt: "2000-01-01T00:00:00Z" })));
        expect(cached()[0].deleted).toBe(true);
    });

    it("edit shows the new body while the request is in flight", async () => {
        editMessageAction.mockReturnValue(new Promise(() => { }));
        const { result } = renderHook(() => useEditMessage(), { wrapper });
        act(() => { result.current.mutate({ conversationId: CID, messageId: "msg_2", body: "new" }); });
        await waitFor(() => expect(cached()[0]).toMatchObject({ body: "new" }));
        expect(cached()[0].editedAt).not.toBeNull();
    });

    it("recall marks deleted at once and rolls back on error", async () => {
        recallMessageAction.mockReturnValue(deferred.promise);
        const { result } = renderHook(() => useRecallMessage(), { wrapper });
        act(() => { result.current.mutate({ conversationId: CID, messageId: "msg_2" }); });
        await waitFor(() => expect(cached()[0]).toMatchObject({ deleted: true, body: "", attachments: [] }));
        deferred.reject();
        await waitFor(() => expect(cached()[0]).toMatchObject({ deleted: false, body: "m2", attachments: ["x"] }));
    });

    it.each([
        ["edit", useEditMessage, { conversationId: CID, messageId: "msg_2", body: "new" }, editMessageAction, { body: "new" }],
        ["recall", useRecallMessage, { conversationId: CID, messageId: "msg_2" }, recallMessageAction, { deleted: true }],
    ])("a failed %s restores only that message and keeps an insert that landed meanwhile", async (_, hook, input, action, applied) => {
        action.mockReturnValue(deferred.promise);
        const { result } = renderHook(() => hook(), { wrapper });
        act(() => { result.current.mutate(input); });
        await waitFor(() => expect(cached().find((m) => m.id === "msg_2")).toMatchObject(applied));

        qc.setQueryData(chatKeys.messages(CID), (data) => insertMessage(data, server(3)));
        deferred.reject();
        await waitFor(() => expect(cached().find((m) => m.id === "msg_2")).toMatchObject({ body: "m2", deleted: false, editedAt: null }));
        expect(cached().map((m) => m.seq)).toEqual(["3", "2", "1"]);
    });
});

describe("useMarkRead", () => {
    const row = (id, unread) => ({ id, unread, lastMessage: null });
    it("clears the row and lowers the badge once, without refetching; never below zero", async () => {
        qc.setQueryData(chatKeys.inbox("all"), { pages: [{ items: [row(CID, true), row("o", true)], nextCursor: null }], pageParams: [undefined] });
        qc.setQueryData(chatKeys.unread(), { unread: 1, requests: 0 });
        markReadAction.mockResolvedValue({ success: true, data: { lastReadSeq: "2" } });
        const spy = vi.spyOn(qc, "invalidateQueries");
        const { result } = renderHook(() => useMarkRead(), { wrapper });
        act(() => { result.current(CID, "2"); });
        await waitFor(() => expect(qc.getQueryData(chatKeys.unread()).unread).toBe(0), { timeout: 3000 });
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items.map((r) => r.unread)).toEqual([false, true]);
        act(() => { result.current(CID, "3"); });   // already read: the badge stays at 0
        await waitFor(() => expect(markReadAction).toHaveBeenCalledTimes(2), { timeout: 3000 });
        expect(qc.getQueryData(chatKeys.unread()).unread).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });
    it("never goes below zero when the badge was already 0", async () => {
        qc.setQueryData(chatKeys.inbox("all"), { pages: [{ items: [row(CID, true)], nextCursor: null }], pageParams: [undefined] });
        qc.setQueryData(chatKeys.unread(), { unread: 0, requests: 0 });
        markReadAction.mockResolvedValue({ success: true, data: { lastReadSeq: "2" } });
        const { result } = renderHook(() => useMarkRead(), { wrapper });
        act(() => { result.current(CID, "2"); });
        await waitFor(() => expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0].unread).toBe(false), { timeout: 3000 });
        expect(qc.getQueryData(chatKeys.unread()).unread).toBe(0);
    });
    it("a message that arrived while markRead was pending keeps the row unread and the badge", async () => {
        qc.setQueryData(chatKeys.inbox("all"), { pages: [{ items: [{ id: CID, unread: true, lastMessage: { seq: "6" } }], nextCursor: null }], pageParams: [undefined] });
        qc.setQueryData(chatKeys.unread(), { unread: 1, requests: 0 });
        markReadAction.mockResolvedValue({ success: true, data: { lastReadSeq: "5" } });
        const { result } = renderHook(() => useMarkRead(), { wrapper });
        act(() => { result.current(CID, "5"); });
        await waitFor(() => expect(markReadAction).toHaveBeenCalled(), { timeout: 3000 });
        await new Promise((r) => setTimeout(r, 20));
        expect(qc.getQueryData(chatKeys.inbox("all")).pages[0].items[0].unread).toBe(true);
        expect(qc.getQueryData(chatKeys.unread()).unread).toBe(1);
    });
    it("does not mark read a seq it already read", async () => {
        qc.setQueryData(chatKeys.conversation(CID), { id: CID, members: [{ id: "u1", lastReadSeq: "9" }] });
        const { result } = renderHook(() => useMarkRead("u1"), { wrapper });
        act(() => { result.current(CID, "9"); result.current(CID, "5"); });
        await new Promise((r) => setTimeout(r, 1500));
        expect(markReadAction).not.toHaveBeenCalled();
        markReadAction.mockResolvedValue({ success: true, data: { lastReadSeq: "10" } });
        act(() => { result.current(CID, "10"); });
        await waitFor(() => expect(markReadAction).toHaveBeenCalledTimes(1), { timeout: 3000 });
        await waitFor(() => expect(qc.getQueryData(chatKeys.conversation(CID)).members[0].lastReadSeq).toBe("10"));
    });
    it("refetches the badge when the row is not in the cache", async () => {
        markReadAction.mockResolvedValue({ success: true, data: { lastReadSeq: "2" } });
        const spy = vi.spyOn(qc, "invalidateQueries");
        const { result } = renderHook(() => useMarkRead(), { wrapper });
        act(() => { result.current(CID, "2"); });
        await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: chatKeys.unread() }), { timeout: 3000 });
    });
});
