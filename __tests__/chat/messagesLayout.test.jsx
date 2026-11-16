// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/** The /messages frame sizes itself against the page scroller, not the viewport (final review, Important 2). */
vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => "cnv_a" }));
vi.mock("@/components/chat/inbox", () => ({ default: () => <div data-testid="inbox" /> }));

const { default: MessagesLayout } = await import("@/app/(shell)/messages/layout");

afterEach(cleanup);

describe("MessagesLayout height", () => {
    it("fills the page scroller below the navbar and banner instead of subtracting a fixed offset from the viewport", () => {
        const { container } = render(<MessagesLayout><div data-testid="pane" /></MessagesLayout>);
        const frame = container.firstElementChild;
        const grid = frame.querySelector(".grid");
        // At least as tall as #container (whatever sits above it); overrides the shell's min-h-dvh for page roots.
        expect(frame.classList.contains("min-h-full!")).toBe(true);
        expect(frame.classList.contains("flex-col")).toBe(true);
        // The grid takes the rest after the padding, never under 24rem.
        ["grow", "basis-0", "min-h-96"].forEach((c) => expect(grid.classList.contains(c)).toBe(true));
        // No viewport arithmetic anywhere in the frame: the banner's height can never be left out of it.
        expect(container.innerHTML).not.toMatch(/dvh|svh|calc\(/);
    });
});
