import { describe, expect, it } from "vitest";

import { niceTicks, pickLabels } from "@/components/admin/ui/barChart";

describe("pickLabels", () => {
    it("labels every bar when there is room (5 star rows)", () => {
        expect([...pickLabels(5, 600)].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it.each([
        [14, 300],
        [14, 900],
        [30, 600],
        [90, 600],
        [90, 280],
    ])("always labels the last of %i bars and keeps labels apart at %i px", (count, width) => {
        const picked = [...pickLabels(count, width)].sort((a, b) => a - b);
        expect(picked.at(-1)).toBe(count - 1);
        const slot = width / count;
        picked.slice(1).forEach((index, i) => expect((index - picked[i]) * slot).toBeGreaterThanOrEqual(52));
    });

    it("returns nothing for an empty series", () => {
        expect(pickLabels(0, 500).size).toBe(0);
    });
});

describe("niceTicks", () => {
    it("ends at or above the maximum with round steps", () => {
        expect(niceTicks(13)).toEqual([0, 5, 10, 15]);
        expect(niceTicks(0)).toEqual([0, 1]);
    });
});
