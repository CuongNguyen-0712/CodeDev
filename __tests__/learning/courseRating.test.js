// Course rating rules (docs/superpowers/specs/2026-11-10-course-rating-section-design.md): ratings at
// 20%, 50% and 100% of the lessons, the server picks the milestone, the average shown from 3 ratings,
// and when completing a lesson asks for a rating.
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

const row = (over = {}) => ({
    course_id: "7", user_id: "42", rating_avg: 4.33, rating_count: 3,
    enrolled: true, completed: 2, total: 10, ratings: [], breakdown: [], ...over,
});
const get = () => courseRatingService.get({ userId: "u", courseId: "c" });

describe("courseRatingService.get", () => {
    beforeEach(() => state.mockReset());

    it("shows the learner's current milestone, their locked history and the breakdown", async () => {
        state.mockResolvedValueOnce(row({
            completed: 6, ratings: [{ milestone: 20, stars: 4, is_hidden: false }],
            breakdown: [{ milestone: 20, avg: 4.5, count: 3 }, { milestone: 50, avg: 3, count: 2 }],
        }));
        expect(await get()).toEqual({
            average: 4.33, count: 3,
            breakdown: [{ milestone: 20, average: 4.5, count: 3 }, { milestone: 50, average: null, count: 2 }],
            milestone: 50, stars: null, history: [{ milestone: 20, stars: 4 }],
            eligible: true, reason: null,
        });
    });

    it("hides the average below 3 ratings", async () => {
        state.mockResolvedValueOnce(row({ rating_count: 2, rating_avg: 5 }));
        expect(await get()).toMatchObject({ average: null, count: 2 });
    });

    it("says why a viewer cannot rate yet", async () => {
        const reason = async (over) => {
            state.mockResolvedValueOnce(row(over));
            return (await get()).reason;
        };
        expect(await reason({ user_id: null, enrolled: false, completed: 0 })).toBe("signin");
        expect(await reason({ enrolled: false })).toBe("enroll");
        expect(await reason({ completed: 1 })).toBe("progress");
        expect(await reason({ completed: 0, total: 0 })).toBe("progress");
    });

    it("keeps the milestone already rated when progress dropped", async () => {
        state.mockResolvedValueOnce(row({ completed: 4, ratings: [{ milestone: 50, stars: 3, is_hidden: false }] }));
        expect(await get()).toMatchObject({ milestone: 50, stars: 3, history: [], eligible: true });
    });

    it("answers 404 for an unknown course", async () => {
        state.mockResolvedValueOnce(null);
        await expect(get()).rejects.toMatchObject({ status: 404 });
    });
});

describe("courseRatingService.rate", () => {
    beforeEach(() => { state.mockReset(); upsert.mockReset(); });
    const rate = (stars) => courseRatingService.rate({ userId: "u", courseId: "c", stars });

    it("refuses stars outside 1-5, unknown courses and learners below 20%", async () => {
        for (const stars of [0, 6, 2.5, "x", null]) await expect(rate(stars)).rejects.toMatchObject({ status: 400 });
        state.mockResolvedValueOnce(null);
        await expect(rate(5)).rejects.toMatchObject({ status: 404 });
        state.mockResolvedValueOnce(row({ completed: 1 }));
        await expect(rate(5)).rejects.toMatchObject({ status: 403, errorCode: "RATING_NOT_ALLOWED" });
        state.mockResolvedValueOnce(row({ enrolled: false }));
        await expect(rate(5)).rejects.toMatchObject({ status: 403, errorCode: "RATING_NOT_ALLOWED" });
        expect(upsert).not.toHaveBeenCalled();
    });

    it("saves at the milestone the server picks and returns the new view", async () => {
        state.mockResolvedValueOnce(row({ completed: 6 }))
            .mockResolvedValueOnce(row({ completed: 6, ratings: [{ milestone: 50, stars: 5, is_hidden: false }], rating_count: 4, rating_avg: 4.5 }));
        expect(await rate(5)).toMatchObject({ average: 4.5, count: 4, milestone: 50, stars: 5 });
        expect(upsert).toHaveBeenCalledWith({ userDbId: "42", courseDbId: "7", milestone: 50, stars: 5 });
    });

    it("updates the rated milestone, not an older one, when progress dropped", async () => {
        state.mockResolvedValue(row({ completed: 4, ratings: [{ milestone: 50, stars: 3, is_hidden: false }] }));
        await rate(4);
        expect(upsert).toHaveBeenCalledWith({ userDbId: "42", courseDbId: "7", milestone: 50, stars: 4 });
    });
});

describe("ratePromptFor", () => {
    beforeEach(() => state.mockReset());
    const ask = (result) => ratePromptFor({ userId: "u", courseId: "c", result });
    const first = { awardedPoints: 10 };

    it("asks when the lesson just completed opens a milestone", async () => {
        state.mockResolvedValue(row({ completed: 2 }));
        expect(await ask(first)).toEqual({ milestone: 20, stars: null });
    });

    it("asks for the milestone a small course jumps to", async () => {
        state.mockResolvedValue(row({ completed: 1, total: 2 }));
        expect(await ask(first)).toEqual({ milestone: 50, stars: null });
    });

    it("never asks without a crossing, when already rated, on a resubmitted lesson or for ineligible learners", async () => {
        state.mockResolvedValue(row({ completed: 3 }));
        expect(await ask(first)).toBeNull();
        state.mockResolvedValue(row({ completed: 5, ratings: [{ milestone: 50, stars: 4, is_hidden: false }] }));
        expect(await ask(first)).toBeNull();
        state.mockResolvedValue(row({ completed: 2 }));
        expect(await ask({ awardedPoints: 0 })).toBeNull();
        state.mockResolvedValue(row({ completed: 2, enrolled: false }));
        expect(await ask(first)).toBeNull();
    });

    it("never fails a lesson completion when the rating lookup fails", async () => {
        lookupFails = true;
        try {
            expect(await ask(first)).toBeNull();
        } finally {
            lookupFails = false;
        }
    });
});
