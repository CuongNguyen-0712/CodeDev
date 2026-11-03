import { onboardingDb } from "@/db/onboarding.db";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";
import { courseFit, levelOverride, recommendedLevel } from "@/lib/levels";

/**
 * Recommendation v1: transparent rules, every point of score comes with a human-readable reason.
 *
 * Signals: career role (and the skills it needs), industries, learning goals, experience level vs
 * course difficulty, prerequisites (completed or not), learning paths of the role, preferred
 * programming language, ownership. Price and access model are deliberately NOT signals: an
 * expensive course never ranks higher because of its price. Nothing here buys or redeems.
 *
 * Candidates are published, non-deleted courses (filtered in SQL). Completed courses and courses
 * the learner is already taking are excluded (they are not "new" recommendations).
 */

export const WEIGHTS = {
    role: 30,
    skillsMax: 25,
    industry: 8,
    industryMax: 15,
    goal: 10,
    goalMax: 20,
    levelFit: 15,
    levelStretch: 5,
    levelTooBasic: -10,
    levelTooHard: -20,
    prerequisiteDone: 5,
    prerequisiteMissing: -15,
    learningPath: 10,
    language: 8,
    owned: 5,
    // V1.3 §7.5, used once the learner has a User Level (EXP > 0).
    fitSuitable: 25,
    fitChallenge: 15,
    fitReview: 5,
    continuation: 30,
    sameTrack: 10,
    communityMax: 10,
};

const CONTINUATION_DAYS = 14;
// Below this many enrolments a completion rate says nothing about the course.
const MIN_ENROLMENTS_FOR_RATE = 5;

const COURSE_LEVEL_INDEX = { beginner: 0, intermediate: 1, advanced: 2, expert: 3, master: 4 };
// Where each experience level sits on the course difficulty scale.
const LEARNER_LEVEL_INDEX = { beginner: 0, junior: 0.5, intermediate: 1, advanced: 2.5 };

const IN_PROGRESS = new Set(["enrolled", "in_progress", "paused"]);

function levelSignal(experienceLevel, courseLevel) {
    const target = LEARNER_LEVEL_INDEX[experienceLevel];
    const course = COURSE_LEVEL_INDEX[courseLevel];
    if (target === undefined || course === undefined) return null;

    const diff = course - target;
    if (Math.abs(diff) <= 0.5) return { score: WEIGHTS.levelFit, reason: `Matches your ${experienceLevel} level` };
    if (diff > 0.5 && diff <= 1.5) return { score: WEIGHTS.levelStretch, reason: "A step up from your current level" };
    if (diff > 1.5) return { score: WEIGHTS.levelTooHard, reason: "May be too advanced for now" };
    return { score: WEIGHTS.levelTooBasic, reason: "May be too basic for you" };
}

// Once the learner has earned EXP, their User Level replaces the self-declared onboarding level
// and the V1.3 fit points apply (+25 / +15 / +5; too_early courses are not recommended at all).
const FIT_SIGNALS = {
    suitable: { score: WEIGHTS.fitSuitable, reason: (level) => `Suits your level ${level}` },
    challenge: { score: WEIGHTS.fitChallenge, reason: () => "A step up from your current level" },
    review: { score: WEIGHTS.fitReview, reason: () => "A review of what you know" },
    too_early: { score: WEIGHTS.levelTooHard, reason: () => "May be too advanced for now" },
};

function learnerFit(profile, course) {
    return profile.userExp > 0 ? courseFit(profile.userLevel, course.level, levelOverride(course)) : null;
}

function learnerLevelSignal(profile, course) {
    if (profile.userExp > 0) {
        const signal = FIT_SIGNALS[learnerFit(profile, course)];
        return signal ? { score: signal.score, reason: signal.reason(profile.userLevel) } : null;
    }
    return profile.experienceLevel ? levelSignal(profile.experienceLevel, course.level) : null;
}

function completedWithinDays(completedAt, days, now) {
    if (!completedAt) return false;
    const at = new Date(completedAt).getTime();
    return Number.isFinite(at) && now - at <= days * 24 * 60 * 60 * 1000;
}

function communitySignal(course) {
    const enrolments = Number(course.enrolments) || 0;
    if (enrolments < MIN_ENROLMENTS_FOR_RATE) return null;
    const rate = Math.min(1, Math.max(0, (Number(course.completions) || 0) / enrolments));
    const points = Math.round(rate * WEIGHTS.communityMax);
    return points > 0 ? { score: points, reason: `${Math.round(rate * 100)}% of learners who start it finish it` } : null;
}

function listNames(items, max = 3) {
    return items.slice(0, max).map((item) => item.name).join(", ");
}

/**
 * Scores one candidate. Returns `{ score, reasons[], signals }`; `signals` counts the personal
 * positive matches (ownership and missing prerequisites are not personal signals).
 */
