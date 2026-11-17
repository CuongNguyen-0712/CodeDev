// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Earlier messages load when a sentinel at the top of the thread scrolls into view. */
const member = (id) => ({ id, username: id.toLowerCase(), nickname: null, image: null, state: "accepted", lastReadSeq: "0" });
const msg = (n) => ({ id: `msg_${n}`, seq: String(n), clientId: `c${n}`, sender: member("P2"), body: `body ${n}`, attachments: [], createdAt: "2026-11-11T10:00:00Z", editedAt: null, deleted: false, replyTo: null, reactions: [] });

const getMessages = vi.fn();
vi.mock("@/clients/chat.client", () => ({ chatClient: { getMessages: (...a) => getMessages(...a) } }));
vi.mock("@/actions/chat.actions", () => ({ markReadAction: vi.fn(async () => ({ success: true, data: {} })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/codeBlock", () => ({ default: () => null }));

const { default: MessageList } = await import("@/components/chat/messageList");

let observers;
beforeEach(() => {
    observers = [];
    getMessages.mockReset();
    globalThis.IntersectionObserver = class {
        constructor(callback, options) { this.callback = callback; this.options = options; this.nodes = []; this.live = true; observers.push(this); }
        observe(node) { this.nodes.push(node); }
        disconnect() { this.live = false; }
        unobserve() {}
    };
});
afterEach(cleanup);

const conversation = { id: "cnv_a", kind: "direct", members: [member("P1"), member("P2")] };
const view = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MessageList conversation={conversation} meId="P1" failures={{}} />
    </QueryClientProvider>,
);
const liveObserver = () => observers.filter((o) => o.live).at(-1);
const intersect = () => act(() => liveObserver().callback([{ isIntersecting: true }]));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const SPINNER = { name: "Loading earlier messages" };

describe("auto-load earlier messages", () => {
    it("no Load earlier button; a sentinel at the top loads the next page when it intersects", async () => {
        getMessages.mockResolvedValueOnce({ items: [msg(2)], nextCursor: "cur" }).mockResolvedValue({ items: [msg(1)], nextCursor: null });
        view();
        const log = await screen.findByRole("log");
        await screen.findByText("body 2");
        expect(screen.queryByRole("button", { name: /load earlier/i })).toBeNull();
        await waitFor(() => expect(liveObserver()).toBeTruthy());
        const sentinel = log.firstElementChild;
        expect(sentinel.getAttribute("aria-hidden")).toBe("true");
        expect(liveObserver().nodes).toContain(sentinel);
        expect(liveObserver().options.root).toBe(log);
        await intersect();
        await screen.findByText("body 1");
        expect(getMessages).toHaveBeenCalledTimes(2);
        expect(getMessages.mock.calls[1][0].before).toBe("cur");
    });

    it("does not load again while a page is fetching, nor when hasNextPage is false", async () => {
        const second = deferred();
        getMessages.mockResolvedValueOnce({ items: [msg(2)], nextCursor: "cur" }).mockReturnValueOnce(second.promise);
        view();
        await screen.findByText("body 2");
        await waitFor(() => expect(liveObserver()).toBeTruthy());
        await intersect();
        await screen.findByRole("status", SPINNER);
        await intersect();
        await intersect();
        expect(getMessages).toHaveBeenCalledTimes(2);
        await act(async () => second.resolve({ items: [msg(1)], nextCursor: null }));
        await screen.findByText("body 1");
        // Last page: nothing observes any more, so nothing can load.
        await waitFor(() => expect(observers.some((o) => o.live)).toBe(false));
        expect(getMessages).toHaveBeenCalledTimes(2);
    });

    it("keeps the reading position: scrollTop after the page arrives = new scrollHeight - saved distance from the end", async () => {
        const second = deferred();
        getMessages.mockResolvedValueOnce({ items: [msg(2)], nextCursor: "cur" }).mockReturnValueOnce(second.promise);
        view();
        const log = await screen.findByRole("log");
        await screen.findByText("body 2");
        let height = 1000;
        Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => height });
        log.scrollTop = 0;   // reader is at the top, 1000px from the end
        await waitFor(() => expect(liveObserver()).toBeTruthy());
        await intersect();
        height = 1600;       // the older page adds 600px above
        await act(async () => second.resolve({ items: [msg(1)], nextCursor: null }));
        await screen.findByText("body 1");
        expect(log.scrollTop).toBe(600);
    });

    it("shows a spinner at the top while fetching, with aria-label \"Loading earlier messages\"", async () => {
        const second = deferred();
        getMessages.mockResolvedValueOnce({ items: [msg(2)], nextCursor: "cur" }).mockReturnValueOnce(second.promise);
        view();
        const log = await screen.findByRole("log");
        await screen.findByText("body 2");
        expect(screen.queryByRole("status", SPINNER)).toBeNull();
        await waitFor(() => expect(liveObserver()).toBeTruthy());
        await intersect();
        const spinner = await screen.findByRole("status", SPINNER);
        expect(log.contains(spinner)).toBe(true);
        await act(async () => second.resolve({ items: [msg(1)], nextCursor: null }));
        await waitFor(() => expect(screen.queryByRole("status", SPINNER)).toBeNull());
    });
});
