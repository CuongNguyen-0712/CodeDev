import { describe, expect, it } from "vitest";
import { applyRating } from "@/lib/ratingRules";

describe("applyRating", () => {
    it("adds a first rating to the count and the average", () => {
        const next = applyRating({ average: 4, count: 3, stars: null, eligible: true }, 2);
        expect(next).toMatchObject({ stars: 2, count: 4, average: 3.5, eligible: true });
    });

    it("changes an existing rating without changing the count", () => {
        const next = applyRating({ average: 4, count: 4, stars: 5 }, 1);
        expect(next).toMatchObject({ stars: 1, count: 4, average: 3 });
    });

    it("keeps the average null below the threshold", () => {
        const next = applyRating({ average: null, count: 1, stars: null }, 5);
        expect(next).toMatchObject({ stars: 5, count: 2, average: null });
    });

    it("returns missing state untouched", () => {
        expect(applyRating(undefined, 3)).toBeUndefined();
    });
});
