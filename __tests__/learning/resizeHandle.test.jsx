// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import ResizeHandle from "@/components/learning/[id]/challenges/resizeHandle";

afterEach(cleanup);

describe("ResizeHandle", () => {
    it("grows and shrinks a height with the arrow keys, within the limits", () => {
        const onChange = vi.fn();
        render(<ResizeHandle axis="y" value={300} min={160} max={600} onChange={onChange} label="Resize" />);
        const handle = screen.getByRole("separator", { name: "Resize" });
        fireEvent.keyDown(handle, { key: "ArrowDown" });
        fireEvent.keyDown(handle, { key: "ArrowUp" });
        fireEvent.keyDown(handle, { key: "End" });
        expect(onChange.mock.calls.map((c) => c[0])).toEqual([324, 276, 600]);
        expect(handle.getAttribute("aria-valuenow")).toBe("300");
    });

    it("follows a pointer drag, inverted for a panel on the right", () => {
        const onChange = vi.fn();
        render(<ResizeHandle axis="x" invert value={400} min={260} max={720} onChange={onChange} label="Width" />);
        const handle = screen.getByRole("separator", { name: "Width" });
        fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
        fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 });
        fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
        fireEvent.pointerUp(handle, { pointerId: 1 });
        fireEvent.pointerMove(handle, { clientX: 100, pointerId: 1 });
        expect(onChange.mock.calls.map((c) => c[0])).toEqual([450, 720]);
    });
});
