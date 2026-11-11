// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Navbar Messages button + /messages inbox (spec section 9). */
let unread = { unread: 0, requests: 0 };
let inbox = { items: [], nextCursor: null };
const getInbox = vi.fn(async () => inbox);

vi.mock("@/clients/chat.client", () => ({
    chatClient: { getUnread: async () => unread, getInbox: (...a) => getInbox(...a) },
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "P1" } }, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/shadcn/tooltip", () => ({
    Tooltip: ({ children }) => <>{children}</>,
    TooltipTrigger: ({ children }) => <>{children}</>,
    TooltipContent: () => null,
}));

const { default: MessagesNavButton } = await import("@/components/chat/messagesNavButton");
const { default: Inbox } = await import("@/components/chat/inbox");

const row = (over = {}) => ({
    id: "cnv_a", kind: "direct", title: "Ada Lovelace", image: null, state: "accepted",
    lastMessage: { seq: "1", preview: "hello there", senderId: "u2", createdAt: "2026-11-11T10:00:00Z" },
    lastMessageAt: "2026-11-11T10:00:00Z", unread: false, ...over,
});

const renderWith = (ui) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
);

beforeEach(() => {
    unread = { unread: 0, requests: 0 };
    inbox = { items: [], nextCursor: null };
    getInbox.mockClear();
});
afterEach(cleanup);

describe("MessagesNavButton", () => {
    it("shows the unread count as a badge and names it", async () => {
        unread = { unread: 3, requests: 0 };
        renderWith(<MessagesNavButton />);
        const link = await screen.findByRole("link", { name: "Messages, 3 unread" });
        expect(link.getAttribute("href")).toBe("/messages");
        expect(link.textContent).toBe("3");
    });

    it("hides the badge at 0", async () => {
        renderWith(<MessagesNavButton />);
        const link = await screen.findByRole("link", { name: "Messages, 0 unread" });
        expect(link.textContent).toBe("");
    });

    it("caps the badge at 9+", async () => {
        unread = { unread: 12, requests: 0 };
        renderWith(<MessagesNavButton />);
        expect((await screen.findByRole("link", { name: "Messages, 12 unread" })).textContent).toBe("9+");
    });
});

describe("Inbox", () => {
    it("shows the Requests count only when above 0", async () => {
        unread = { unread: 0, requests: 2 };
        renderWith(<Inbox />);
        const tab = await screen.findByRole("tab", { name: /Requests\s*2/ });
        expect(tab).toBeTruthy();
    });

    it("marks an unread row with a dot and an unread name", async () => {
        inbox = { items: [row({ unread: true }), row({ id: "cnv_b", title: "Bob", unread: false })], nextCursor: null };
        renderWith(<Inbox />);
        const unreadRow = await screen.findByRole("link", { name: /Ada Lovelace.*Unread/ });
        expect(unreadRow.getAttribute("href")).toBe("/messages/cnv_a");
        expect(screen.getByRole("link", { name: /Bob/ }).textContent).not.toMatch(/Unread/);
    });

    it("filters loaded rows by name on the client", async () => {
        inbox = { items: [row(), row({ id: "cnv_b", title: "Bob" })], nextCursor: null };
        renderWith(<Inbox />);
        await screen.findByRole("link", { name: /Ada/ });
        fireEvent.change(screen.getByLabelText("Filter conversations"), { target: { value: "bo" } });
        expect(screen.queryByRole("link", { name: /Ada/ })).toBeNull();
        expect(screen.getByRole("link", { name: /Bob/ })).toBeTruthy();
        expect(getInbox).toHaveBeenCalledTimes(1);
    });

    it("shows an empty state and a Load more button when there is a next page", async () => {
        renderWith(<Inbox />);
        expect(await screen.findByText("No conversations yet")).toBeTruthy();
        cleanup();
        inbox = { items: [row()], nextCursor: "c2" };
        renderWith(<Inbox />);
        fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
        expect(getInbox).toHaveBeenLastCalledWith({ tab: "all", cursor: "c2" });
    });

    it("keeps Load more reachable when the filter matches nothing", async () => {
        inbox = { items: [row()], nextCursor: "c2" };
        renderWith(<Inbox />);
        await screen.findByRole("link", { name: /Ada/ });
        fireEvent.change(screen.getByLabelText("Filter conversations"), { target: { value: "zzz" } });
        expect(screen.getByText("No matching conversations")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Load more" }));
        expect(getInbox).toHaveBeenLastCalledWith({ tab: "all", cursor: "c2" });
    });

    it("marks the open conversation", async () => {
        inbox = { items: [row()], nextCursor: null };
        renderWith(<Inbox activeId="cnv_a" />);
        expect((await screen.findByRole("link", { name: /Ada/ })).getAttribute("aria-current")).toBe("page");
    });
});
