// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The admin composer with its real hooks: the direct-message preset, the live recipient count,
 * inline errors before anything is sent, and the confirm step that sends what the form shows.
 */
const push = vi.fn();
let search = "user=alice";
vi.mock("next/navigation", () => ({
    usePathname: () => "/admin/announcements/new",
    useSearchParams: () => new URLSearchParams(search),
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
const showAlert = vi.fn();
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert }) }));

const previewAnnouncement = vi.fn(async () => ({ recipients: 1 }));
const createAnnouncement = vi.fn(async (input) => ({ id: "a1", status: "sent", ...input }));
vi.mock("@/clients/premium.client", () => ({
    adminClient: { previewAnnouncement: (a) => previewAnnouncement(a), createAnnouncement: (i) => createAnnouncement(i) },
}));

const { default: AnnouncementComposer } = await import("@/components/admin/announcements/announcementComposer");
const { TooltipProvider } = await import("@/components/shadcn/tooltip");

beforeAll(() => {
    window.matchMedia ??= () => ({ matches: false, addEventListener() { }, removeEventListener() { } });
    window.ResizeObserver ??= class { observe() { } unobserve() { } disconnect() { } };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); search = "user=alice"; });

const renderComposer = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><TooltipProvider><AnnouncementComposer /></TooltipProvider></QueryClientProvider>);
};

describe("AnnouncementComposer", () => {
    it("opens as a direct message and counts the recipient", async () => {
        renderComposer();
        expect(screen.getByRole("heading", { name: "Message a user" })).toBeTruthy();
        expect(screen.getByLabelText("Usernames").value).toBe("alice");
        expect(await screen.findByText("1 active learner will receive it.", {}, { timeout: 2000 })).toBeTruthy();
        expect(previewAnnouncement).toHaveBeenCalledWith({ type: "users", userIds: ["alice"] });
    });

    it("shows what is missing and sends nothing", async () => {
        renderComposer();
        fireEvent.change(screen.getByLabelText("Link (optional)"), { target: { value: "https://evil.example" } });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        expect(await screen.findByText("Give a title of at least 3 characters.")).toBeTruthy();
        expect(screen.getByText("Write the message.")).toBeTruthy();
        expect(screen.getByText("Use a path on this site, like /course/abc.")).toBeTruthy();
        expect(createAnnouncement).not.toHaveBeenCalled();
    });

    it("confirms, then sends exactly the form", async () => {
        renderComposer();
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Your refund" } });
        fireEvent.change(screen.getByLabelText("Message"), { target: { value: "We refunded your order." } });
        fireEvent.change(screen.getByLabelText("Link (optional)"), { target: { value: "/orders" } });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));

        expect(await screen.findByText("Send this announcement?")).toBeTruthy();
        // The dialog's own Send button comes after the form's.
        fireEvent.click(screen.getAllByRole("button", { name: "Send" }).at(-1));

        await waitFor(() => expect(createAnnouncement).toHaveBeenCalledWith({
            title: "Your refund", body: "We refunded your order.", link: "/orders",
            audience: { type: "users", userIds: ["alice"] }, sendAt: null,
        }));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/announcements"));
    });
});
