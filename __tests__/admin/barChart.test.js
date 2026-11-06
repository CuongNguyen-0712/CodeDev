import { describe, expect, it } from "vitest";

import { niceTicks, pickLabels } from "@/components/admin/ui/barChart";

describe("pickLabels", () => {
    it("labels every bar, centred, when each has room (7 days)", () => {
        const labels = pickLabels(7, 600);
        expect([...labels.keys()]).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(new Set(labels.values())).toEqual(new Set(["middle"]));
    });

    it.each([[14, 300], [30, 600], [90, 900]])("labels only the first and last of %i bars at %i px, flush with the edges", (count, width) => {
        expect([...pickLabels(count, width)]).toEqual([[0, "start"], [count - 1, "end"]]);
    });

    it("handles one bar and an empty series", () => {
        expect([...pickLabels(1, 20)]).toEqual([[0, "middle"]]);
        expect(pickLabels(0, 500).size).toBe(0);
    });
});

describe("niceTicks", () => {
    it("uses whole steps that end at or above the maximum", () => {
        expect(niceTicks(13)).toEqual([0, 5, 10, 15]);
        expect(niceTicks(10)).toEqual([0, 5, 10]);
        expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
        expect(niceTicks(1)).toEqual([0, 1]);
        expect(niceTicks(0)).toEqual([0, 1]);
    });
});
