// Course rating rules (docs/admin-panel-plan.md 12.3): who may rate, the 1-5 range, the average shown
// from 3 ratings, and when completing a lesson asks for a rating.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.fn();
const upsert = vi.fn();
// Vitest fails a test whenever a vi.fn implementation throws, even if the code catches it: the
// lookup failure is simulated here instead.
let lookupFails = false;
vi.mock("@/db/courseRating.db", () => ({
    courseRatingDb: {
        state: async (...args) => { if (lookupFails) throw new Error("db down"); return state(...args); },
        upsert: (...args) => upsert(...args),
    },
}));
vi.mock("@/lib/cache", () => ({ redis: { del: vi.fn(async () => 1) } }));

const { courseRatingService, ratePromptFor } = await import("@/services/courseRating.service");

const row = (over = {}) => ({ course_id: "7", user_id: "42", rating_avg: 4.33, rating_count: 3, stars: null, eligible: true, ...over });

describe("courseRatingService", () => {
    beforeEach(() => { state.mockReset(); upsert.mockReset(); });

    it("shows the average only from 3 ratings and the learner's own stars", async () => {
        state.mockResolvedValueOnce(row({ rating_count: 2, rating_avg: 5 }));
        expect(await courseRatingService.get({ userId: "u", courseId: "c" })).toEqual({ average: null, count: 2, stars: null, eligible: true });
        state.mockResolvedValueOnce(row({ stars: 4 }));
        expect(await courseRatingService.get({ userId: "u", courseId: "c" })).toEqual({ average: 4.33, count: 3, stars: 4, eligible: true });
    });

    it("refuses stars outside 1-5, unknown courses and learners without a completed lesson", async () => {
        for (const stars of [0, 6, 2.5, "x", null]) {
            await expect(courseRatingService.rate({ userId: "u", courseId: "c", stars })).rejects.toMatchObject({ status: 400 });
        }
        state.mockResolvedValueOnce(null);
        await expect(courseRatingService.rate({ userId: "u", courseId: "c", stars: 5 })).rejects.toMatchObject({ status: 404 });
        state.mockResolvedValueOnce(row({ eligible: false }));
        await expect(courseRatingService.rate({ userId: "u", courseId: "c", stars: 5 })).rejects.toMatchObject({ status: 403, errorCode: "RATING_NOT_ALLOWED" });
        expect(upsert).not.toHaveBeenCalled();
    });

    it("saves one rating per learner and returns the new state", async () => {
        state.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ stars: 5, rating_count: 4, rating_avg: 4.5 }));
        expect(await courseRatingService.rate({ userId: "u", courseId: "c", stars: 5 })).toEqual({ average: 4.5, count: 4, stars: 5, eligible: true });
        expect(upsert).toHaveBeenCalledWith({ userDbId: "42", courseDbId: "7", stars: 5 });
    });
});

describe("ratePromptFor", () => {
    beforeEach(() => state.mockReset());
    const ask = (result) => ratePromptFor({ userId: "u", courseId: "c", result });

    it("asks on the first completion of the third lesson, only if not rated yet", async () => {
        state.mockResolvedValue(row());
        expect(await ask({ awardedPoints: 10, completedLessons: 3, courseCompleted: false })).toEqual({ stars: null });
        state.mockResolvedValue(row({ stars: 4 }));
        expect(await ask({ awardedPoints: 10, completedLessons: 3, courseCompleted: false })).toBeNull();
    });

    it("asks at course completion, offering to update an existing rating", async () => {
        state.mockResolvedValue(row({ stars: 4 }));
        expect(await ask({ awardedPoints: 10, completedLessons: 12, courseCompleted: true })).toEqual({ stars: 4 });
    });

    it("never asks on a resubmitted lesson, other lessons or ineligible learners", async () => {
        state.mockResolvedValue(row());
        expect(await ask({ awardedPoints: 0, completedLessons: 3, courseCompleted: true })).toBeNull();
        expect(await ask({ awardedPoints: 10, completedLessons: 2, courseCompleted: false })).toBeNull();
        state.mockResolvedValue(row({ eligible: false }));
        expect(await ask({ awardedPoints: 10, completedLessons: 3, courseCompleted: false })).toBeNull();
    });

    it("never fails a lesson completion when the rating lookup fails", async () => {
        lookupFails = true;
        try {
            expect(await ask({ awardedPoints: 10, completedLessons: 3, courseCompleted: false })).toBeNull();
        } finally {
            lookupFails = false;
        }
    });
});
