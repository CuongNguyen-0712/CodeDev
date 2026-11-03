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
