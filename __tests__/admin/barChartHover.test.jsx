// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import BarChart from "@/components/admin/ui/barChart";

afterEach(cleanup);

const data = [
    { label: "2026-11-04", value: 3 },
    { label: "2026-11-05", value: 10 },
    { label: "2026-11-06", value: 0 },
];

describe("BarChart hover", () => {
    it("takes pointer events although globals.css turns them off on every svg", () => {
        render(<BarChart data={data} label="Submissions per day" unit="days" />);
        expect(screen.getByRole("img").getAttribute("class")).toContain("pointer-events-auto");
    });

    it("shows the date and value of the hovered column, with the period before, and hides it on leave", () => {
        const { container } = render(<BarChart data={data} compare={[1, 4, 2]} compareLabel="the 3 days before" label="Submissions per day" unit="days" formatLabel={(iso) => `day ${iso}`} />);
        const columns = container.querySelectorAll("svg[role=img] > g:not(:has(line))");
        fireEvent.mouseEnter(columns[1]);
        const tip = container.querySelector("[aria-live=polite]");
        expect(tip.textContent).toContain("day 2026-11-05");
        expect(tip.textContent).toContain("10");
        expect(tip.textContent).toContain("4 the 3 days before");

        fireEvent.mouseLeave(screen.getByRole("img"));
        expect(tip.textContent).toBe("");
    });

    it("moves the readout with the arrow keys, starting at the newest column", () => {
        const { container } = render(<BarChart data={data} label="Submissions per day" unit="days" />);
        fireEvent.keyDown(screen.getByRole("img"), { key: "ArrowLeft" });
        expect(container.querySelector("[aria-live=polite]").textContent).toContain("2026-11-06");
        fireEvent.keyDown(screen.getByRole("img"), { key: "ArrowLeft" });
        expect(container.querySelector("[aria-live=polite]").textContent).toContain("2026-11-05");
    });
});
