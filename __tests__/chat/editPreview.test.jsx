// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Edit mode: overlay over the thread, live preview in the middle, check to save. */
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

globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const { default: ConversationView } = await import("@/components/chat/conversationView");
const { chatKeys } = await import("@/keys/chat.keys");

const member = (id, over = {}) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0", ...over });
const message = (seq, senderId, over = {}) => ({
    id: `msg_${seq}`, seq: String(seq), conversationId: "cnv_a", clientId: `c${seq}`, sender: member(senderId),
    body: `hello ${seq}`, attachments: [], createdAt: new Date().toISOString(), editedAt: null, deleted: false, replyTo: null, reactions: [], ...over,
});
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
const box = () => screen.getByRole("textbox", { name: "Edit message" });
const overlay = () => screen.queryByRole("button", { name: "Cancel edit" })?.closest(".absolute");
const bubble = () => overlay().querySelector(".bg-primary");
const startEdit = async () => {
    fireEvent.pointerDown(await screen.findByRole("button", { name: "More actions for p1" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await screen.findByRole("button", { name: "Cancel edit" });
};
const patch = (fn) => act(async () => client.setQueryData(chatKeys.messages("cnv_a"), (data) => ({
    ...data, pages: data.pages.map((p) => ({ ...p, items: fn(p.items) })),
})));

beforeEach(() => {
    vi.clearAllMocks();
    client.clear();
    detail = { id: "cnv_a", kind: "direct", title: "Ada", image: null, state: "active", canSend: true, members: [member("P1"), member("P2")] };
    page = { items: [message(2, "P2"), message(1, "P1")], nextCursor: null };
    editMessageAction.mockResolvedValue({ success: true, data: { message: message(1, "P1", { body: "changed" }) } });
});
afterEach(cleanup);

describe("edit overlay", () => {
    it("edit mode covers the thread with an overlay and shows the typed text in a centred preview bubble", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await startEdit();
        const log = screen.getByRole("log", { hidden: true });
        expect(log.getAttribute("aria-hidden")).toBe("true");
        expect(log.hasAttribute("inert")).toBe(true);
        expect(overlay().className).toContain("inset-0");
        expect(bubble().textContent).toBe("hello 1");
        fireEvent.change(box(), { target: { value: "typed text" } });
        expect(bubble().textContent).toBe("typed text");
    });

    it("whitespace-only draft previews the original body", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await startEdit();
        fireEvent.change(box(), { target: { value: "   " } });
        expect(bubble().textContent).toBe("hello 1");
    });

    it("the composer has no Editing message bar; textarea is labelled Edit message; submit shows a check labelled Save changes; normal mode shows Send", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        expect(await screen.findByRole("button", { name: "Send" })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
        await startEdit();
        expect(screen.queryByText("Editing message")).toBeNull();
        expect(box()).toBeTruthy();
        expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    });

    it("clicking the overlay, the preview's ✕, Esc, save, conversation change and unsend each remove the overlay", async () => {
        const { rerender } = render(wrap(<ConversationView conversationId="cnv_a" />));
        await startEdit();
        fireEvent.click(overlay());
        expect(overlay()).toBeFalsy();

        await startEdit();
        fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
        expect(overlay()).toBeFalsy();

        await startEdit();
        fireEvent.keyDown(box(), { key: "Escape" });
        expect(overlay()).toBeFalsy();

        await startEdit();
        fireEvent.change(box(), { target: { value: "changed" } });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(overlay()).toBeFalsy());

        await startEdit();
        await patch((items) => items.map((m) => (m.id === "msg_1" ? { ...m, deleted: true, body: null } : m)));
        expect(overlay()).toBeFalsy();

        // Restore the message, then change conversation mid-edit.
        await patch((items) => items.map((m) => (m.id === "msg_1" ? message(1, "P1") : m)));
        await startEdit();
        detail = { ...detail, id: "cnv_b" };
        rerender(wrap(<ConversationView conversationId="cnv_b" />));
        await waitFor(() => expect(overlay()).toBeFalsy());
    });

    it("clicking inside the preview card does not cancel", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await startEdit();
        fireEvent.click(bubble());
        fireEvent.click(screen.getByText("Edit message", { selector: "p" }));
        expect(overlay()).toBeTruthy();
    });

    it("a realtime message arriving during edit is added under the overlay; a realtime edit of the edited message does not replace the preview", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await startEdit();
        fireEvent.change(box(), { target: { value: "my typing" } });
        await patch((items) => [message(3, "P2", { body: "brand new" }), ...items.map((m) => (m.id === "msg_1" ? { ...m, body: "edited elsewhere" } : m))]);
        await waitFor(() => expect(screen.getByText("brand new", { ignore: "textarea" })).toBeTruthy());
        expect(overlay()).toBeTruthy();
        expect(bubble().textContent).toBe("my typing");
        expect(box().value).toBe("my typing");
    });

    it("the preview bubble hugs its text on the right instead of stretching", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await startEdit();
        expect(bubble().className).toContain("self-end");
        expect(bubble().className.split(" ")).not.toContain("w-full");
    });

    it("a new edit never shows the previous edit's typed text", async () => {
        page = { items: [message(2, "P1", { body: "second" }), message(1, "P1")], nextCursor: null };
        render(wrap(<ConversationView conversationId="cnv_a" />));
        const edit = async (index) => {
            fireEvent.pointerDown((await screen.findAllByRole("button", { name: "More actions for p1" }))[index], { button: 0, ctrlKey: false });
            fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
            await screen.findByRole("button", { name: "Cancel edit" });
        };
        await edit(0);
        fireEvent.change(box(), { target: { value: "old draft" } });
        fireEvent.keyDown(box(), { key: "Escape" });
        await edit(1);
        expect(bubble().textContent).toBe("second");
    });

    it("focus stays in the edit textarea after a mousedown inside the card or on the overlay", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await startEdit();
        box().focus();
        for (const el of [bubble(), screen.getByText("Edit message", { selector: "p" }), overlay()]) {
            expect(fireEvent.mouseDown(el)).toBe(false);   // default prevented, so the browser keeps focus
            expect(document.activeElement).toBe(box());
        }
    });

    it("the jump-to-latest button is not rendered under the overlay", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        const log = await screen.findByRole("log");
        Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1000 });
        Object.defineProperty(log, "clientHeight", { configurable: true, value: 400 });
        log.scrollTop = 100;
        fireEvent.scroll(log);
        await screen.findByRole("button", { name: "Jump to latest messages" });
        await startEdit();
        expect(screen.queryByRole("button", { name: /Jump to latest messages/, hidden: true })).toBeNull();
    });

    it("the preview never reaches the query cache", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        await startEdit();
        fireEvent.change(box(), { target: { value: "only in the preview" } });
        const cached = client.getQueryData(chatKeys.messages("cnv_a")).pages.flatMap((p) => p.items).find((m) => m.id === "msg_1");
        expect(cached.body).toBe("hello 1");
    });
});
