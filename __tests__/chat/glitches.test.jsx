// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Browser-found glitches. Send flash: a sending message (id null) must not match flashId null and ring. */
const member = (id) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0" });
const sent = { id: "msg_1", seq: "1", clientId: "c1", sender: member("P1"), body: "settled", attachments: [], createdAt: "2026-11-11T10:00:00Z", editedAt: null, deleted: false, replyTo: null, reactions: [] };
const quoting = { ...sent, id: "msg_2", seq: "2", clientId: "c2", body: "answer", replyTo: { id: "msg_1", senderName: "Ada", preview: "settled", deleted: false } };
const sending = { ...sent, id: null, seq: null, clientId: "c3", body: "in flight", status: "sending" };

vi.mock("@/clients/chat.client", () => ({
    chatClient: { getMessages: async () => ({ items: [quoting, sent], nextCursor: null }) },
}));
vi.mock("@/actions/chat.actions", () => ({ markReadAction: vi.fn(async () => ({ success: true, data: {} })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/codeBlock", () => ({ default: () => null }));

// jsdom has no ResizeObserver; the thread observes its message list.
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const { default: MessageList } = await import("@/components/chat/messageList");
const { useChatOutboxStore } = await import("@/stores/chatOutboxStore");

const conversation = { id: "cnv_a", kind: "direct", members: [member("P1"), member("P2")] };
const view = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MessageList conversation={conversation} meId="P1" failures={{}} />
    </QueryClientProvider>,
);
afterEach(() => { cleanup(); useChatOutboxStore.setState({ byConversation: {} }); });

describe("send flash", () => {
    it("a sending message (id null) has no data-flash", async () => {
        useChatOutboxStore.getState().addUnsent("cnv_a", sending);
        view();
        await screen.findByText("in flight");
        const li = screen.getByText("in flight").closest("li");
        expect(li.hasAttribute("data-flash")).toBe(false);
    });

    it("the jump flash still rings the quoted message", async () => {
        view();
        await screen.findByText("answer");
        const target = document.querySelector('[data-message-id="msg_1"]');
        target.scrollIntoView = vi.fn();
        fireEvent.click(await screen.findByRole("button", { name: /go to original/ }));
        await waitFor(() => expect(target.hasAttribute("data-flash")).toBe(true));
    });
});