export function scoreCourse(profile, course) {
    let score = 0;
    let signals = 0;
    const reasons = [];
    const add = (points, reason, personal = true) => {
        score += points;
        if (personal && points > 0) signals += 1;
        reasons.push({ points, text: reason });
    };

    if (profile.roleCode && course.role_codes?.includes(profile.roleCode)) {
        add(WEIGHTS.role, `Built for ${profile.roleName || "your role"}s`);
    }

    if (profile.roleSkills?.length && course.skills?.length) {
        const courseSkills = new Map(course.skills.map((s) => [s.code, s]));
        const matched = profile.roleSkills
            .filter((s) => courseSkills.has(s.code))
            .map((s) => ({ ...s, product: s.weight * courseSkills.get(s.code).weight }))
            .sort((a, b) => b.product - a.product);
        if (matched.length) {
            const points = Math.min(WEIGHTS.skillsMax, matched.reduce((sum, s) => sum + Math.round(s.product / 2), 0));
            add(points, `Teaches ${listNames(matched)}, skills ${profile.roleName || "your role"}s need`);
        }
    }

    if (profile.industryCodes?.length && course.industry_codes?.length) {
        const hits = course.industry_codes.filter((code) => profile.industryCodes.includes(code)).length;
        if (hits) add(Math.min(WEIGHTS.industryMax, hits * WEIGHTS.industry), "Relevant to your industry");
    }

    if (profile.goalCodes?.length && course.goal_codes?.length) {
        const hits = course.goal_codes.filter((code) => profile.goalCodes.includes(code)).length;
        if (hits) add(Math.min(WEIGHTS.goalMax, hits * WEIGHTS.goal), hits > 1 ? "Serves several of your goals" : "Serves one of your goals");
    }

    const level = learnerLevelSignal(profile, course);
    if (level) add(level.score, level.reason);

    for (const prerequisite of course.prerequisites || []) {
        if (profile.completedCourseIds.has(prerequisite.id)) {
            add(WEIGHTS.prerequisiteDone, `Builds on ${prerequisite.title}, which you completed`);
        } else {
            add(WEIGHTS.prerequisiteMissing, `Take ${prerequisite.title} first`, false);
        }
    }

    if (profile.roleCode) {
        const path = (course.roadmaps || []).find((r) => r.role_code === profile.roleCode);
        if (path) add(WEIGHTS.learningPath, `Part of the ${path.title} learning path`);
    }

    if (profile.preferredLanguageId && Number(course.language_id) === Number(profile.preferredLanguageId)) {
        add(WEIGHTS.language, `Uses ${course.language_name}, your preferred language`);
    }

    if (profile.ownedCourseIds.has(course.id)) {
        add(WEIGHTS.owned, "You already own this course", false);
    }

    if (profile.userExp > 0) {
        const now = profile.now ?? Date.now();
        const unlockedBy = (course.prerequisites || [])
            .find((p) => completedWithinDays(profile.completedAt?.get(p.id), CONTINUATION_DAYS, now));
        if (unlockedBy) add(WEIGHTS.continuation, `Next step after ${unlockedBy.title}, which you just completed`);

        const track = (course.roadmaps || []).find((r) => profile.recentTracks?.has(r.title));
        if (track) add(WEIGHTS.sameTrack, `Same track as the course you just completed (${track.title})`);
    }

    const community = communitySignal(course);
    if (community) add(community.score, community.reason, false);

    return { score, reasons, signals };
}

/** Deterministic order that never looks at price: score, then lower tier, rating, learners, id. */
function compareRanked(a, b) {
    return (b.score - a.score)
        || ((COURSE_LEVEL_INDEX[a.course.level] ?? 9) - (COURSE_LEVEL_INDEX[b.course.level] ?? 9))
        || ((Number(b.course.rating) || 0) - (Number(a.course.rating) || 0))
        || ((Number(b.course.students) || 0) - (Number(a.course.students) || 0))
        || String(a.course.id).localeCompare(String(b.course.id));
}

function toItem({ course, score, reasons }, ownedCourseIds) {
    return {
        course: {
            id: course.id,
            title: course.title,
            image: course.image,
            level: course.level,
            recommendedLevel: recommendedLevel(course.level, levelOverride(course)),
            rating: course.rating,
            students: course.students,
            duration: course.duration,
            modules: course.modules,
            lessons: course.lessons,
            instructor: course.instructor,
            accessModel: course.access_model,
            courseType: course.course_type,
            languageName: course.language_name,
            languageLogo: course.language_logo,
            languageColor: course.language_color,
            categoryName: course.category_name,
            challenges: course.challenges,
            skills: (course.skills || []).map((s) => s.name),
        },
        score,
        reasons: reasons.filter((r) => r.points > 0).sort((a, b) => b.points - a.points).map((r) => r.text),
        cautions: reasons.filter((r) => r.points < 0).map((r) => r.text),
        owned: ownedCourseIds.has(course.id),
    };
}

/**
 * @param {object} profile  normalised learner profile (see normaliseProfile)
 * @param {object[]} candidates  rows from onboardingDb.getRecommendationCandidates
 * @returns {{ items: object[], fallback: boolean, basis: object }}
 */
