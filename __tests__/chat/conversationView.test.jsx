// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Conversation pane wiring: request banner, composer rules, typing line, /messages/new (spec sections 7 and 9). */
let detail;
let page;
const replace = vi.fn();
const sendMessageAction = vi.fn();

vi.mock("@/clients/chat.client", () => ({
    // A detail or page that is an Error is thrown, as the API client throws (with .status).
    chatClient: {
        getConversation: async () => { if (detail instanceof Error) throw detail; return detail; },
        getMessages: async () => { if (page instanceof Error) throw page; return page; },
    },
}));
vi.mock("@/actions/chat.actions", () => ({
    ...Object.fromEntries(["blockUserAction", "createChatUploadAction", "editMessageAction", "recallMessageAction",
        "reportMessageAction", "respondRequestAction", "unblockUserAction"].map((name) => [name, vi.fn()])),
    sendMessageAction: (...a) => sendMessageAction(...a),
    markReadAction: vi.fn(async () => ({ success: true, data: {} })),
    typingAction: vi.fn(async () => ({ success: true, data: { ok: true } })),
}));
vi.mock("@/lib/pusherClient", () => ({ getPusherClient: () => null }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "P1" } }, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));
vi.mock("@/components/ui/codeBlock", () => ({ default: () => null }));

const { default: ConversationView, NewConversationView } = await import("@/components/chat/conversationView");
const { useChatTypingStore } = await import("@/stores/chatTypingStore");

const member = (id, over = {}) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0", ...over });
const message = (seq, senderId) => ({
    id: `msg_${seq}`, seq: String(seq), conversationId: "cnv_a", clientId: `c${seq}`, sender: member(senderId),
    body: `hello ${seq}`, attachments: [], createdAt: "2026-11-11T10:00:00Z", editedAt: null, deleted: false,
});

let queryClient;
const renderWith = (ui) => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};
const gone = () => Object.assign(new Error("Conversation not found"), { status: 404 });

beforeEach(() => {
    vi.clearAllMocks();
    detail = { id: "cnv_a", kind: "direct", title: "Ada", image: null, state: "active", canSend: true, members: [member("P1"), member("P2")] };
    page = { items: [message(2, "P2"), message(1, "P1")], nextCursor: null };
    useChatTypingStore.setState({ byConversation: {} });
});
afterEach(cleanup);

