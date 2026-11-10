import { describe, expect, it } from "vitest";
import { currentMilestone, milestoneFor } from "@/lib/ratingRules";

describe("milestoneFor", () => {
    it.each([
        [0, 10, null], [1, 10, null], [2, 10, 20], [5, 10, 50], [9, 10, 50], [10, 10, 100],
        [1, 3, 20], [1, 2, 50], [0, 0, null], [3, 0, null],
    ])("%i of %i lessons -> %s", (completed, total, expected) => {
        expect(milestoneFor(completed, total)).toBe(expected);
    });
});

describe("currentMilestone", () => {
    it.each([
        [20, null, 20], [20, 50, 50], [null, null, null], [100, 50, 100], [null, 20, 20],
    ])("reached %s, highest rated %s -> %s", (reached, rated, expected) => {
        expect(currentMilestone(reached, rated)).toBe(expected);
    });
});
