import { courseRatingDb } from "@/db/courseRating.db";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { ApiError } from "@/lib/error/apiError";

/**
 * Course ratings from learners (docs/admin-panel-plan.md 12): one 1-5 star rating per learner and
 * course, by enrolled learners with a completed lesson. The average is shown from MIN_RATINGS on.
 */
export const MIN_RATINGS = 3;
// Asked for when the third lesson of a course is completed for the first time, and at completion.
export const RATE_PROMPT_LESSON = 3;

const view = (state) => ({
    average: state.rating_count >= MIN_RATINGS ? state.rating_avg : null,
    count: state.rating_count,
    stars: state.stars ?? null,
    eligible: Boolean(state.eligible),
});

/**
 * Whether the lesson-completion result should ask for a rating: only on a first completion
 * (awardedPoints > 0, a resubmitted lesson earns nothing) of the third lesson or of the course.
 * The third lesson asks only learners who have not rated; completion also offers to update.
 * @returns {Promise<null | { stars: number|null }>}
 */
export async function ratePromptFor({ userId, courseId, result }) {
    if (!(Number(result?.awardedPoints) > 0)) return null;
    const milestone = result.courseCompleted ? "completed" : Number(result.completedLessons) === RATE_PROMPT_LESSON ? "lesson" : null;
    if (!milestone) return null;
    try {
        const state = await courseRatingDb.state({ userPublicId: userId, coursePublicId: courseId });
        if (!state?.eligible) return null;
        if (milestone === "lesson" && state.stars != null) return null;
        return { stars: state.stars ?? null };
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
        if (!state.eligible) {
            throw new ApiError("Complete a lesson of this course to rate it.", 403, { code: "RATING_NOT_ALLOWED" });
        }

        await courseRatingDb.upsert({ userDbId: state.user_id, courseDbId: state.course_id, stars: value });
        try {
            await redis.del(cacheKeys.courseDetailsPublic(courseId));
        } catch (error) {
            console.error("[rating] cache invalidation failed:", error?.message);
        }
        return view(await courseRatingDb.state({ userPublicId: userId, coursePublicId: courseId }));
    },
};
