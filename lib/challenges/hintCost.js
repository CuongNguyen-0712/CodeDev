/**
 * Points it costs to open hint 3 (a worked example) before the first pass: half of what the
 * challenge pays when passed, at least 5. The server charges it (challengeDb.openHint) and the
 * lesson shows the same number on the button.
 */
export const HINT_3_MIN_COST = 5;

export function hintCost(challengePoints) {
    const points = Number(challengePoints) || 0;
    return Math.max(HINT_3_MIN_COST, Math.ceil(points / 2));
}
