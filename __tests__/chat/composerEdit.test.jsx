// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Editing a message in the composer: the Editing message bar, its draft, save and cancel (chat polish task 2). */
let detail;
let page;
const editMessageAction = vi.fn();

vi.mock("@/clients/chat.client", () => ({
    chatClient: { getConversation: async () => detail, getMessages: async () => page },
}));
vi.mock("@/actions/chat.actions", () => ({
    ...Object.fromEntries(["blockUserAction", "createChatUploadAction", "recallMessageAction",
        "reportMessageAction", "respondRequestAction", "unblockUserAction", "toggleReactionAction", "sendMessageAction"].map((name) => [name, vi.fn()])),
    editMessageAction: (...a) => editMessageAction(...a),
    markReadAction: vi.fn(async () => ({ success: true, data: {} })),
    typingAction: vi.fn(async () => ({ success: true, data: { ok: true } })),
}));
vi.mock("@/lib/pusherClient", () => ({ getPusherClient: () => null }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "P1" } }, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));
vi.mock("@/components/ui/codeBlock", () => ({ default: () => null }));

// jsdom has no ResizeObserver; the thread observes its message list.
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const { default: ConversationView } = await import("@/components/chat/conversationView");
const { default: Composer } = await import("@/components/chat/composer");
const { default: MessageBubble } = await import("@/components/chat/messageBubble");

const member = (id, over = {}) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0", ...over });
// Recent, so the 15 minute edit window is open.
const message = (seq, senderId, over = {}) => ({
    id: `msg_${seq}`, seq: String(seq), conversationId: "cnv_a", clientId: `c${seq}`, sender: member(senderId),
    body: `hello ${seq}`, attachments: [], createdAt: new Date().toISOString(), editedAt: null, deleted: false, replyTo: null, reactions: [], ...over,
});
const wrap = (ui) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const inClient = (ui) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
const box = () => screen.getByRole("textbox", { name: "Message" });
const menuItem = async (who, name) => {
    fireEvent.pointerDown(await screen.findByRole("button", { name: `More actions for ${who}` }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name }));
};

const editing = { id: "msg_1", body: "hello 1" };
const props = (over = {}) => ({ imagesAllowed: true, optimistic: true, onSubmit: vi.fn(), onSaveEdit: vi.fn().mockResolvedValue(), onCancelEdit: vi.fn(), ...over });

beforeEach(() => {
    vi.clearAllMocks();
    detail = { id: "cnv_a", kind: "direct", title: "Ada", image: null, state: "active", canSend: true, members: [member("P1"), member("P2")] };
    page = { items: [message(2, "P2"), message(1, "P1")], nextCursor: null };
    editMessageAction.mockResolvedValue({ success: true, data: { message: message(1, "P1", { body: "changed" }) } });
});
afterEach(cleanup);

