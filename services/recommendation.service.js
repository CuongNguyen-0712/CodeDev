import { onboardingDb } from "@/db/onboarding.db";
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
};

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

// Once the learner has earned EXP, their User Level replaces the self-declared onboarding level.
const FIT_SIGNALS = {
    suitable: { score: WEIGHTS.levelFit, reason: (level) => `Suits your level ${level}` },
    challenge: { score: WEIGHTS.levelStretch, reason: () => "A step up from your current level" },
    review: { score: WEIGHTS.levelTooBasic, reason: () => "May be too basic for you" },
    too_early: { score: WEIGHTS.levelTooHard, reason: () => "May be too advanced for now" },
};

function learnerLevelSignal(profile, course) {
    if (profile.userExp > 0) {
        const signal = FIT_SIGNALS[courseFit(profile.userLevel, course.level, levelOverride(course))];
        return signal ? { score: signal.score, reason: signal.reason(profile.userLevel) } : null;
    }
    return profile.experienceLevel ? levelSignal(profile.experienceLevel, course.level) : null;
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

    return { score, reasons, signals };
}

/** Deterministic order that never looks at price: score, then rating, learners, id. */
function compareRanked(a, b) {
    return (b.score - a.score)
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
    const open = candidates.filter((course) => !profile.completedCourseIds.has(course.id) && !profile.activeCourseIds.has(course.id));
    const hasPreferences = Boolean(profile.roleCode || profile.experienceLevel || profile.goalCodes?.length || profile.industryCodes?.length);

    const scored = open.map((course) => ({ course, ...scoreCourse(profile, course) }));
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
        activeCourseIds: new Set(enrolments.filter((e) => IN_PROGRESS.has(e.status)).map((e) => e.course_id)),
        ownedCourseIds: new Set(row.owned_course_ids || []),
    };
}

export const recommendationService = {
    /** Not cached in Redis: depends on entitlements and progress (React Query caches it client-side). */
    getForUser: async ({ userId, limit = 6 }) => {
        const [profileRes, candidatesRes] = await Promise.all([
            onboardingDb.getLearnerProfile({ userId }),
            onboardingDb.getRecommendationCandidates(),
        ]);

        const profile = normaliseProfile(profileRes.rows[0]);
        return rankCourses(profile, candidatesRes.rows, { limit });
    },
};
