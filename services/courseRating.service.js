import { courseRatingDb } from "@/db/courseRating.db";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { revalidateCoursePage } from "@/lib/pageCache";
import { ApiError } from "@/lib/error/apiError";
import { MIN_RATINGS, currentMilestone, milestoneFor } from "@/lib/ratingRules";

/**
 * Course ratings from learners (docs/superpowers/specs/2026-11-10-course-rating-section-design.md):
 * up to three 1-5 star ratings per learner and course, at 20%, 50% and 100% of the lessons. Only the
 * current milestone is open; the average counts each learner's latest one, shown from MIN_RATINGS on.
 */
export { MIN_RATINGS };

// The learner's open milestone (null below 20% or not enrolled) and their stars per milestone.
function progressOf(state) {
    const ratings = state.ratings || [];
    const highestRated = ratings.reduce((max, r) => Math.max(max, r.milestone), 0) || null;
    const milestone = state.user_id && state.enrolled
        ? currentMilestone(milestoneFor(state.completed, state.total), highestRated)
        : null;
    return { ratings, milestone };
}

const view = (state) => {
    const { ratings, milestone } = progressOf(state);
    const eligible = Boolean(milestone);
    return {
        average: state.rating_count >= MIN_RATINGS ? state.rating_avg : null,
        count: state.rating_count,
        breakdown: (state.breakdown || []).map((b) => ({ milestone: b.milestone, average: b.count >= MIN_RATINGS ? b.avg : null, count: b.count })),
        milestone,
        stars: ratings.find((r) => r.milestone === milestone)?.stars ?? null,
        // Ascending: the client's optimistic update reads the last entry as the learner's latest.
        history: eligible ? ratings.filter((r) => r.milestone < milestone).map((r) => ({ milestone: r.milestone, stars: r.stars })) : [],
        eligible,
        // Why the viewer cannot rate yet, so the page can say what to do next.
        reason: eligible ? null : !state.user_id ? "signin" : !state.enrolled ? "enroll" : "progress",
    };
};

/**
 * Whether the lesson-completion result should ask for a rating: only on a first completion
 * (awardedPoints > 0, a resubmitted lesson earns nothing) that opens a new milestone the learner
 * has not rated. `state` is read after the submit, so the lesson just done is one of `completed`.
 * @returns {Promise<null | { milestone: number, stars: null }>}
 */
export async function ratePromptFor({ userId, courseId, result }) {
    if (!(Number(result?.awardedPoints) > 0)) return null;
    try {
        const state = await courseRatingDb.state({ userPublicId: userId, coursePublicId: courseId });
        if (!state) return null;
        const after = milestoneFor(state.completed, state.total);
        const before = milestoneFor(state.completed - 1, state.total);
        const { ratings, milestone } = progressOf(state);
        if (!after || after === before || milestone !== after) return null;
        if (ratings.some((r) => r.milestone === after)) return null;
        return { milestone: after, stars: null };
    } catch (error) {
        // The prompt is optional: never fail a lesson completion over it.
        console.error("[rating] prompt check failed:", error?.message);
        return null;
    }
}

export const courseRatingService = {
    get: async ({ userId, courseId }) => {
        const state = await courseRatingDb.state({ userPublicId: userId || null, coursePublicId: courseId });
        if (!state) throw new ApiError("Course not found", 404);
        return view(state);
    },

    rate: async ({ userId, courseId, stars }) => {
        const value = Number(stars);
        if (!Number.isInteger(value) || value < 1 || value > 5) throw new ApiError("Choose 1 to 5 stars.", 400);

        const state = await courseRatingDb.state({ userPublicId: userId, coursePublicId: courseId });
        if (!state) throw new ApiError("Course not found", 404);
        const { milestone } = progressOf(state);
        if (!milestone) {
            throw new ApiError("Reach 20% of this course to rate it.", 403, { code: "RATING_NOT_ALLOWED" });
        }

        // The server picks the milestone: a locked one can never be written.
        await courseRatingDb.upsert({ userDbId: state.user_id, courseDbId: state.course_id, milestone, stars: value });
        revalidateCoursePage(courseId);
        try {
            await redis.del(cacheKeys.courseDetailsPublic(courseId));
        } catch (error) {
            console.error("[rating] cache invalidation failed:", error?.message);
        }
        return view(await courseRatingDb.state({ userPublicId: userId, coursePublicId: courseId }));
    },
};