describe("ConversationView", () => {
    it("renders the thread oldest first with the composer and image button", async () => {
        renderWith(<ConversationView conversationId="cnv_a" />);
        await screen.findByText("hello 2");
        const texts = [...document.querySelectorAll("li p")].map((p) => p.textContent).filter((t) => t.startsWith("hello"));
        expect(texts).toEqual(["hello 1", "hello 2"]);
        expect(screen.getByRole("heading", { name: "Ada" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Attach images" })).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Message request" })).toBeNull();
    });

    it("marks the newest server seq read when visible at the bottom", async () => {
        const { markReadAction } = await import("@/actions/chat.actions");
        renderWith(<ConversationView conversationId="cnv_a" />);
        await screen.findByText("hello 2");
        await waitFor(() => expect(markReadAction).toHaveBeenCalledWith({ conversationId: "cnv_a", seq: "2" }), { timeout: 3000 });
    });

    it("leaves for /messages and refreshes the inbox when the conversation is gone", async () => {
        detail = gone();
        renderWith(<ConversationView conversationId="cnv_a" />);
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/messages"));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat", "inbox", "all"] });
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });

    it("leaves for /messages when the messages answer 404", async () => {
        page = gone();
        renderWith(<ConversationView conversationId="cnv_a" />);
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/messages"));
    });

    it("keeps ErrorReload for other failures", async () => {
        detail = Object.assign(new Error("Access denied"), { status: 403 });
        renderWith(<ConversationView conversationId="cnv_a" />);
        expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
        expect(replace).not.toHaveBeenCalled();
    });

    it("shows the request banner to a pending member and hides images", async () => {
        detail.members = [member("P1", { state: "pending" }), member("P2")];
        renderWith(<ConversationView conversationId="cnv_a" />);
        const banner = await screen.findByRole("region", { name: "Message request" });
        expect(banner.textContent).toContain("Ada wants to message you");
        for (const name of ["Accept", "Decline", "Block"]) expect(screen.getByRole("button", { name })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Attach images" })).toBeNull();
    });

    it("blocking from the request banner blocks, then declines, then leaves", async () => {
        const { blockUserAction, respondRequestAction } = await import("@/actions/chat.actions");
        const order = [];
        blockUserAction.mockImplementation(async () => { order.push("block"); return { success: true, data: { blocked: true } }; });
        respondRequestAction.mockImplementation(async () => { order.push("decline"); return { success: true, data: { state: "declined" } }; });
        detail.members = [member("P1", { state: "pending" }), member("P2")];
        renderWith(<ConversationView conversationId="cnv_a" />);
        await screen.findByRole("region", { name: "Message request" });
        fireEvent.click(screen.getByRole("button", { name: "Block" }));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Block" }));
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/messages"));
        expect(blockUserAction).toHaveBeenCalledWith("P2");
        expect(respondRequestAction).toHaveBeenCalledWith({ conversationId: "cnv_a", accept: false });
        expect(order).toEqual(["block", "decline"]);
    });

    it("renders the thread without Array.prototype.toReversed (Safari < 16)", async () => {
        const original = Array.prototype.toReversed;
        delete Array.prototype.toReversed;
        try {
            renderWith(<ConversationView conversationId="cnv_a" />);
            await screen.findByText("hello 2");
            const texts = [...document.querySelectorAll("li p")].map((p) => p.textContent).filter((t) => t.startsWith("hello"));
            expect(texts).toEqual(["hello 1", "hello 2"]);
        } finally {
            Array.prototype.toReversed = original;
        }
    });

    it("replaces the composer when the member cannot send", async () => {
        detail.canSend = false;
        renderWith(<ConversationView conversationId="cnv_a" />);
        expect(await screen.findByText("You can't send messages in this conversation")).toBeTruthy();
        expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    });

    it("shows who is typing, then clears when the ping expires", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            renderWith(<ConversationView conversationId="cnv_a" />);
            await screen.findByText("hello 2");
            act(() => useChatTypingStore.getState().setTyping("cnv_a", "P2"));
            // A bubble in the thread: three dots for sight, the name in a live status for screen readers.
            expect(screen.getByRole("status").textContent).toBe("p2 is typing");
            expect(screen.getByRole("log").querySelectorAll(".animate-typing-dot")).toHaveLength(3);
            await act(async () => { vi.advanceTimersByTime(6000); });
            expect(screen.getByRole("status").textContent).toBe("");
            expect(screen.getByRole("log").querySelectorAll(".animate-typing-dot")).toHaveLength(0);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("NewConversationView", () => {
    const recipient = { id: "P2", username: "ada", nickname: "Ada", image: null };

    it("sends by toUserId and opens the conversation the server returns", async () => {
        sendMessageAction.mockResolvedValue({ success: true, data: { message: message(1, "P1"), conversation: { id: "cnv_z", kind: "direct" } } });
        renderWith(<NewConversationView recipient={recipient} />);
        fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "hi" } });
        fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/messages/cnv_z"));
        expect(sendMessageAction.mock.calls[0][0]).toMatchObject({ toUserId: "P2", body: "hi" });
        expect(sendMessageAction.mock.calls[0][0].conversationId).toBeUndefined();
    });

    it("keeps the text when the first send fails", async () => {
        sendMessageAction.mockResolvedValue({ success: false, status: 403, message: "You can't send messages in this conversation" });
        renderWith(<NewConversationView recipient={recipient} />);
        fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "hi" } });
        fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });
        expect(await screen.findByText("You can't send messages in this conversation")).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "Message" }).value).toBe("hi");
        expect(replace).not.toHaveBeenCalled();
    });

    it("asks to choose someone without a recipient", () => {
        renderWith(<NewConversationView recipient={null} />);
        expect(screen.getByText("Choose someone to message")).toBeTruthy();
    });
});
