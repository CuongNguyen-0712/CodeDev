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

/** Per-course override from a catalog.course row (recommended_min_level / recommended_max_level, nullable). */
export const levelOverride = (course) => ({
    min: course?.recommended_min_level ?? undefined,
    max: course?.recommended_max_level ?? undefined,
});

/** { min, max } for a course level, with either bound replaced by `override` when set. */
export function recommendedLevel(courseLevel, override = null) {
    const base = RECOMMENDED_LEVELS[courseLevel];
    const min = Number(override?.min ?? base?.min);
    const max = Number(override?.max ?? base?.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    // A lone override bound may cross the level's other bound: keep the range non-empty.
    return { min, max: Math.max(min, max) };
}

/**
 * 'review' (learner is above the range), 'suitable', 'challenge' (1–2 levels below the range) or
 * 'too_early'. null when the course has no difficulty.
 */
export function courseFit(userLevel, courseLevel, override = null) {
    const range = recommendedLevel(courseLevel, override);
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
