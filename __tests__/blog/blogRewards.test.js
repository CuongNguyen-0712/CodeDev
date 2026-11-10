import { describe, expect, it } from "vitest";
import { BLOG_LIKE_MILESTONES, milestoneAt } from "@/lib/blog/rewards.mjs";

describe("blog rewards", () => {
    it("milestoneAt matches only exact like counts", () => {
        expect(milestoneAt(9)).toBeNull();
        expect(milestoneAt(10)).toEqual({ likes: 10, points: 10 });
        expect(milestoneAt(11)).toBeNull();
        expect(milestoneAt(50)).toEqual({ likes: 50, points: 30 });
        expect(milestoneAt(100)).toEqual({ likes: 100, points: 60 });
        expect(milestoneAt(150)).toBeNull();
    });

    it("milestone points total 100", () => {
        expect(BLOG_LIKE_MILESTONES.reduce((s, m) => s + m.points, 0)).toBe(100);
    });
});
