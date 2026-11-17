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

// jsdom has no ResizeObserver; the thread observes its message list.
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const { default: ConversationView, NewConversationView } = await import("@/components/chat/conversationView");
const { CHAT_HEIGHT, CHAT_LAYOUT_PADDING } = await import("@/components/chat/chatHeight");
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
    it("the conversation pane and the inbox use the shared full-height class", async () => {
        const { container } = renderWith(<ConversationView conversationId="cnv_a" />);
        await screen.findByText("hello 2");
        const pane = container.firstElementChild;
        CHAT_HEIGHT.split(" ").forEach((c) => expect(pane.classList.contains(c)).toBe(true));
        // It fills its grid cell: no viewport offset that would ignore the verify-email banner (messagesLayout.test.jsx).
        expect(CHAT_HEIGHT).toBe("h-full");
        expect(CHAT_LAYOUT_PADDING.split(" ")).toEqual(["md:p-4", "lg:px-6", "lg:pt-10"]);
        expect(pane.className).not.toMatch(/vh|calc\(/);
        expect(pane.classList.contains("max-md:rounded-none")).toBe(true);
    });

    it("renders the thread oldest first with the composer and attach button", async () => {
        renderWith(<ConversationView conversationId="cnv_a" />);
        await screen.findByText("hello 2");
        const texts = [...document.querySelectorAll("li p")].map((p) => p.textContent).filter((t) => t.startsWith("hello"));
        expect(texts).toEqual(["hello 1", "hello 2"]);
        expect(screen.getByRole("heading", { name: "Ada" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Attach files" })).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Message request" })).toBeNull();
    });

    it("marks the newest server seq read when visible at the bottom", async () => {
        const { markReadAction } = await import("@/actions/chat.actions");
        renderWith(<ConversationView conversationId="cnv_a" />);
        await screen.findByText("hello 2");
        await waitFor(() => expect(markReadAction).toHaveBeenCalledWith({ conversationId: "cnv_a", seq: "2" }), { timeout: 3000 });
    });

    it("tracks the open conversation while visible and clears it on unmount, only if it still holds this id", async () => {
        const { getOpenConversation, setOpenConversation } = await import("@/lib/chat/openConversation");
        const first = renderWith(<ConversationView conversationId="cnv_a" />);
        expect(getOpenConversation()).toBe("cnv_a");
        const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        expect(getOpenConversation()).toBeNull();
        visibility.mockReturnValue("visible");
        document.dispatchEvent(new Event("visibilitychange"));
        expect(getOpenConversation()).toBe("cnv_a");
        first.unmount();
        expect(getOpenConversation()).toBeNull();

        const second = renderWith(<ConversationView conversationId="cnv_a" />);
        setOpenConversation("cnv_b");   // another conversation took over before this one unmounted
        second.unmount();
        expect(getOpenConversation()).toBe("cnv_b");
        visibility.mockRestore();
        setOpenConversation(null);
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

    it("a team conversation's header shows a Team tag and the group icon; a direct one does not", async () => {
        const { container } = renderWith(<ConversationView conversationId="cnv_a" />);
        await screen.findByRole("heading", { name: "Ada" });
        expect(container.querySelector("header [data-slot=badge]")).toBeNull();
        cleanup();
        detail = { ...detail, kind: "team", title: "Night owls", teamId: null };
        const team = renderWith(<ConversationView conversationId="cnv_a" />);
        await screen.findByRole("heading", { name: "Night owls" });
        const header = team.container.querySelector("header");
        expect(header.querySelector("[data-slot=badge]")?.textContent).toBe("Team");
        expect(header.querySelector("[data-slot=avatar]")).toBeNull();
        expect(header.textContent).toContain("2 members");
    });

    it("shows the request banner to a pending member and hides images", async () => {
        detail.members = [member("P1", { state: "pending" }), member("P2")];
        renderWith(<ConversationView conversationId="cnv_a" />);
        const banner = await screen.findByRole("region", { name: "Message request" });
        expect(banner.textContent).toContain("Ada wants to message you");
        for (const name of ["Accept", "Decline", "Block"]) expect(screen.getByRole("button", { name })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull();
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

    describe("scrolled up", () => {
        const scrollTo = vi.fn();
        // jsdom has no layout: fake a 1000px thread in a 400px box, and a scroll position.
        const scrollTo_ = async (top) => {
            const log = await screen.findByRole("log");
            Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1000 });
            Object.defineProperty(log, "clientHeight", { configurable: true, value: 400 });
            log.scrollTo = scrollTo;
            log.scrollTop = top;
            fireEvent.scroll(log);
            return log;
        };
        const arrive = (seq, senderId) => act(() => queryClient.setQueryData(["chat", "messages", "cnv_a"], (data) => ({
            ...data, pages: [{ ...data.pages[0], items: [message(seq, senderId), ...data.pages[0].items] }, ...data.pages.slice(1)],
        })));
        beforeEach(() => { scrollTo.mockClear(); });

        it("a jump-to-latest button appears and scrolls to the bottom", async () => {
            renderWith(<ConversationView conversationId="cnv_a" />);
            await screen.findByText("hello 2");
            expect(screen.queryByRole("button", { name: /Jump to latest messages/ })).toBeNull();
            await scrollTo_(100);
            const jump = await screen.findByRole("button", { name: "Jump to latest messages" });
            jump.focus();
            fireEvent.click(jump);
            expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
            // Back at the bottom: the button goes, and keyboard focus stays on the thread instead of <body>.
            const log = screen.getByRole("log");
            log.scrollTop = 600;
            fireEvent.scroll(log);
            await waitFor(() => expect(screen.queryByRole("button", { name: /Jump to latest messages/ })).toBeNull());
            expect(document.activeElement).toBe(log);
        });

        it("scrolling up slowly while someone types stays scrolled up (no snap back when the bubble hides)", async () => {
            renderWith(<ConversationView conversationId="cnv_a" />);
            await screen.findByText("hello 2");
            act(() => useChatTypingStore.getState().setTyping("cnv_a", "P2"));
            const log = await screen.findByRole("log");
            // The in-list bubble is 44px: 60px from the end with it, 16px without it.
            const inList = () => log.querySelectorAll(".animate-typing-dot").length > 0;
            Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => (inList() ? 1000 : 956) });
            Object.defineProperty(log, "clientHeight", { configurable: true, value: 400 });
            log.scrollTop = 540;
            fireEvent.scroll(log);
            await screen.findByRole("button", { name: "Jump to latest messages" });
            // The shrink fires a scroll event in a browser: 16px from the end is still scrolled up.
            fireEvent.scroll(log);
            expect(screen.getByRole("button", { name: "Jump to latest messages" })).toBeTruthy();
            expect(inList()).toBe(false);
            expect(log.scrollTop).toBe(540);
            // At the end the reader is back at the bottom and the bubble returns.
            log.scrollTop = 556;
            fireEvent.scroll(log);
            await waitFor(() => expect(screen.queryByRole("button", { name: /Jump to latest messages/ })).toBeNull());
            expect(inList()).toBe(true);
        });

        it("a cached message without a readable seq does not break the new-message count", async () => {
            page = { items: [message(3, "P2"), { ...message(2, "P2"), seq: "not-a-seq" }, message(1, "P1")], nextCursor: null };
            renderWith(<ConversationView conversationId="cnv_a" />);
            await screen.findByText("hello 3");
            await scrollTo_(100);
            await screen.findByRole("button", { name: "Jump to latest messages" });
            arrive(4, "P2");
            expect(await screen.findByRole("button", { name: "Jump to latest messages, 1 new" })).toBeTruthy();
        });

        it("jumps instantly under prefers-reduced-motion", async () => {
            const original = window.matchMedia;
            window.matchMedia = () => ({ matches: true });
            try {
                renderWith(<ConversationView conversationId="cnv_a" />);
                await screen.findByText("hello 2");
                await scrollTo_(100);
                fireEvent.click(await screen.findByRole("button", { name: "Jump to latest messages" }));
                expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "auto" });
            } finally {
                window.matchMedia = original;
            }
        });

        it("messages that arrive while scrolled up do not move the scroll and are counted on the button", async () => {
            renderWith(<ConversationView conversationId="cnv_a" />);
            await screen.findByText("hello 2");
            const log = await scrollTo_(100);
            await screen.findByRole("button", { name: "Jump to latest messages" });
            arrive(3, "P2");
            arrive(4, "P1");   // mine: not counted
            arrive(5, "P2");
            expect(await screen.findByRole("button", { name: "Jump to latest messages, 2 new" })).toBeTruthy();
            expect(log.scrollTop).toBe(100);
        });

        it("at the bottom new messages still scroll into view", async () => {
            renderWith(<ConversationView conversationId="cnv_a" />);
            await screen.findByText("hello 2");
            const log = await scrollTo_(600);   // within BOTTOM_SLACK of the end
            log.scrollTop = 600;
            arrive(3, "P2");
            await screen.findByText("hello 3");
            expect(log.scrollTop).toBe(1000);
            expect(screen.queryByRole("button", { name: /Jump to latest messages/ })).toBeNull();
        });

        it("the typing indicator floats above the composer, with one live region", async () => {
            renderWith(<ConversationView conversationId="cnv_a" />);
            await screen.findByText("hello 2");
            const log = await scrollTo_(100);
            act(() => useChatTypingStore.getState().setTyping("cnv_a", "P2"));
            expect(log.querySelectorAll(".animate-typing-dot")).toHaveLength(0);
            const bar = screen.getByText("p2 is typing", { selector: "span" }).parentElement;
            expect(log.contains(bar)).toBe(false);
            expect(bar.getAttribute("aria-hidden")).toBe("true");
            expect(bar.querySelectorAll(".animate-typing-dot")).toHaveLength(3);
            expect(screen.getAllByRole("status")).toHaveLength(1);
        });
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
