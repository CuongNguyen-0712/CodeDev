import { describe, expect, it } from "vitest";

import { HINT_3_MIN_COST, hintCost } from "@/lib/challenges/hintCost";

describe("hintCost", () => {
    it("is half the challenge points, rounded up", () => {
        expect(hintCost(20)).toBe(10);
        expect(hintCost(25)).toBe(13);
    });

    it("never drops below the minimum, also for missing or zero points", () => {
        expect(hintCost(4)).toBe(HINT_3_MIN_COST);
        expect(hintCost(0)).toBe(HINT_3_MIN_COST);
        expect(hintCost(undefined)).toBe(HINT_3_MIN_COST);
    });
});