export function rankCourses(profile, candidates, { limit = 6 } = {}) {
    const levelled = profile.userExp > 0;
    const open = candidates.filter((course) => !profile.completedCourseIds.has(course.id) && !profile.activeCourseIds.has(course.id))
        // V1.3 §7.5: with a User Level, locked courses (a prerequisite not done) and too_early ones are not candidates.
        .filter((course) => !levelled || ((course.prerequisites || []).every((p) => profile.completedCourseIds.has(p.id))
            && learnerFit(profile, course) !== "too_early"));
    const hasPreferences = levelled || Boolean(profile.roleCode || profile.experienceLevel || profile.goalCodes?.length || profile.industryCodes?.length);

    // Tracks (roadmaps) of the most recently completed course, for the "same track" signal.
    const lastCompleted = [...(profile.completedAt || new Map())].sort((a, b) => String(b[1]).localeCompare(String(a[1])))[0];
    const lastCourse = lastCompleted && candidates.find((course) => course.id === lastCompleted[0]);
    const ranked = { ...profile, recentTracks: new Set((lastCourse?.roadmaps || []).map((r) => r.title)) };

    const scored = open.map((course) => ({ course, ...scoreCourse(ranked, course) }));
    const personal = hasPreferences
        ? scored.filter((item) => item.signals > 0 && item.score > 0).sort(compareRanked)
        : [];

    const basis = {
        role: profile.roleName || null,
        experienceLevel: profile.experienceLevel || null,
        goals: profile.goalCodes?.length || 0,
        industries: profile.industryCodes?.length || 0,
    };

    if (personal.length > 0) {
        return { items: personal.slice(0, limit).map((item) => toItem(item, profile.ownedCourseIds)), fallback: false, basis };
    }

    // A brand-new learner (no EXP, no preferences) starts with beginner courses that need nothing first,
    // most often finished first (V1.3 §7.5).
    if (!hasPreferences) {
        const starters = scored.filter((item) => item.course.level === "beginner" && !(item.course.prerequisites || []).length);
        if (starters.length) {
            const rate = (item) => (Number(item.course.enrolments) >= MIN_ENROLMENTS_FOR_RATE
                ? (Number(item.course.completions) || 0) / Number(item.course.enrolments) : 0);
            const items = starters
                .map((item) => ({ ...item, score: 0, reasons: [{ points: 1, text: "A good first course: no prerequisites" }] }))
                .sort((a, b) => (rate(b) - rate(a)) || ((Number(b.course.students) || 0) - (Number(a.course.students) || 0)) || compareRanked(a, b));
            return { items: items.slice(0, limit).map((item) => toItem(item, profile.ownedCourseIds)), fallback: true, basis };
        }
    }

    // Fallback: popular open courses that are not obviously too hard, with an honest reason.
    const fallback = scored
        .filter((item) => {
            const level = learnerLevelSignal(profile, item.course);
            return !level || level.score > WEIGHTS.levelTooHard;
        })
        .map((item) => ({
            ...item,
            score: 0,
            reasons: [{ points: 1, text: Number(item.course.students) > 0 ? "Popular with other learners" : "New in the catalog" }],
        }))
        .sort((a, b) => ((Number(b.course.students) || 0) - (Number(a.course.students) || 0)) || compareRanked(a, b));

    return { items: fallback.slice(0, limit).map((item) => toItem(item, profile.ownedCourseIds)), fallback: true, basis };
}

export function normaliseProfile(row = {}) {
    const enrolments = Array.isArray(row.enrolments) ? row.enrolments : [];
    return {
        roleCode: row.role_code || null,
        roleName: row.role_name || null,
        experienceLevel: row.experience_level || null,
        userExp: Number(row.exp) || 0,
        userLevel: Number(row.exp_level) || 1,
        preferredLanguageId: row.preferred_language_id || null,
        roleSkills: Array.isArray(row.role_skills) ? row.role_skills : [],
        industryCodes: row.industry_codes || [],
        goalCodes: row.goal_codes || [],
        completedCourseIds: new Set(enrolments.filter((e) => e.status === "completed").map((e) => e.course_id)),
        completedAt: new Map(enrolments.filter((e) => e.status === "completed" && e.completed_at).map((e) => [e.course_id, e.completed_at])),
        activeCourseIds: new Set(enrolments.filter((e) => IN_PROGRESS.has(e.status)).map((e) => e.course_id)),
        ownedCourseIds: new Set(row.owned_course_ids || []),
    };
}

export const recommendationService = {
    /**
     * The candidate catalog is the same for everyone and cached; the learner profile (entitlements,
     * progress) is read live and the ranking runs per request.
     */
    getForUser: async ({ userId, limit = 6 }) => {
        const [profileRes, candidates] = await Promise.all([
            onboardingDb.getLearnerProfile({ userId }),
            redis.remember(cacheKeys.recommendationCandidates(), TTL.RECOMMENDATION_CANDIDATES,
                async () => (await onboardingDb.getRecommendationCandidates()).rows),
        ]);

        const profile = normaliseProfile(profileRes.rows[0]);
        return rankCourses(profile, candidates || [], { limit });
    },
};
