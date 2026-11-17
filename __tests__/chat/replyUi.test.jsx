// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Reply UI: the Replying-to bar, the quote in a bubble and the jump to the original (spec section 5.3). */
let detail;
let page;
const sendMessageAction = vi.fn();
const showAlert = vi.fn();

vi.mock("@/clients/chat.client", () => ({
    chatClient: { getConversation: async () => detail, getMessages: async () => page },
}));
vi.mock("@/actions/chat.actions", () => ({
    ...Object.fromEntries(["blockUserAction", "createChatUploadAction", "editMessageAction", "recallMessageAction",
        "reportMessageAction", "respondRequestAction", "unblockUserAction", "toggleReactionAction"].map((name) => [name, vi.fn()])),
    sendMessageAction: (...a) => sendMessageAction(...a),
    markReadAction: vi.fn(async () => ({ success: true, data: {} })),
    typingAction: vi.fn(async () => ({ success: true, data: { ok: true } })),
}));
vi.mock("@/lib/pusherClient", () => ({ getPusherClient: () => null }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "P1" } }, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));
vi.mock("@/components/ui/codeBlock", () => ({ default: () => null }));
vi.mock("@/components/ui/alert", async (importOriginal) => ({ ...(await importOriginal()), showAlert: (...a) => showAlert(...a) }));

// jsdom has no IntersectionObserver; the thread observes its top sentinel to load earlier messages.
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };

// jsdom has no ResizeObserver; the thread observes its message list.
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const { default: ConversationView } = await import("@/components/chat/conversationView");
const { default: MessageBubble } = await import("@/components/chat/messageBubble");

