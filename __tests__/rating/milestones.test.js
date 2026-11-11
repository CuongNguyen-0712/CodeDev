import { describe, expect, it } from "vitest";
import { milestoneFor, nextMilestone, openMilestone } from "@/lib/ratingRules";

describe("milestoneFor", () => {
    it.each([
        [0, 10, null], [1, 10, null], [2, 10, 20], [5, 10, 50], [9, 10, 50], [10, 10, 100],
        [1, 3, 20], [1, 2, 50], [0, 0, null], [3, 0, null],
    ])("%i of %i lessons -> %s", (completed, total, expected) => {
        expect(milestoneFor(completed, total)).toBe(expected);
    });
});

describe("openMilestone", () => {
    it.each([
        [20, [], 20], [50, [20], 50], [50, [50], null], [20, [50], null], [null, [], null], [100, [20, 50], 100],
    ])("reached %s, voted %j -> %s", (reached, voted, expected) => {
        expect(openMilestone(reached, voted)).toBe(expected);
    });
});

describe("nextMilestone", () => {
    it.each([
        [20, [20], 50], [40, [50], 100], [100, [100], null], [null, [], 20],
    ])("reached %s, voted %j -> %s", (reached, voted, expected) => {
        expect(nextMilestone(reached, voted)).toBe(expected);
    });
});
