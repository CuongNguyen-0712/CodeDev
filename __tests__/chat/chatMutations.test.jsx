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
vi.mock("@/lib/pusherClient", () => ({ getPusherClient: () => null }));

import { editMessageAction, recallMessageAction, sendMessageAction } from "@/actions/chat.actions";
import { chatKeys } from "@/keys/chat.keys";
import { insertMessage, mergeOutbox } from "@/lib/chat/messageCache";
import { useEditMessage, useRecallMessage, useSendMessage } from "@/mutations/chat.mutation";
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
    it("invalidates the detail after a send, so a reply that accepted a request drops the banner", async () => {
        sendMessageAction.mockResolvedValueOnce({ message: server(2) });
        const invalidate = vi.spyOn(qc, "invalidateQueries");
        const { result } = renderHook(() => useSendMessage(CID), { wrapper });
        await act(async () => { await result.current.mutateAsync({ clientId: "k2", body: "hey", sender: { id: "u1" } }); });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.conversation(CID) });
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
