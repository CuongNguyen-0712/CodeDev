// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/navbar", () => ({ default: () => null }));
vi.mock("@/components/ui/dashboard", () => ({ default: () => null }));
vi.mock("@/components/auth/verifyEmailBanner", () => ({ default: () => null }));
vi.mock("@/components/auth/signedIn", () => ({ SignedIn: () => null }));
vi.mock("@/components/shadcn/sidebar", () => ({
    SidebarProvider: ({ children, className }) => <div data-testid="shell" className={className}>{children}</div>,
    SidebarInset: ({ children }) => <div>{children}</div>,
}));
vi.mock("@/stores/uiStore", () => ({ useUiStore: (sel) => sel({ isSidebarOpen: true, setSidebarOpen: () => {} }) }));

const { useVisualViewportHeight } = await import("@/hooks/useVisualViewportHeight");
const { CHAT_GRID_HEIGHT } = await import("@/components/chat/chatHeight");
const { default: HomeLayout } = await import("@/components/layouts/homeLayout");

function Probe() {
    useVisualViewportHeight();
    return null;
}

afterEach(() => {
    cleanup();
    delete window.visualViewport;
    document.documentElement.style.removeProperty("--app-height");
});

describe("useVisualViewportHeight", () => {
    it("sets --app-height from visualViewport on resize, and removes it on unmount", () => {
        const vv = new EventTarget();
        vv.height = 500.4;
        vv.scale = 1;
        vv.offsetTop = 0;
        window.visualViewport = vv;
        window.scrollTo = vi.fn();
        const { unmount } = render(<Probe />);
        vv.dispatchEvent(new Event("resize"));
        expect(document.documentElement.style.getPropertyValue("--app-height")).toBe("500px");
        vv.offsetTop = 40;
        vv.dispatchEvent(new Event("scroll"));
        expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
        unmount();
        expect(document.documentElement.style.getPropertyValue("--app-height")).toBe("");
        window.scrollTo.mockClear();
        vv.dispatchEvent(new Event("scroll"));
        expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it("scales the visual height by the pinch-zoom scale", () => {
        const vv = new EventTarget();
        Object.assign(vv, { height: 300, scale: 2, offsetTop: 0 });
        window.visualViewport = vv;
        render(<Probe />);
        vv.dispatchEvent(new Event("resize"));
        expect(document.documentElement.style.getPropertyValue("--app-height")).toBe("600px");
    });

    it("no visualViewport: no error, no property", () => {
        expect(() => render(<Probe />)).not.toThrow();
        expect(document.documentElement.style.getPropertyValue("--app-height")).toBe("");
    });
});

describe("HomeLayout", () => {
    const footer = <footer data-testid="footer" />;
    it("the footer is not rendered on /messages and /messages/[id], and is rendered on /", () => {
        for (const [path, shown] of [["/messages", false], ["/messages/cnv_a", false], ["/", true]]) {
            pathname = path;
            const { unmount } = render(<HomeLayout footer={footer}><div /></HomeLayout>);
            expect(!!screen.queryByTestId("footer")).toBe(shown);
            unmount();
        }
    });

    it("the shell height reads var(--app-height,100dvh)", () => {
        pathname = "/";
        render(<HomeLayout footer={footer}><div /></HomeLayout>);
        expect(screen.getByTestId("shell").className).toContain("h-[var(--app-height,100dvh)]");
        expect(screen.getByTestId("shell").className).not.toContain("h-dvh");
    });
});

describe("CHAT_GRID_HEIGHT", () => {
    it("the min-height floor is desktop-only", () => {
        const classes = CHAT_GRID_HEIGHT.split(" ");
        expect(classes).not.toContain("min-h-96");
        expect(classes).toContain("md:min-h-96");
    });
});
