import { courseRatingDb } from "@/db/courseRating.db";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { revalidateCoursePage } from "@/lib/pageCache";
import { ApiError } from "@/lib/error/apiError";
import { MIN_RATINGS, milestoneFor, nextMilestone, openMilestone } from "@/lib/ratingRules";

/**
 * Course ratings from learners (docs/superpowers/specs/2026-11-10-course-rating-section-design.md):
 * one vote (1-5 stars) per learner at each of 20%, 50% and 100% of the lessons. Only the highest
 * milestone reached opens, a vote is final, and the average counts each learner's latest vote,
 * shown from MIN_RATINGS on.
 */
export { MIN_RATINGS };

// The learner's votes, the milestone open for a vote (null when none) and the next one to open.
function progressOf(state) {
    const ratings = state.ratings || [];
    const voted = ratings.map((r) => r.milestone);
    const member = Boolean(state.user_id && state.enrolled);
    const reached = member ? milestoneFor(state.completed, state.total) : null;
    return {
        ratings,
        voted,
        milestone: member ? openMilestone(reached, voted) : null,
        next: member ? nextMilestone(reached, voted) : null,
    };
}

const view = (state) => {
    const { ratings, voted, milestone, next } = progressOf(state);
    const eligible = Boolean(milestone);
    const member = Boolean(state.user_id && state.enrolled);
    return {
        average: state.rating_count >= MIN_RATINGS ? state.rating_avg : null,
        count: state.rating_count,
        breakdown: (state.breakdown || []).map((b) => ({ milestone: b.milestone, average: b.count >= MIN_RATINGS ? b.avg : null, count: b.count })),
        milestone,
        next,
        // Every vote, ascending: the client's optimistic update reads the last entry as the latest.
        history: member ? ratings.map((r) => ({ milestone: r.milestone, stars: r.stars })) : [],
        eligible,
        // Why the viewer cannot vote now, so the page can say what to do next.
        reason: eligible ? null
            : !state.user_id ? "signin"
            : !state.enrolled ? "enroll"
            : voted.length === 0 ? "progress"
            : next ? "voted" : "done",
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
        const { milestone } = progressOf(state);
        if (!after || after === before || milestone !== after) return null;
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
        const { milestone, voted } = progressOf(state);
        if (!milestone) {
            // The milestone reached already has a vote (another tab, a second dialog): say so, not "nothing open".
            const reached = state.user_id && state.enrolled ? milestoneFor(state.completed, state.total) : null;
            if (reached && voted.includes(reached)) {
                throw new ApiError(`You already rated this course at ${reached}%.`, 409, { code: "RATING_CLOSED" });
            }
            throw new ApiError("No rating is open for this course right now.", 403, { code: "RATING_NOT_ALLOWED" });
        }

        // The server picks the milestone, and a vote is written once: a vote racing this one is refused.
        const inserted = await courseRatingDb.insertVote({ userDbId: state.user_id, courseDbId: state.course_id, milestone, stars: value });
        if (!inserted) {
            throw new ApiError(`You already rated this course at ${milestone}%.`, 409, { code: "RATING_CLOSED" });
        }
        revalidateCoursePage(courseId);
        try {
            await redis.del(cacheKeys.courseDetailsPublic(courseId));
        } catch (error) {
            console.error("[rating] cache invalidation failed:", error?.message);
        }
        return view(await courseRatingDb.state({ userPublicId: userId, coursePublicId: courseId }));
    },
};
