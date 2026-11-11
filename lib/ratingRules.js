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

/**
 * The milestone open for a vote: the highest one reached, if it is above every milestone already
 * voted on. One vote each, so a voted milestone never reopens, also when progress drops.
 */
export function openMilestone(reached, voted) {
    if (reached == null) return null;
    return voted.every((m) => reached > m) ? reached : null;
}

/** The next milestone that will open, after what is reached and voted, or null after 100. */
export function nextMilestone(reached, voted) {
    const past = Math.max(reached ?? 0, ...voted);
    return MILESTONES.find((m) => m > past) ?? null;
}

// Replaces `previous` (null when there was none) by `stars` in an average over `count` values.
function swap({ average, count }, previous, stars) {
    const nextCount = previous == null ? count + 1 : count;
    const nextAverage = average == null ? null : (average * count - (previous ?? 0) + stars) / nextCount;
    return { average: nextAverage, count: nextCount };
}

/**
 * The rating view after the viewer votes `stars` at the open milestone, for an optimistic update:
 * the vote joins the history and the milestone closes until the next one. The public average holds
 * the learner's latest vote, so it replaces their previous one; the vote adds to its breakdown
 * entry. Averages are recomputed only when the server sent one; below MIN_RATINGS they stay null
 * and the server's answer fills them in. A view with nothing open is returned as it is.
 */
export function applyRating(state, stars) {
    if (!state?.milestone) return state;
    const { milestone } = state;
    const history = [...(state.history || []), { milestone, stars }];
    const { average, count } = swap({ average: state.average ?? null, count: Number(state.count) || 0 }, state.history?.at(-1)?.stars ?? null, stars);

    const breakdown = [...(state.breakdown || [])];
    const index = breakdown.findIndex((entry) => entry.milestone === milestone);
    if (index === -1) {
        breakdown.push({ milestone, average: null, count: 1 });
    } else {
        const entry = breakdown[index];
        breakdown[index] = { ...entry, ...swap({ average: entry.average ?? null, count: Number(entry.count) || 0 }, null, stars) };
    }

    const next = nextMilestone(milestone, history.map((vote) => vote.milestone));
    return { ...state, history, milestone: null, next, eligible: false, reason: next ? "voted" : "done", count, average, breakdown };
}
