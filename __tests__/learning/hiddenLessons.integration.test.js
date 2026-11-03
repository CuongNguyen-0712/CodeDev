import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Hidden modules / lessons (migration 20261103_001) against a real PostgreSQL: hiding in the admin
 * removes the item from the syllabus, the course player, unlocking, completion and the counters;
 * showing it again restores it. Fixtures are tagged and removed in afterAll.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `hl${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const actor = { id: null };
const reason = "integration test";

let sql, dbPool, courseDb, adminCourseService, generateSonyflake;
const userIds = [];
let course;
// L[0..2] in module M[0], L[3] in module M[1].
const M = [];
const L = [];

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

const hide = (kind, itemId, hidden = true) =>
    adminCourseService.changeItem({ actor, courseId: course.public_id, kind, itemId: String(itemId), hidden, reason });
const counters = () => one(
    `SELECT c.modules, c.lessons, (SELECT lessons FROM course.module WHERE id = $2) AS first_module_lessons
     FROM catalog.course c WHERE c.id = $1`, [course.id, M[0]]);
const progress = async (user) => (await one(`SELECT public.learning_progress($1, $2) AS p`, [user.publicId, course.public_id])).p;
const playerLessons = async (user) => (await progress(user)).modules.flatMap((m) => m.lessons.map((l) => ({ id: l.id, status: l.status })));
const submit = async (user, lessonId) =>
    (await courseDb.postSubmitLesson({ userId: user.publicId, courseId: course.public_id, lessonId })).rows[0];
const openLesson = (user, lessonId) => courseDb.getLearning({ userId: user.publicId, lessonId });

describe.skipIf(!hasDb)("hidden modules and lessons (PostgreSQL)", () => {
    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        const ready = await one(`SELECT to_regprocedure('public.unlock_first_open_lesson(bigint,bigint)') AS f`);
        if (!ready.f) throw new Error("Run `npm run db:migrate` first (migration 20261103_001)");
        ({ courseDb } = await import("@/db/course.db"));
        ({ adminCourseService } = await import("@/services/adminCourse.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));

        course = await one(
            `INSERT INTO catalog.course (title, concept, description, instructor, public_id, language_id, category_id, level, access_model, publish_status)
             VALUES ($1, 'test', 'test', 'Test', $2, (SELECT MIN(id) FROM catalog.language), (SELECT MIN(id) FROM catalog.category), 'beginner', 'free', 'published')
             RETURNING id, public_id`,
            [`Hidden ${TAG}`, `${TAG}-course`]
        );
        for (const order of [1, 2]) {
            M.push((await one(`INSERT INTO course.module (course_id, title, order_index) VALUES ($1, $2, $3) RETURNING id`, [course.id, `M${order}`, order])).id);
        }
        for (const [moduleIndex, order] of [[0, 1], [0, 2], [0, 3], [1, 1]]) {
            L.push(String((await one(
                `INSERT INTO course.lesson (module_id, title, order_index, content_type, content_source) VALUES ($1, $2, $3, 'sanity', $4) RETURNING id`,
                [M[moduleIndex], `L${L.length + 1}`, order, `${TAG}-lesson-${L.length + 1}`]
            )).id));
        }
    });

    afterAll(async () => {
        if (!dbPool) return;
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [userIds]);
        if (course) await sql(`DELETE FROM catalog.course WHERE id = $1`, [course.id]);
    });

    it("counts visible modules and lessons only, and restores the counts when shown again", async () => {
        expect(await counters()).toEqual({ modules: 2, lessons: 4, first_module_lessons: 3 });
        await hide("lesson", L[1]);
        expect(await counters()).toEqual({ modules: 2, lessons: 3, first_module_lessons: 2 });
        await hide("module", M[1]);
        expect(await counters()).toEqual({ modules: 1, lessons: 2, first_module_lessons: 2 });
        await hide("module", M[1], false);
        await hide("lesson", L[1], false);
        expect(await counters()).toEqual({ modules: 2, lessons: 4, first_module_lessons: 3 });
    });

    it("drops hidden lessons and modules from the course syllabus", async () => {
        const titles = async () => (await courseDb.getCourseDetails({ courseId: course.public_id })).rows[0].modules
            .map((m) => `${m.title}:${(m.lessons || []).map((l) => l.title).join(",")}`);
        expect(await titles()).toEqual(["M1:L1,L2,L3", "M2:L4"]);
        await hide("lesson", L[1]);
        await hide("module", M[1]);
        expect(await titles()).toEqual(["M1:L1,L3"]);
        await hide("module", M[1], false);
        await hide("lesson", L[1], false);
        expect(await titles()).toEqual(["M1:L1,L2,L3", "M2:L4"]);
    });

    it("skips a hidden lesson when unlocking, completes the course without it, and reopens it when shown", async () => {
        const user = await makeUser("skipper");
        await courseDb.postRegister({ userId: user.publicId, courseId: course.public_id });
        expect((await playerLessons(user))[0]).toEqual({ id: L[0], status: "in_progress" });

        await hide("lesson", L[1]);
        expect((await playerLessons(user)).map((l) => l.id)).toEqual([L[0], L[2], L[3]]);
        await expect(openLesson(user, L[1])).rejects.toMatchObject({ code: "CD404" });
        await expect(submit(user, L[1])).rejects.toMatchObject({ code: "CD404" });

        expect(await submit(user, L[0])).toMatchObject({ nextLessonId: L[2], completedLessons: 1, courseCompleted: false });
        expect(await submit(user, L[2])).toMatchObject({ nextLessonId: L[3], completedLessons: 2, courseCompleted: false });
        expect(await submit(user, L[3])).toMatchObject({ nextLessonId: null, completedLessons: 3, courseCompleted: true });
        expect((await progress(user)).progress).toBe(3);

        // Shown again: back in the player, unlocked for this learner; the finished course stays finished.
        await hide("lesson", L[1], false);
        const after = await progress(user);
        expect(after.status).toBe("completed");
        expect(after.lessons_count).toBe(4);
        expect(after.modules.flatMap((m) => m.lessons).find((l) => l.id === L[1]).status).toBe("in_progress");
        expect((await openLesson(user, L[1])).rows[0]).toMatchObject({ status: "in_progress" });
    });

    it("moves a learner on when their current lesson is hidden", async () => {
        const user = await makeUser("current");
        await courseDb.postRegister({ userId: user.publicId, courseId: course.public_id });
        await progress(user);
        expect(await submit(user, L[0])).toMatchObject({ nextLessonId: L[1] });

        await hide("lesson", L[1]);
        // The lesson page alone unlocks the next visible lesson (no course page visit first).
        expect((await openLesson(user, L[2])).rows[0]).toMatchObject({ status: "in_progress" });
        await expect(openLesson(user, L[1])).rejects.toMatchObject({ code: "CD404" });
        await expect(openLesson(user, L[3])).rejects.toThrow(/complete the previous lesson/);

        await hide("lesson", L[1], false);
        expect(await playerLessons(user)).toEqual([
            { id: L[0], status: "completed" },
            { id: L[1], status: "in_progress" },
            { id: L[2], status: "in_progress" },
            { id: L[3], status: "enrolled" },
        ]);
    });
});
