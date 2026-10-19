import { describe, expect, it } from "vitest";

import { courseFit, recommendedLevel } from "@/lib/levels";
import { normaliseProfile, scoreCourse } from "@/services/recommendation.service";

/** Recommended levels, course fit labels and the recommender's level signal: no database needed. */

describe("course fit by User Level", () => {
    it("labels the boundaries of the intermediate range (4-9)", () => {
        expect(recommendedLevel("intermediate")).toEqual({ min: 4, max: 9 });
        expect(courseFit(1, "intermediate")).toBe("too_early"); // min - 3
        expect(courseFit(2, "intermediate")).toBe("challenge"); // min - 2
        expect(courseFit(3, "intermediate")).toBe("challenge"); // min - 1
        expect(courseFit(4, "intermediate")).toBe("suitable");  // min
        expect(courseFit(9, "intermediate")).toBe("suitable");  // max
        expect(courseFit(10, "intermediate")).toBe("review");   // max + 1
    });

    it("has no opinion on courses without a difficulty", () => {
        expect(courseFit(5, null)).toBeNull();
        expect(recommendedLevel("unknown")).toBeNull();
    });
});

describe("recommender level signal", () => {
    const course = (level) => ({
        id: `c-${level}`, title: level, level, skills: [], role_codes: [], industry_codes: [],
        goal_codes: [], prerequisites: [], roadmaps: [],
    });
    const levelReason = (profile, level) =>
        scoreCourse(profile, course(level)).reasons.find((r) => /level|basic|advanced|step up/i.test(r.text));

    it("uses the onboarding level until the learner has EXP", () => {
        const fresh = normaliseProfile({ experience_level: "beginner", exp: 0, exp_level: 1 });
        expect(levelReason(fresh, "beginner").text).toBe("Matches your beginner level");
    });

    it("switches to the User Level once EXP exists", () => {
        // Self-declared beginner, but already level 8: intermediate suits, beginner is a review.
        const levelled = normaliseProfile({ experience_level: "beginner", exp: 2000, exp_level: 8 });
        expect(levelReason(levelled, "intermediate")).toMatchObject({ text: "Suits your level 8" });
        expect(levelReason(levelled, "beginner").points).toBeLessThan(0);
        expect(levelReason(levelled, "expert").points).toBeLessThan(0);
    });
});
