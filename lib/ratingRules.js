/**
 * Course rating thresholds (docs/admin-panel-plan.md 12), shared by the server and the admin screens.
 * MIN_RATINGS is also written in the trigger of migration 20261103_013 (catalog.course.rating stays
 * NULL below it): change both together.
 */
export const MIN_RATINGS = 3;
// Learners are asked to rate on the first completion of this lesson number, and when they finish the course.
export const RATE_PROMPT_LESSON = 3;
// A course "needs a look" in the admin with at least this many ratings averaging below `below`.
export const LOW_RATING = { minRatings: 5, below: 3 };

/**
 * The rating state ({ average, count, stars }) after the viewer picks `stars`, for an optimistic
 * update. The average is recomputed only when the server sent one; below MIN_RATINGS it stays null
 * and the server's answer fills it in. A hidden own rating is not in the average: the answer corrects it.
 */
export function applyRating(state, stars) {
    if (!state) return state;
    const previous = state.stars ?? null;
    const oldCount = Number(state.count) || 0;
    const count = previous == null ? oldCount + 1 : oldCount;
    let average = state.average ?? null;
    if (average != null && count > 0) {
        average = (average * oldCount - (previous ?? 0) + stars) / count;
    }
    return { ...state, stars, count, average };
}
