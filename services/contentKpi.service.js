import { contentKpiDb } from "@/db/contentKpi.db";
import { ApiError } from "@/lib/error/apiError";

/**
 * Content KPIs for course authors (V1.3 §11.3, §11.6; docs/master-plan-v1.3-adaptation.md P7):
 * per-challenge pass rate, attempts to pass and hint use, True/False statements most learners get
 * wrong on their first answer, and course completion next to the totals per tier.
 */

// A statement is flagged when more than 70% of at least 5 learners answered it wrong first.
export const HARD_STATEMENT = { minAnswered: 5, wrongRatio: 0.7 };

// catalog.course.level -> V1.3 tier (expert and master share tier 4, docs/experience-leveling-design.md §5).
const TIERS = { beginner: 1, intermediate: 2, advanced: 3, expert: 4, master: 4 };
const TIER_LABELS = { 1: "Beginner", 2: "Intermediate", 3: "Advanced", 4: "Expert" };

/** part / whole as a 0..1 ratio rounded to 3 decimals; null when nothing to divide. */
export const ratio = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null);

/** Rows per course level -> one row per tier 1..4 (empty tiers included), with the completion rate. */
export function completionByTier(rows) {
    const tiers = [1, 2, 3, 4].map((tier) => ({ tier, label: TIER_LABELS[tier], courses: 0, enrolled: 0, completed: 0 }));
    for (const row of rows) {
        const tier = TIERS[row.level];
        if (!tier) continue; // course without a level
        const target = tiers[tier - 1];
        target.courses += row.courses;
        target.enrolled += row.enrolled;
        target.completed += row.completed;
    }
    return tiers.map((t) => ({ ...t, completionRate: ratio(t.completed, t.enrolled) }));
}

export const contentKpiService = {
    getCourseKpis: async (courseId) => {
        const course = await contentKpiDb.findCourse(courseId);
        if (!course) throw new ApiError("Course not found", 404);

        const [challenges, statements, completion, byLevel] = await Promise.all([
            contentKpiDb.listChallengeStats(course.id),
            contentKpiDb.listHardStatements(course.id, HARD_STATEMENT),
            contentKpiDb.getCourseCompletion(course.id),
            contentKpiDb.listCompletionByLevel(),
        ]);

        return {
            course: { id: course.public_id, title: course.title, level: course.level, tier: TIERS[course.level] || null },
            completion: { ...completion, completionRate: ratio(completion.completed, completion.enrolled) },
            tiers: completionByTier(byLevel.rows),
            challenges: challenges.rows.map((row) => ({
                id: row.id,
                title: row.title,
                lessonTitle: row.lesson_title,
                type: row.type,
                difficulty: row.difficulty,
                tried: row.tried,
                passed: row.passed,
                passRate: ratio(row.passed, row.tried),
                avgAttemptsToPass: row.avg_attempts_to_pass,
                hintUsers: row.hint_users,
                hintLevel3Users: row.hint3_users,
            })),
            hardStatements: statements.rows.map((row) => ({
                id: row.id,
                challengeId: row.challenge_id,
                challengeTitle: row.challenge_title,
                statement: row.question,
                correctAnswer: row.correct_answer,
                answered: row.answered,
                wrong: row.wrong,
                wrongRate: ratio(row.wrong, row.answered),
            })),
            thresholds: HARD_STATEMENT,
        };
    },
};