describe("Composer edit mode", () => {
    it("Edit puts the text in the composer under an Editing message bar, and hides Attach", () => {
        const { rerender } = render(inClient(<Composer {...props()} editing={null} />));
        expect(screen.getByRole("button", { name: "Attach files" })).toBeTruthy();
        rerender(inClient(<Composer {...props()} editing={editing} />));
        expect(screen.getByText("Editing message")).toBeTruthy();
        expect(box().value).toBe("hello 1");
        expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull();
        expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
        expect(document.activeElement).toBe(box());
    });

    it("Enter saves through onSaveEdit and leaves edit mode; the draft typed before Edit comes back", async () => {
        const p = props();
        const { rerender } = render(inClient(<Composer {...p} editing={null} />));
        fireEvent.change(box(), { target: { value: "my draft" } });
        rerender(inClient(<Composer {...p} editing={editing} />));
        expect(box().value).toBe("hello 1");
        fireEvent.change(box(), { target: { value: "hello changed" } });
        fireEvent.keyDown(box(), { key: "Enter" });
        await waitFor(() => expect(p.onSaveEdit).toHaveBeenCalledWith("hello changed"));
        // The parent leaves edit mode once onSaveEdit resolves.
        rerender(inClient(<Composer {...p} editing={null} />));
        expect(screen.queryByText("Editing message")).toBeNull();
        expect(box().value).toBe("my draft");
        expect(screen.getByRole("button", { name: "Attach files" })).toBeTruthy();
        expect(p.onSubmit).not.toHaveBeenCalled();
    });

    it("Esc that closes an IME candidate list does not cancel the edit", () => {
        const p = props();
        render(inClient(<Composer {...p} editing={editing} />));
        fireEvent.keyDown(box(), { key: "Escape", isComposing: true });
        expect(p.onCancelEdit).not.toHaveBeenCalled();
    });

    it("Esc and the ✕ (Cancel edit) leave edit mode without saving and restore the draft", () => {
        const p = props();
        const { rerender } = render(inClient(<Composer {...p} editing={null} />));
        fireEvent.change(box(), { target: { value: "draft" } });
        rerender(inClient(<Composer {...p} editing={editing} />));
        fireEvent.keyDown(box(), { key: "Escape" });
        expect(p.onCancelEdit).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
        expect(p.onCancelEdit).toHaveBeenCalledTimes(2);
        expect(p.onSaveEdit).not.toHaveBeenCalled();
        rerender(inClient(<Composer {...p} editing={null} />));
        expect(box().value).toBe("draft");
    });

    it("saving unchanged or empty text calls nothing and leaves edit mode", () => {
        const p = props();
        render(inClient(<Composer {...p} editing={editing} />));
        fireEvent.keyDown(box(), { key: "Enter" });
        expect(p.onSaveEdit).not.toHaveBeenCalled();
        expect(p.onCancelEdit).toHaveBeenCalledTimes(1);
        fireEvent.change(box(), { target: { value: "   " } });
        fireEvent.keyDown(box(), { key: "Enter" });
        expect(p.onSaveEdit).not.toHaveBeenCalled();
        expect(p.onCancelEdit).toHaveBeenCalledTimes(2);
    });

    it("a failed save keeps edit mode and the typed text", async () => {
        const p = props({ onSaveEdit: vi.fn().mockRejectedValue(new Error("nope")) });
        render(inClient(<Composer {...p} editing={editing} />));
        fireEvent.change(box(), { target: { value: "typed" } });
        fireEvent.keyDown(box(), { key: "Enter" });
        await waitFor(() => expect(p.onSaveEdit).toHaveBeenCalledWith("typed"));
        await waitFor(() => expect(screen.getByRole("button", { name: "Send" }).disabled).toBe(false));
        expect(screen.getByText("Editing message")).toBeTruthy();
        expect(box().value).toBe("typed");
        expect(p.onCancelEdit).not.toHaveBeenCalled();
    });
});

describe("ConversationView edit wiring", () => {
    it("starting a reply while editing clears the edit bar, and Edit clears the reply bar", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await menuItem("p1", "Edit");
        expect(await screen.findByText("Editing message")).toBeTruthy();
        expect(box().value).toBe("hello 1");

        await menuItem("p2", "Reply");
        await screen.findByText(/Replying to/);
        expect(screen.queryByText("Editing message")).toBeNull();

        await menuItem("p1", "Edit");
        await screen.findByText("Editing message");
        expect(screen.queryByText(/Replying to/)).toBeNull();
    });

    it("choosing Edit from the menu leaves focus in the composer textarea", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await menuItem("p1", "Edit");
        await screen.findByText("Editing message");
        await waitFor(() => expect(document.activeElement).toBe(box()));
    });

    it("with canSend false the menu has no Edit item", async () => {
        detail = { ...detail, canSend: false };
        render(wrap(<ConversationView conversationId="cnv_a" />));
        fireEvent.pointerDown(await screen.findByRole("button", { name: "More actions for p1" }), { button: 0, ctrlKey: false });
        await screen.findByRole("menuitem", { name: "Unsend" });
        expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    });

    it("saving an edit goes through the edit mutation and leaves edit mode", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await menuItem("p1", "Edit");
        await screen.findByText("Editing message");
        fireEvent.change(box(), { target: { value: "changed" } });
        fireEvent.keyDown(box(), { key: "Enter" });
        await waitFor(() => expect(editMessageAction).toHaveBeenCalled());
        expect(editMessageAction.mock.calls[0][0]).toMatchObject({ messageId: "msg_1", body: "changed" });
        await waitFor(() => expect(screen.queryByText("Editing message")).toBeNull());
    });

    it("changing conversation while editing clears edit mode", async () => {
        const { rerender } = render(wrap(<ConversationView conversationId="cnv_a" />));
        await menuItem("p1", "Edit");
        await screen.findByText("Editing message");
        detail = { ...detail, id: "cnv_b" };
        rerender(wrap(<ConversationView conversationId="cnv_b" />));
        await waitFor(() => expect(screen.queryByText("Editing message")).toBeNull());
    });
});

describe("MessageBubble Edit", () => {
    it("the menu's Edit calls onStartEdit; no in-thread edit form renders", async () => {
        const onStartEdit = vi.fn();
        render(<MessageBubble message={message(1, "P1")} mine others={[]} meId="P1" onRetry={() => {}} onDiscard={() => {}} onUnsend={() => {}} onReport={() => {}} onStartEdit={onStartEdit} />);
        await menuItem("p1", "Edit");
        await waitFor(() => expect(onStartEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "msg_1" })));
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
        expect(screen.getByText("hello 1")).toBeTruthy();
    });
});
