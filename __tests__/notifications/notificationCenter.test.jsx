// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The navbar bell with its real query and mutation hooks; only the session and the client are
 * replaced. The badge is numeric, capped at 9+, and absent at zero.
 */
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { id: "u1" } } }) }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/home",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const getNotifications = vi.fn();
vi.mock("@/actions/user.actions", () => ({ markNotificationsAction: vi.fn(async () => ({ success: true, data: { updated: 0 } })) }));
vi.mock("@/clients/user.client", () => ({
    userClient: { getNotifications: (params) => getNotifications(params) },
}));

const { default: NotificationCenter, NotificationItem } = await import("@/components/ui/notificationCenter");
const { TooltipProvider } = await import("@/components/shadcn/tooltip");

beforeAll(() => {
    window.matchMedia ??= () => ({ matches: false, addEventListener() { }, removeEventListener() { } });
    window.ResizeObserver ??= class { observe() { } unobserve() { } disconnect() { } };
});
afterEach(() => { cleanup(); getNotifications.mockReset(); });

function renderBell(unreadCount) {
    getNotifications.mockResolvedValue({ items: [], hasMore: false, nextCursor: null, unreadCount });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}><TooltipProvider><NotificationCenter /></TooltipProvider></QueryClientProvider>
    );
}

describe("NotificationCenter badge", () => {
    it("shows the unread count", async () => {
        renderBell(3);
        expect(await screen.findByLabelText("Notifications (3 unread)")).toBeTruthy();
        expect(screen.getByText("3")).toBeTruthy();
    });

    it("caps at 9+", async () => {
        renderBell(12);
        expect(await screen.findByLabelText("Notifications (12 unread)")).toBeTruthy();
        expect(screen.getByText("9+")).toBeTruthy();
    });

    it("announces a rise in the unread count to screen readers", async () => {
        renderBell(2);
        expect(await screen.findByLabelText("Notifications (2 unread)")).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("");
    });

    it("shows no badge at zero", async () => {
        renderBell(0);
        expect(await screen.findByLabelText("Notifications (0 unread)")).toBeTruthy();
        expect(screen.queryByText("0")).toBeNull();
    });

    it("keeps the badge at the 11px floor", async () => {
        renderBell(4);
        await screen.findByLabelText("Notifications (4 unread)");
        expect(screen.getByText("4").className).toContain("text-[11px]");
    });
});

describe("NotificationItem", () => {
    const item = { id: "n1", kind: "announcement", title: "Maintenance", message: "Down at 22:00", link: "/help", read: false, createdAt: new Date().toISOString() };

    it("labels team messages and offers a remove button beside the link", () => {
        const onDismiss = vi.fn();
        render(<NotificationItem item={item} onDismiss={onDismiss} />);
        expect(screen.getByText(/CodeDev team/)).toBeTruthy();
        const remove = screen.getByRole("button", { name: "Remove notification: Maintenance" });
        expect(remove.closest("a")).toBeNull();
        remove.click();
        expect(onDismiss).toHaveBeenCalledWith(item);
        expect(screen.getByRole("link").getAttribute("href")).toBe("/help");
    });

    it("tells unread from read by ink and the dot, not by a tint", () => {
        const { rerender } = render(<NotificationItem item={item} />);
        expect(screen.getByText("Down at 22:00").className).toContain("text-foreground");
        expect(screen.getByText("Unread")).toBeTruthy();
        rerender(<NotificationItem item={{ ...item, read: true }} />);
        expect(screen.getByText("Down at 22:00").className).toContain("text-muted-foreground");
        expect(screen.queryByText("Unread")).toBeNull();
    });

    it("is not a link in the composer preview", () => {
        render(<NotificationItem item={{ ...item, kind: "level_up" }} preview />);
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByText(/CodeDev team/)).toBeNull();
    });
});
