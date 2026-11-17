// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** The thread stays at the newest message while content (images) grows, unless the reader scrolled up. */
const member = (id) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0" });
const msg = (n, extra = {}) => ({ id: `msg_${n}`, seq: String(n), clientId: `c${n}`, sender: member("P2"), body: `body ${n}`, attachments: [], createdAt: "2026-11-11T10:00:00Z", editedAt: null, deleted: false, replyTo: null, reactions: [], ...extra });

const getMessages = vi.fn();
vi.mock("@/clients/chat.client", () => ({ chatClient: { getMessages: (...a) => getMessages(...a) } }));
vi.mock("@/actions/chat.actions", () => ({ markReadAction: vi.fn(async () => ({ success: true, data: {} })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/codeBlock", () => ({ default: () => null }));

const { default: MessageList } = await import("@/components/chat/messageList");
const { useChatOutboxStore } = await import("@/stores/chatOutboxStore");

let resizers, intersectors;
beforeEach(() => {
    resizers = [];
    intersectors = [];
    getMessages.mockReset();
    globalThis.ResizeObserver = class {
        constructor(callback) { this.callback = callback; this.live = true; this.nodes = []; resizers.push(this); }
        observe(node) { this.nodes.push(node); }
        disconnect() { this.live = false; }
        unobserve() {}
    };
    globalThis.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; this.live = true; intersectors.push(this); }
        observe() {}
        disconnect() { this.live = false; }
        unobserve() {}
    };
});
afterEach(() => { cleanup(); useChatOutboxStore.setState({ byConversation: {} }); });

const conversation = { id: "cnv_a", kind: "direct", members: [member("P1"), member("P2")] };
const view = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MessageList conversation={conversation} meId="P1" failures={{}} />
    </QueryClientProvider>,
);
const resize = () => act(() => resizers.filter((o) => o.live).forEach((o) => o.callback([])));
const tall = (log, height) => Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => height });

describe("thread stays at the newest message", () => {
    it("while at the bottom, a resize of the message list scrolls to the end", async () => {
        getMessages.mockResolvedValue({ items: [msg(1)], nextCursor: null });
        view();
        const log = await screen.findByRole("log");
        await screen.findByText("body 1");
        tall(log, 2000);   // an image loaded and made the list taller
        await resize();
        expect(log.scrollTop).toBe(2000);
    });

    it("after the reader scrolled up, a resize does not move them", async () => {
        getMessages.mockResolvedValue({ items: [msg(1)], nextCursor: null });
        view();
        const log = await screen.findByRole("log");
        await screen.findByText("body 1");
        tall(log, 2000);
        log.scrollTop = 100;
        fireEvent.scroll(log);
        tall(log, 2600);
        await resize();
        expect(log.scrollTop).toBe(100);
    });

    it("disconnects the observer on unmount", async () => {
        getMessages.mockResolvedValue({ items: [msg(1)], nextCursor: null });
        const { unmount } = view();
        await screen.findByText("body 1");
        expect(resizers.some((o) => o.live)).toBe(true);
        unmount();
        expect(resizers.some((o) => o.live)).toBe(false);
    });

    it("a failed earlier-page fetch clears the saved position, so a later change does not restore it", async () => {
        getMessages.mockResolvedValueOnce({ items: [msg(2)], nextCursor: "cur" }).mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 400 }));
        view();
        const log = await screen.findByRole("log");
        await screen.findByText("body 2");
        tall(log, 1000);
        log.scrollTop = 0;
        fireEvent.scroll(log);   // reader is at the top, 1000px from the end
        await waitFor(() => expect(intersectors.some((o) => o.live)).toBe(true));
        await act(async () => intersectors.filter((o) => o.live).at(-1).callback([{ isIntersecting: true }]));
        await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole("status", { name: "Loading earlier messages" })).toBeNull());
        tall(log, 1500);
        const unsent = { clientId: "u1", id: null, seq: null, sender: member("P1"), body: "mine", attachments: [], status: "sending", createdAt: "2026-11-11T10:01:00Z", reactions: [], replyTo: null };
        await act(async () => useChatOutboxStore.getState().addUnsent("cnv_a", unsent));
        await screen.findByText("mine");
        expect(log.scrollTop).toBe(0);   // a stale restore would put it at 1500 - 1000 = 500
    });

    it("while at the bottom, a resize of the scroller itself (keyboard, Editing bar) scrolls to the end", async () => {
        getMessages.mockResolvedValue({ items: [msg(1)], nextCursor: null });
        view();
        const log = await screen.findByRole("log");
        await screen.findByText("body 1");
        tall(log, 2000);
        const watcher = resizers.find((o) => o.live && o.nodes.includes(log));
        expect(watcher).toBeTruthy();
        await act(async () => watcher.callback([]));
        expect(log.scrollTop).toBe(2000);
    });

    it("an item that arrives during an older-page fetch does not drop the saved position", async () => {
        let land;
        getMessages.mockResolvedValueOnce({ items: [msg(2)], nextCursor: "cur" }).mockReturnValueOnce(new Promise((resolve) => { land = resolve; }));
        view();
        const log = await screen.findByRole("log");
        await screen.findByText("body 2");
        tall(log, 1000);
        log.scrollTop = 0;
        fireEvent.scroll(log);   // 1000px from the end
        await waitFor(() => expect(intersectors.some((o) => o.live)).toBe(true));
        await act(async () => intersectors.filter((o) => o.live).at(-1).callback([{ isIntersecting: true }]));
        await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(2));
        tall(log, 1100);
        const unsent = { clientId: "u1", id: null, seq: null, sender: member("P1"), body: "mine", attachments: [], status: "sending", createdAt: "2026-11-11T10:01:00Z", reactions: [], replyTo: null };
        await act(async () => useChatOutboxStore.getState().addUnsent("cnv_a", unsent));
        await screen.findByText("mine");
        tall(log, 3100);   // the page lands, 2000px taller
        await act(async () => land({ items: [msg(1)], nextCursor: null }));
        await screen.findByText("body 1");
        expect(log.scrollTop).toBe(2100);   // scrollHeight - 1000, the distance saved when the fetch began
    });

    it("a single image with width and height reserves its box: style aspect-ratio \"w / h\"", async () => {
        getMessages.mockResolvedValue({ items: [msg(1, { attachments: [{ id: "a1", width: 800, height: 600, name: "p.png" }] })], nextCursor: null });
        view();
        const img = await screen.findByRole("img");
        expect(img.style.aspectRatio).toBe("800 / 600");
        expect(img.className).toMatch(/max-h-72/);
        expect(img.className).not.toMatch(/(^| )(w-auto|w-full)( |$)/);
        expect(img.className).toMatch(/\bh-auto\b/);
    });

    it.each([[600, 800, "216px"], [300, 100, "300px"], [2000, 1000, "576px"]])("a %ix%i image gets an inline width of %s and can still shrink", async (w, h, width) => {
        getMessages.mockResolvedValue({ items: [msg(1, { attachments: [{ id: "a1", width: w, height: h, name: "p.png" }] })], nextCursor: null });
        view();
        const img = await screen.findByRole("img");
        expect(img.style.width).toBe(width);
        expect(img.className).toMatch(/\bmax-w-full\b/);
    });

    it("an image without a size renders as today", async () => {
        getMessages.mockResolvedValue({ items: [msg(1, { attachments: [{ id: "a1", name: "p.png" }] })], nextCursor: null });
        view();
        const img = await screen.findByRole("img");
        expect(img.style.aspectRatio).toBe("");
        expect(img.className).toMatch(/\bw-auto\b/);
    });
});
