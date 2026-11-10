import { describe, expect, it } from "vitest";
import { applyRating } from "@/lib/ratingRules";

const view = (over) => ({ average: null, count: 0, milestone: 20, stars: null, history: [], breakdown: [], eligible: true, reason: null, ...over });

describe("applyRating", () => {
    it("adds a learner's first rating to the count, the average and its milestone", () => {
        const next = applyRating(view({ average: 4, count: 3, breakdown: [{ milestone: 20, average: 4, count: 3 }] }), 2);
        expect(next).toMatchObject({ stars: 2, count: 4, average: 3.5, eligible: true });
        expect(next.breakdown).toEqual([{ milestone: 20, average: 3.5, count: 4 }]);
    });

    it("replaces the learner's earlier milestone in the average at a new milestone", () => {
        const next = applyRating(view({ average: 4, count: 4, milestone: 50, history: [{ milestone: 20, stars: 2 }] }), 4);
        expect(next).toMatchObject({ stars: 4, count: 4, average: 4.5 });
        expect(next.breakdown).toEqual([{ milestone: 50, average: null, count: 1 }]);
    });

    it("changes the current milestone's stars without changing the count", () => {
        const next = applyRating(view({ average: 4, count: 4, stars: 5, breakdown: [{ milestone: 20, average: 4, count: 4 }] }), 1);
        expect(next).toMatchObject({ stars: 1, count: 4, average: 3 });
        expect(next.breakdown).toEqual([{ milestone: 20, average: 3, count: 4 }]);
    });

    it("keeps the average null below the threshold", () => {
        expect(applyRating(view({ count: 1, history: [] }), 5)).toMatchObject({ stars: 5, count: 2, average: null });
    });

    it("returns missing state untouched", () => {
        expect(applyRating(undefined, 3)).toBeUndefined();
    });
});
