import { sql } from "@/lib/db";

/**
 * Read-only content KPIs for the admin "Content KPIs" tab (docs/master-plan-v1.3-adaptation.md P7).
 * Run on demand for one course; nothing is cached or stored.
 */
export const contentKpiDb = {
    findCourse: async (publicId) => {
        const { rows } = await sql(
            `SELECT id, public_id, title, level::text AS level FROM catalog.course WHERE public_id = $1`,
            [publicId]
        );
        return rows[0] || null;
    },

    /**
     * One row per published challenge in lesson order. A learner "tried" when they have a quiz
     * attempt or a code submission. Pass: coding = a submission with status 'passed'; quiz = the
     * challenge reward in profile.exp_transaction (quiz attempts store no pass flag). A passed quiz
     * accepts no more attempts, so its attempt count is the number of attempts to pass.
     */
    listChallengeStats: async (courseDbId) => {
        return sql(
            `WITH ch AS (
                SELECT ch.id, ch.public_id, ch.title, ch.type, ch.difficulty::text AS difficulty,
                       l.title AS lesson_title, m.order_index AS module_order, l.order_index AS lesson_order
                FROM challenge.challenges ch
                LEFT JOIN course.lesson l ON l.id = ch.lesson_id
                LEFT JOIN course.module m ON m.id = l.module_id
                WHERE ch.course_id = $1 AND ch.is_deleted = false AND ch.is_published = true
                  AND ch.type IN ('quiz', 'mini_coding', 'fix_bug')
            ),
            quiz AS (
                SELECT a.challenge_id, a.user_id, a.attempts,
                       CASE WHEN t.user_id IS NOT NULL THEN a.attempts END AS attempts_to_pass
                FROM (
                    SELECT q.challenge_id, qs.user_id, COUNT(DISTINCT qs.created_at)::int AS attempts
                    FROM challenge.questions q
                    JOIN challenge.question_submissions qs ON qs.question_id = q.id
                    WHERE q.challenge_id IN (SELECT id FROM ch WHERE type = 'quiz')
                    GROUP BY q.challenge_id, qs.user_id
                ) a
                LEFT JOIN profile.exp_transaction t
                    ON t.source_type = 'challenge' AND t.source_id = a.challenge_id AND t.user_id = a.user_id
            ),
            coding AS (
                SELECT challenge_id, user_id, COUNT(*)::int AS attempts,
                       MIN(n) FILTER (WHERE status = 'passed')::int AS attempts_to_pass
                FROM (
                    SELECT s.challenge_id, s.user_id, s.status,
                           ROW_NUMBER() OVER (PARTITION BY s.challenge_id, s.user_id ORDER BY s.submitted_at, s.id) AS n
                    FROM challenge.code_submissions s
                    WHERE s.challenge_id IN (SELECT id FROM ch WHERE type <> 'quiz')
                ) x
                GROUP BY challenge_id, user_id
            ),
            tries AS (SELECT * FROM quiz UNION ALL SELECT * FROM coding)
            SELECT ch.public_id AS id, ch.title, ch.type, ch.difficulty, ch.lesson_title,
                   COUNT(t.user_id)::int AS tried,
                   COUNT(t.attempts_to_pass)::int AS passed,
                   ROUND(AVG(t.attempts_to_pass), 2)::float AS avg_attempts_to_pass,
                   (SELECT COUNT(DISTINCT hv.user_id) FROM challenge.hint_views hv WHERE hv.challenge_id = ch.id)::int AS hint_users,
                   (SELECT COUNT(*) FROM challenge.hint_views hv WHERE hv.challenge_id = ch.id AND hv.level = 3)::int AS hint3_users
            FROM ch
            LEFT JOIN tries t ON t.challenge_id = ch.id
            GROUP BY ch.id, ch.public_id, ch.title, ch.type, ch.difficulty, ch.lesson_title, ch.module_order, ch.lesson_order
            ORDER BY ch.module_order NULLS LAST, ch.lesson_order NULLS LAST, ch.id`,
            [courseDbId]
        );
    },

    /**
     * True/False statements (options exactly "True" / "False") of the course whose FIRST answer
     * (the learner's earliest attempt at it) was wrong for more than `wrongRatio` of the learners,
     * among statements with at least `minAnswered` learners.
     */
    listHardStatements: async (courseDbId, { minAnswered, wrongRatio }) => {
        return sql(
            `WITH first_answer AS (
                SELECT DISTINCT ON (qs.user_id, qs.question_id) qs.question_id, qs.is_correct
                FROM challenge.question_submissions qs
                JOIN challenge.questions q ON q.id = qs.question_id
                JOIN challenge.challenges ch ON ch.id = q.challenge_id
                WHERE ch.course_id = $1 AND ch.is_deleted = false AND q.type = 'single_choice'
                ORDER BY qs.user_id, qs.question_id, qs.created_at
            )
            SELECT q.id::text AS id, ch.public_id AS challenge_id, ch.title AS challenge_title, q.question,
                   (SELECT o.option_text FROM challenge.question_options o WHERE o.question_id = q.id AND o.is_correct LIMIT 1) AS correct_answer,
                   COUNT(*)::int AS answered,
                   COUNT(*) FILTER (WHERE NOT f.is_correct)::int AS wrong
            FROM first_answer f
            JOIN challenge.questions q ON q.id = f.question_id
            JOIN challenge.challenges ch ON ch.id = q.challenge_id
            WHERE (SELECT array_agg(lower(o.option_text) ORDER BY lower(o.option_text))
                   FROM challenge.question_options o WHERE o.question_id = q.id) = ARRAY['false', 'true']
            GROUP BY q.id, ch.public_id, ch.title, q.question
            HAVING COUNT(*) >= $2 AND COUNT(*) FILTER (WHERE NOT f.is_correct) > $3::numeric * COUNT(*)
            ORDER BY COUNT(*) FILTER (WHERE NOT f.is_correct)::numeric / COUNT(*) DESC, q.id`,
            [courseDbId, minAnswered, wrongRatio]
        );
    },

    /** Enrolled / completed learners (learning.register, unenrolled rows excluded) of one course. */
    getCourseCompletion: async (courseDbId) => {
        const { rows } = await sql(
            `SELECT COUNT(*)::int AS enrolled, COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
             FROM learning.register WHERE course_id = $1 AND is_deleted = false`,
            [courseDbId]
        );
        return rows[0];
    },

    /** The same totals per course level over every course that is not deleted. */
    listCompletionByLevel: async () => {
        return sql(
            `SELECT c.level::text AS level, COUNT(DISTINCT c.id)::int AS courses,
                    COUNT(r.user_id)::int AS enrolled,
                    COUNT(r.user_id) FILTER (WHERE r.status = 'completed')::int AS completed
             FROM catalog.course c
             LEFT JOIN learning.register r ON r.course_id = c.id AND r.is_deleted = false
             WHERE c.is_deleted = false
             GROUP BY c.level`
        );
    },
};
