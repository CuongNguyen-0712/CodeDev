import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * EXP and User Level against a real PostgreSQL (DATABASE_URL, migration 20261018_001 applied).
 * Fixtures are tagged and removed in afterAll.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `xp${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

let sql, dbPool, courseDb, challengeDb, generateSonyflake;
const userIds = [];
let course;

const one = async (text, params) => (await sql(text, params)).rows[0];

async function makeUser(name) {
    const id = String(generateSonyflake());
    const publicId = `${TAG}_${name}`;
    await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $3, $4)`,
        [id, publicId, publicId, `${publicId}@test.invalid`]);
    await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'Test', $2)`, [id, name]);
    userIds.push(id);
    return { id, publicId };
}

async function makeChallenge(lessonId, mod, { type, difficulty, points = 10 }) {
    return one(
        `INSERT INTO challenge.challenges (course_id, module_id, lesson_id, name, title, status, difficulty, type, points, is_published, public_id)
         VALUES ($1, $2, $3, 'c', 'C', 'open', $4, $5, $6, true, $7) RETURNING id`,
        [course.id, mod, lessonId, difficulty, type, points, `${TAG}-${type}-${difficulty}-${crypto.randomBytes(2).toString("hex")}`]
    );
}

const award = (userId, challengeId, multiplier = 1) =>
    one(`SELECT * FROM public.award_challenge_exp($1::bigint, $2::bigint, $3::numeric)`, [userId, challengeId, multiplier]);
const profileOf = (userId) => one(`SELECT exp, exp_level, points FROM profile.info WHERE user_id = $1`, [userId]);

describe.skipIf(!hasDb)("EXP and levels (PostgreSQL)", () => {
    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        const ready = await one(`SELECT to_regclass('profile.exp_transaction') AS t`);
        if (!ready.t) throw new Error("Run `npm run db:migrate` first (migration 20261018_001)");
        ({ courseDb } = await import("@/db/course.db"));
        ({ challengeDb } = await import("@/db/challenge.db"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));

        // A free beginner course with 2 lessons and a 500-point completion reward (no longer credited).
        course = await one(
            `INSERT INTO catalog.course (title, concept, description, instructor, public_id, language_id, category_id, level, access_model, publish_status, reward)
             VALUES ($1, 'test', 'test', 'Test', $2, (SELECT MIN(id) FROM catalog.language), (SELECT MIN(id) FROM catalog.category), 'beginner', 'free', 'published', 500)
             RETURNING id, public_id`,
            [`XP ${TAG}`, `${TAG}-course`]
        );
        const mod = await one(`INSERT INTO course.module (course_id, title, order_index) VALUES ($1, 'M1', 1) RETURNING id`, [course.id]);
        course.module = mod.id;
        course.lessons = [];
        for (const order of [1, 2]) {
            const lesson = await one(
                `INSERT INTO course.lesson (module_id, title, order_index, content_type, content_source) VALUES ($1, $2, $3, 'sanity', $4) RETURNING id`,
                [mod.id, `L${order}`, order, `${TAG}-lesson-${order}`]
            );
            course.lessons.push(lesson.id);
        }
    });

    afterAll(async () => {
        if (!dbPool) return;
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [userIds]);
        if (course) await sql(`DELETE FROM catalog.course WHERE id = $1`, [course.id]);
        const left = await one(`SELECT COUNT(*)::int AS n FROM profile.exp_transaction WHERE user_id = ANY($1::bigint[])`, [userIds]);
        expect(left.n).toBe(0);
    });

    it("maps EXP to levels at the thresholds", async () => {
        const levelFor = async (exp) => (await one(`SELECT public.level_for_exp($1) AS l`, [exp])).l;
        expect(await levelFor(0)).toBe(1);
        expect(await levelFor(99)).toBe(1);
        expect(await levelFor(100)).toBe(2);
        expect(await levelFor(1900)).toBe(8);
        expect(await levelFor(19000)).toBe(20);
        expect(await levelFor(50000)).toBe(20);
    });

    it("awards challenge EXP by type and difficulty, once per challenge", async () => {
        const user = await makeUser("challenger");
        const quiz = await makeChallenge(course.lessons[0], course.module, { type: "quiz", difficulty: "medium" });
        const fix = await makeChallenge(course.lessons[0], course.module, { type: "fix_bug", difficulty: "hard" });
        const hardQuiz = await makeChallenge(course.lessons[0], course.module, { type: "quiz", difficulty: "hard" });

        expect(await award(user.id, quiz.id)).toMatchObject({ created: true, awarded: 8 });
        expect(await award(user.id, quiz.id)).toMatchObject({ created: false, awarded: 0 });
        expect(await award(user.id, fix.id)).toMatchObject({ created: true, awarded: 25 });
        // A later quiz attempt earns half, rounded up: 12 * 0.5 = 6.
        expect(await award(user.id, hardQuiz.id, 0.5)).toMatchObject({ created: true, awarded: 6 });

        expect(await profileOf(user.id)).toMatchObject({ exp: "39", exp_level: 1 });
    });

    it("gives half EXP when a quiz is passed after a failed attempt (challengeDb.saveQuizAttempt)", async () => {
        const user = await makeUser("retrier");
        const quiz = await makeChallenge(course.lessons[0], course.module, { type: "quiz", difficulty: "medium", points: 10 });
        const question = await one(
            `INSERT INTO challenge.questions (challenge_id, question, type, order_index, points) VALUES ($1, 'Q', 'single_choice', 1, 10) RETURNING id`,
            [quiz.id]
        );
        const attempt = (passed) => challengeDb.saveQuizAttempt({
            userDbId: user.id, challengeId: quiz.id, passed, points: 10, maxAttempts: 3, cooldownSec: 0,
            rows: [{ questionId: question.id, optionId: null, isCorrect: passed }],
        });

        expect(await attempt(false)).toEqual({ awardedPoints: 0, awardedExp: 0 });
        // Distinct created_at per attempt (attempts are counted by submission time).
        await new Promise((r) => setTimeout(r, 20));
        expect(await attempt(true)).toMatchObject({ awardedPoints: 10, awardedExp: 4, level: 1, previousLevel: 1 });
    });

    it("opens hints in order and halves EXP once hint 3 is open (assisted)", async () => {
        const user = await makeUser("hinted");
        const other = await makeUser("unhinted");
        const quiz = await makeChallenge(course.lessons[0], course.module, { type: "quiz", difficulty: "medium", points: 10 });
        await sql(
            `INSERT INTO challenge.challenge_hints (challenge_id, level, body) VALUES ($1, 1, 'h1'), ($1, 2, 'h2'), ($1, 3, 'h3')`,
            [quiz.id]
        );
        const question = await one(
            `INSERT INTO challenge.questions (challenge_id, question, type, order_index, points) VALUES ($1, 'Q', 'single_choice', 1, 10) RETURNING id`,
            [quiz.id]
        );
        const open = (u, level) => challengeDb.openHint({ userDbId: u.id, challengeId: quiz.id, level });
        const pass = (u) => challengeDb.saveQuizAttempt({
            userDbId: u.id, challengeId: quiz.id, passed: true, points: 10, maxAttempts: 3, cooldownSec: 0,
            rows: [{ questionId: question.id, optionId: null, isCorrect: true }],
        });

        expect(await open(user, 2)).toEqual({ locked: true });
        expect(await open(user, 1)).toEqual({ body: "h1" });
        expect(await open(user, 1)).toEqual({ body: "h1" }); // reopening is a no-op
        expect(await open(user, 2)).toEqual({ body: "h2" });
        expect(await open(user, 3)).toEqual({ body: "h3" });

        // quiz.medium = 8 EXP; assisted: 8 * 0.5 = 4. Points are not reduced.
        expect(await pass(user)).toMatchObject({ awardedPoints: 10, awardedExp: 4 });
        const tx = await one(
            `SELECT metadata FROM profile.exp_transaction WHERE user_id = $1 AND source_id = $2`, [user.id, quiz.id]
        );
        expect(tx.metadata).toMatchObject({ assisted: true });

        // Hints 1-2 only: full EXP.
        await open(other, 1);
        await open(other, 2);
        expect(await pass(other)).toMatchObject({ awardedPoints: 10, awardedExp: 8 });
    });

    it("jumps several levels at once and floors adjustments at 0", async () => {
        const user = await makeUser("adjusted");
        const up = await one(
            `SELECT * FROM public.post_exp($1::bigint, 2600, 'adjustment', NULL, NULL, $2, NULL, 'migration test')`,
            [user.id, `${TAG}-up`]
        );
        expect(up).toMatchObject({ created: true, awarded: 2600, previous_level: 1, new_level: 9 });

        // Replaying the same idempotency key does nothing.
        const replay = await one(
            `SELECT * FROM public.post_exp($1::bigint, 2600, 'adjustment', NULL, NULL, $2, NULL, 'migration test')`,
            [user.id, `${TAG}-up`]
        );
        expect(replay).toMatchObject({ created: false, awarded: 0 });

        const down = await one(
            `SELECT * FROM public.post_exp($1::bigint, -9999, 'adjustment', NULL, NULL, $2, NULL, 'correction')`,
            [user.id, `${TAG}-down`]
        );
        expect(down).toMatchObject({ created: true, awarded: -2600, exp_after: "0", new_level: 1 });

        await expect(sql(`SELECT * FROM public.post_exp($1::bigint, -5, 'lesson', 1)`, [user.id])).rejects.toMatchObject({ code: "CD400" });
        await expect(sql(`SELECT * FROM public.post_exp($1::bigint, 5, 'adjustment', NULL, NULL, $2)`, [user.id, `${TAG}-noreason`]))
            .rejects.toThrow(/chk_exp_transaction_adjustment/);
    });

    it("submit_lesson awards lesson points + EXP once, and the course bonus as EXP only", async () => {
        const user = await makeUser("learner");
        await courseDb.postRegister({ userId: user.publicId, courseId: course.public_id });
        // Opening the course unlocks the first lesson; do it directly here.
        await sql(`UPDATE learning.history SET status = 'in_progress' WHERE user_id = $1 AND lesson_id = $2`, [user.id, course.lessons[0]]);

        const first = (await courseDb.postSubmitLesson({ userId: user.publicId, courseId: course.public_id, lessonId: course.lessons[0] })).rows[0];
        expect(first).toMatchObject({ awardedPoints: 10, awardedExp: 10, courseCompleted: false });

        const again = (await courseDb.postSubmitLesson({ userId: user.publicId, courseId: course.public_id, lessonId: course.lessons[0] })).rows[0];
        expect(again).toMatchObject({ awardedPoints: 0, awardedExp: 0 });

        const last = (await courseDb.postSubmitLesson({ userId: user.publicId, courseId: course.public_id, lessonId: course.lessons[1] })).rows[0];
        expect(last).toMatchObject({ awardedPoints: 10, awardedExp: 60, courseCompleted: true }); // 10 lesson + 50 beginner bonus

        expect(await profileOf(user.id)).toMatchObject({ exp: "70", points: "20" });
        const coursePoints = await one(
            `SELECT COUNT(*)::int AS n FROM profile.point_transaction WHERE user_id = $1 AND source_type = 'course'`, [user.id]
        );
        expect(coursePoints.n).toBe(0);
    });

    it("keeps the EXP cache equal to the ledger", async () => {
        const drift = await one(`SELECT COUNT(*)::int AS n FROM profile.exp_drift WHERE user_id = ANY($1::bigint[])`, [userIds]);
        expect(drift.n).toBe(0);
    });
});
