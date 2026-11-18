// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Edit mode ends when the message being edited is unsent. */
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
const { chatKeys } = await import("@/keys/chat.keys");

const member = (id, over = {}) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0", ...over });
const message = (seq, senderId, over = {}) => ({
    id: `msg_${seq}`, seq: String(seq), conversationId: "cnv_a", clientId: `c${seq}`, sender: member(senderId),
    body: `hello ${seq}`, attachments: [], createdAt: new Date().toISOString(), editedAt: null, deleted: false, replyTo: null, reactions: [], ...over,
});
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
const box = () => screen.getByRole("textbox", { name: /^(Edit message|Message)$/ });

beforeEach(() => {
    vi.clearAllMocks();
    client.clear();
    detail = { id: "cnv_a", kind: "direct", title: "Ada", image: null, state: "active", canSend: true, members: [member("P1"), member("P2")] };
    page = { items: [message(2, "P2"), message(1, "P1")], nextCursor: null };
});
afterEach(cleanup);

describe("edit mode when the edited message is unsent", () => {
    it("leaves edit mode when a realtime recall marks it deleted", async () => {
        render(wrap(<ConversationView conversationId="cnv_a" />));
        fireEvent.pointerDown(await screen.findByRole("button", { name: "More actions for p1" }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
        await screen.findByText("Edit message", { selector: "p" });
        expect(box().value).toBe("hello 1");
        await act(async () => client.setQueryData(chatKeys.messages("cnv_a"), (data) => ({
            ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === "msg_1" ? { ...m, deleted: true, body: null } : m)) })),
        })));
        expect(screen.queryByText("Edit message", { selector: "p" })).toBeNull();
        expect(box().value).toBe("");
    });
});
