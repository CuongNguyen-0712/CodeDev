/**
 * Course rating thresholds (docs/admin-panel-plan.md 12), shared by the server and the admin screens.
 * MIN_RATINGS is also written in the trigger of migration 20261103_013 (catalog.course.rating stays
 * NULL below it): change both together.
 */
export const MIN_RATINGS = 3;
// A course "needs a look" in the admin with at least this many ratings averaging below `below`.
export const LOW_RATING = { minRatings: 5, below: 3 };

// A learner rates at these percentages of the visible lessons completed (one rating each).
export const MILESTONES = [20, 50, 100];
export const MILESTONE_LABEL = { 20: "At 20%", 50: "At 50%", 100: "Finished" };

/** The highest milestone `completed` of `total` lessons reaches, or null below the first one. */
export function milestoneFor(completed, total) {
    if (!(total > 0)) return null;
    return [...MILESTONES].reverse().find((m) => completed * 100 >= m * total) ?? null;
}

/** The milestone a learner rates now: progress can drop when lessons are added, rated ones stay open. */
export function currentMilestone(reached, highestRated) {
    if (reached == null && highestRated == null) return null;
    return Math.max(reached ?? 0, highestRated ?? 0);
}

// Replaces `previous` (null when there was none) by `stars` in an average over `count` values.
function swap({ average, count }, previous, stars) {
    const nextCount = previous == null ? count + 1 : count;
    const nextAverage = average == null ? null : (average * count - (previous ?? 0) + stars) / nextCount;
    return { average: nextAverage, count: nextCount };
}

/**
 * The rating view after the viewer picks `stars` at their current milestone, for an optimistic
 * update. The public average holds the learner's latest stars (this milestone, else the last of
 * their history); the breakdown entry holds this milestone's. Averages are recomputed only when
 * the server sent one; below MIN_RATINGS they stay null and the server's answer fills them in.
 */
export function applyRating(state, stars) {
    if (!state) return state;
    const latest = state.stars ?? state.history?.at(-1)?.stars ?? null;
    const { average, count } = swap({ average: state.average ?? null, count: Number(state.count) || 0 }, latest, stars);

    const breakdown = [...(state.breakdown || [])];
    const index = breakdown.findIndex((entry) => entry.milestone === state.milestone);
    if (index === -1) {
        breakdown.push({ milestone: state.milestone, average: null, count: 1 });
    } else {
        const entry = breakdown[index];
        breakdown[index] = { ...entry, ...swap({ average: entry.average ?? null, count: Number(entry.count) || 0 }, state.stars ?? null, stars) };
    }

    return { ...state, stars, count, average, breakdown };
}
