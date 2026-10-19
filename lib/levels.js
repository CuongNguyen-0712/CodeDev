/**
 * Recommended User Level per course difficulty (catalog.course.level) and how well a course fits a
 * learner's level (docs/experience-leveling-design.md §6). Suggestion only: access to a course is
 * decided by entitlements and prerequisites, never by level.
 */
export const RECOMMENDED_LEVELS = {
    beginner: { min: 1, max: 5 },
    intermediate: { min: 4, max: 9 },
    advanced: { min: 8, max: 14 },
    expert: { min: 13, max: 20 },
    master: { min: 13, max: 20 },
};

export const recommendedLevel = (courseLevel) => RECOMMENDED_LEVELS[courseLevel] || null;

/**
 * 'review' (learner is above the range), 'suitable', 'challenge' (1–2 levels below the range) or
 * 'too_early'. null when the course has no difficulty.
 */
export function courseFit(userLevel, courseLevel) {
    const range = recommendedLevel(courseLevel);
    const level = Number(userLevel);
    if (!range || !Number.isFinite(level)) return null;
    if (level > range.max) return "review";
    if (level >= range.min) return "suitable";
    if (level >= range.min - 2) return "challenge";
    return "too_early";
}

export const FIT_LABELS = {
    suitable: "Suits your level",
    challenge: "A bit of a stretch",
    review: "Review for you",
    too_early: "Too early for now",
};