const member = (id, over = {}) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0", ...over });
const message = (seq, senderId, over = {}) => ({
    id: `msg_${seq}`, seq: String(seq), conversationId: "cnv_a", clientId: `c${seq}`, sender: member(senderId),
    body: `hello ${seq}`, attachments: [], createdAt: "2026-11-11T10:00:00Z", editedAt: null, deleted: false, replyTo: null, reactions: [], ...over,
});
const wrap = (ui) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
const box = () => screen.getByRole("textbox", { name: "Message" });
const reply = async () => {
    fireEvent.pointerDown(await screen.findByRole("button", { name: "More actions for p2" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reply" }));
    await screen.findByText(/Replying to/);
};

beforeEach(() => {
    vi.clearAllMocks();
    detail = { id: "cnv_a", kind: "direct", title: "Ada", image: null, state: "active", canSend: true, members: [member("P1"), member("P2")] };
    page = { items: [message(2, "P2"), message(1, "P1")], nextCursor: null };
    sendMessageAction.mockResolvedValue({ success: true, data: { message: message(3, "P1"), conversation: detail } });
});
afterEach(cleanup);

describe("replying", () => {
    it("Reply sets the composer's replying bar and sending passes replyToId; ✕ clears it", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await reply();
        expect(await screen.findByText(/Replying to/)).toBeTruthy();
        await waitFor(() => expect(document.activeElement).toBe(box()));

        fireEvent.click(screen.getByRole("button", { name: "Cancel reply" }));
        expect(screen.queryByText(/Replying to/)).toBeNull();

        await reply();
        fireEvent.change(box(), { target: { value: "answer" } });
        fireEvent.keyDown(box(), { key: "Enter" });
        await waitFor(() => expect(sendMessageAction).toHaveBeenCalled());
        expect(sendMessageAction.mock.calls[0][0]).toMatchObject({ body: "answer", replyToId: "msg_2" });
        await waitFor(() => expect(screen.queryByText(/Replying to/)).toBeNull());
    });

    it("switching conversation clears the reply; a failed send keeps it", async () => {
        const { rerender } = render(wrap(<ConversationView conversationId="cnv_a" />));
        await reply();
        sendMessageAction.mockResolvedValue({ success: false, status: 422, message: "Bad reply" });
        fireEvent.change(box(), { target: { value: "answer" } });
        fireEvent.keyDown(box(), { key: "Enter" });
        await waitFor(() => expect(sendMessageAction).toHaveBeenCalled());
        await waitFor(() => expect(box().value).toBe("answer"));
        expect(screen.getByText(/Replying to/)).toBeTruthy();

        detail = { ...detail, id: "cnv_b" };
        rerender(wrap(<ConversationView conversationId="cnv_b" />));
        await waitFor(() => expect(screen.queryByText(/Replying to/)).toBeNull());
    });
});

const handlers = { onRetry() {}, onDiscard() {}, onUnsend() {}, onReport() {} };

describe("the quote in a reply bubble", () => {
    const quoteOf = (senderId, senderName = "Ada", over = {}) => ({ id: "msg_1", senderId, senderName, preview: "the original", deleted: false, ...over });
    const bubble = (replier, replyTo, props = {}) => render(<MessageBubble message={message(5, replier, { replyTo })} mine={replier === "P1"} meId="P1" others={[]} {...handlers} {...props} />);

    it.each([
        ["P1", quoteOf("P1", "me"), "You replied to yourself"],
        ["P1", quoteOf("P2"), "You replied to Ada"],
        ["P2", quoteOf("P1", "me"), "p2 replied to you"],
        ["P2", quoteOf("P3", "Bob"), "p2 replied to Bob"],
        ["P2", quoteOf("P2", "p2"), "p2 replied to their own message"],
    ])("label: %s replies, reads %s", (replier, replyTo, label) => {
        bubble(replier, replyTo);
        expect(screen.getByText(label)).toBeTruthy();
    });

    it("the quote is one button that jumps; an unsent original reads Original message was unsent", () => {
        const replyTo = quoteOf("P1", "Ada");
        const onJump = vi.fn();
        const { rerender } = bubble("P2", replyTo, { onJump });
        const quote = screen.getByRole("button", { name: "Reply to Ada: the original, go to original" });
        expect(quote.textContent).toContain("the original");
        fireEvent.click(quote);
        expect(onJump).toHaveBeenCalledWith(replyTo);

        rerender(<MessageBubble message={message(5, "P2", { replyTo: { ...replyTo, preview: null, deleted: true } })} meId="P1" others={[]} onJump={onJump} {...handlers} />);
        expect(screen.getByText("Original message was unsent").className).toContain("italic");

        rerender(<MessageBubble message={message(5, "P2", { replyTo: null })} meId="P1" others={[]} onJump={onJump} {...handlers} />);
        expect(screen.queryByText("Original message was unsent")).toBeNull();
        expect(screen.queryByText(/replied to/)).toBeNull();
    });

    it("the quote sits above the reply bubble on the bubble's side, and the bubble overlaps it", () => {
        bubble("P1", quoteOf("P2"));
        const quote = screen.getByRole("button", { name: /go to original/ });
        expect(quote.className).toMatch(/\bbg-muted\b/);
        expect(quote.className).toMatch(/\bopacity-80\b/);
        const text = screen.getByText("hello 5").closest("div.rounded-2xl");
        expect(text.className).toContain("-mt-3");
        expect(text.className).toContain("relative");
        expect(screen.getByText("You replied to Ada").className).toContain("self-end");
        expect(quote.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("Reply from the menu carries the original's senderId into the optimistic quote", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await reply();
        fireEvent.change(box(), { target: { value: "answer" } });
        fireEvent.keyDown(box(), { key: "Enter" });
        expect(await screen.findByText("You replied to p2")).toBeTruthy();
    });
});

describe("jumping to the original", () => {
    it("clicking a quote of an unloaded message toasts Original message is not loaded", async () => {
        page = { items: [message(2, "P2", { replyTo: { id: "msg_gone", senderName: "Ada", preview: "old", deleted: false } })], nextCursor: "x" };
        render(wrap(<ConversationView conversationId="cnv_a" />));
        fireEvent.click(await screen.findByRole("button", { name: /go to original/ }));
        expect(showAlert).toHaveBeenCalledWith(0, "Original message is not loaded");
    });

    it("scrolls a loaded original to the centre and flashes it", async () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        page = { items: [message(2, "P2", { replyTo: { id: "msg_1", senderName: "me", preview: "hello 1", deleted: false } }), message(1, "P1")], nextCursor: null };
        render(wrap(<ConversationView conversationId="cnv_a" />));
        fireEvent.click(await screen.findByRole("button", { name: /go to original/ }));
        const original = document.querySelector('[data-message-id="msg_1"]');
        expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
        expect(original.hasAttribute("data-flash")).toBe(true);
        expect(showAlert).not.toHaveBeenCalled();
        expect(within(original).getByText("hello 1")).toBeTruthy();
    });
});
