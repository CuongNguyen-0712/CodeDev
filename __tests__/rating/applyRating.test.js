import { describe, expect, it } from "vitest";
import { applyRating } from "@/lib/ratingRules";

const view = (over) => ({ average: null, count: 0, breakdown: [], milestone: 20, next: 50, history: [], eligible: true, reason: null, ...over });

describe("applyRating (one vote per milestone)", () => {
    it("casts a first vote: counted, averaged, and the milestone closes until the next", () => {
        const next = applyRating(view({ average: 4, count: 3, breakdown: [{ milestone: 20, average: 4, count: 3 }] }), 2);
        expect(next).toMatchObject({
            history: [{ milestone: 20, stars: 2 }], milestone: null, eligible: false, reason: "voted", next: 50,
            count: 4, average: 3.5,
        });
        expect(next.breakdown).toEqual([{ milestone: 20, average: 3.5, count: 4 }]);
    });

    it("replaces the learner's previous vote in the average at a new milestone", () => {
        const next = applyRating(view({ average: 4, count: 4, milestone: 50, next: 100, history: [{ milestone: 20, stars: 2 }] }), 4);
        expect(next).toMatchObject({ count: 4, average: 4.5, reason: "voted", next: 100 });
        expect(next.history).toEqual([{ milestone: 20, stars: 2 }, { milestone: 50, stars: 4 }]);
        expect(next.breakdown).toEqual([{ milestone: 50, average: null, count: 1 }]);
    });

    it("is done after the 100% vote", () => {
        const next = applyRating(view({ milestone: 100, next: null, history: [{ milestone: 50, stars: 3 }], count: 1 }), 5);
        expect(next).toMatchObject({ reason: "done", next: null, milestone: null, count: 1 });
    });

    it("keeps the average null below the threshold", () => {
        expect(applyRating(view({ count: 1 }), 5)).toMatchObject({ count: 2, average: null });
    });

    it("leaves a view with nothing open, and missing state, untouched", () => {
        const closed = view({ milestone: null, eligible: false, reason: "voted" });
        expect(applyRating(closed, 3)).toBe(closed);
        expect(applyRating(undefined, 3)).toBeUndefined();
    });
});
