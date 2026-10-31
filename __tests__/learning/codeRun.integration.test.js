import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * challenge.code_runs as the job store (migration 20261030_001) against a real PostgreSQL:
 * one active run per learner, conditional transitions, the sweeper and the run view.
 * No sandbox needed. Fixtures are tagged and removed in afterAll.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `cr${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

let sql, dbPool, codeRunDb, challengeService, generateSonyflake, ulid;
const users = [];
let course, challengeId;

const one = async (text, params) => (await sql(text, params)).rows[0];

async function makeUser(name) {
    const id = String(generateSonyflake());
    const publicId = `${TAG}_${name}`;
    await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [id, publicId, `${publicId}@test.invalid`]);
    users.push(id);
    return { id, publicId };
}

const newRun = (user, { deadlineSec = 60, runType = "manual" } = {}) => {
    const publicId = `run_${ulid().toLowerCase()}`;
    return codeRunDb.create({
        publicId, userDbId: user.id, challengeId, runType, language: "python", code: "print(1)", sandbox: "docker", deadlineSec,
    }).then(() => publicId);
};

describe.skipIf(!hasDb)("queued code runs (PostgreSQL)", () => {
    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        const ready = await one(`SELECT to_regclass('ops.dead_letters') AS t`);
        if (!ready.t) throw new Error("Run `npm run db:migrate` first (migration 20261030_001)");
        ({ codeRunDb } = await import("@/db/codeRun.db"));
        ({ challengeService } = await import("@/services/challenge.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));
        ({ ulid } = await import("ulid"));

        course = await one(
            `INSERT INTO catalog.course (title, concept, description, instructor, public_id, language_id, category_id, level, access_model, publish_status)
             VALUES ($1, 'test', 'test', 'Test', $2, (SELECT MIN(id) FROM catalog.language), (SELECT MIN(id) FROM catalog.category), 'beginner', 'free', 'published')
             RETURNING id`,
            [`CR ${TAG}`, `${TAG}-course`]
        );
        const mod = await one(`INSERT INTO course.module (course_id, title, order_index) VALUES ($1, 'M1', 1) RETURNING id`, [course.id]);
        const lesson = await one(
            `INSERT INTO course.lesson (module_id, title, order_index, content_type, content_source) VALUES ($1, 'L1', 1, 'sanity', $2) RETURNING id`,
            [mod.id, `${TAG}-lesson`]
        );
        challengeId = (await one(
            `INSERT INTO challenge.challenges (course_id, module_id, lesson_id, name, title, status, difficulty, type, points, is_published, public_id)
             VALUES ($1, $2, $3, 'c', 'C', 'open', 'easy', 'mini_coding', 10, true, $4) RETURNING id::text`,
            [course.id, mod.id, lesson.id, `${TAG}-coding`]
        )).id;
    });

    afterAll(async () => {
        if (!dbPool) return;
        await sql(`DELETE FROM challenge.code_runs WHERE user_id = ANY($1::bigint[])`, [users]);
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [users]);
        if (course) await sql(`DELETE FROM catalog.course WHERE id = $1`, [course.id]);
    });

    it("keeps one queued or running run per learner", async () => {
        const user = await makeUser("single");
        const first = await newRun(user);
        await expect(newRun(user)).rejects.toMatchObject({ status: 429 });

        await codeRunDb.finish({ publicId: first, status: "completed" });
        await expect(newRun(user)).resolves.toMatch(/^run_/);
    });

    it("moves through queued -> running -> completed once, and never starts after its deadline", async () => {
        const user = await makeUser("steps");
        const runId = await newRun(user);

        expect(await codeRunDb.start({ publicId: runId })).toMatchObject({ status: "running", user_public_id: user.publicId });
        // A retried step finds it running and may start again.
        expect(await codeRunDb.start({ publicId: runId })).toMatchObject({ status: "running" });
        await codeRunDb.saveResult({ publicId: runId, result: { language: "python", graded: [] } });
        expect(await codeRunDb.finish({ publicId: runId, status: "completed" })).toBe(true);
        expect(await codeRunDb.finish({ publicId: runId, status: "failed" })).toBe(false);
        expect(await codeRunDb.start({ publicId: runId })).toBeNull();

        const late = await newRun(await makeUser("late"), { deadlineSec: -1 });
        expect(await codeRunDb.start({ publicId: late })).toBeNull();
    });

    it("shows a queued run with its position only to its owner", async () => {
        const owner = await makeUser("owner");
        const other = await makeUser("other");
        const runId = await newRun(owner);

        const view = await challengeService.getCodeRun({ userId: owner.publicId, runId });
        expect(view).toMatchObject({ runId, kind: "manual", status: "queued" });
        expect(view.position).toBeGreaterThanOrEqual(0);
        await expect(challengeService.getCodeRun({ userId: other.publicId, runId })).rejects.toMatchObject({ status: 404 });
        await codeRunDb.finish({ publicId: runId, status: "cancelled" });
    });

    it("ends an expired run where it is found, so neither the learner nor the queue stays blocked", async () => {
        const user = await makeUser("expired");
        const lateStart = await newRun(user, { deadlineSec: -1 });

        // The queue started it after its deadline: executeCodeRun closes it instead of leaving it queued.
        expect(await challengeService.executeCodeRun(lateStart)).toEqual({ status: "cancelled" });
        await expect(newRun(user)).resolves.toMatch(/^run_/); // the one-active-run slot is free again

        const other = await makeUser("polled");
        const polled = await newRun(other, { deadlineSec: -1 });
        expect(await challengeService.getCodeRun({ userId: other.publicId, runId: polled }))
            .toMatchObject({ status: "cancelled", error: { status: 503 } });

        // queueCodeRun's own clean-up: an expired run of this learner is ended before the new insert.
        const third = await makeUser("requeue");
        const dead = await newRun(third, { deadlineSec: -1 });
        await codeRunDb.expireForUser({ userDbId: third.id });
        expect((await codeRunDb.get({ publicId: dead })).status).toBe("cancelled");
    });

    it("gives a running job a grace period past its deadline, then times it out", async () => {
        const user = await makeUser("grace");
        const runId = await newRun(user, { deadlineSec: 60 });
        await codeRunDb.start({ publicId: runId });

        await sql(`UPDATE challenge.code_runs SET deadline_at = now() - interval '60 seconds' WHERE public_id = $1`, [runId]);
        expect(await codeRunDb.expire({ publicId: runId })).toBe(false); // still within the 150s grace
        expect(await codeRunDb.start({ publicId: runId })).toMatchObject({ status: "running" }); // a retry may go on

        await sql(`UPDATE challenge.code_runs SET deadline_at = now() - interval '200 seconds' WHERE public_id = $1`, [runId]);
        expect(await codeRunDb.expire({ publicId: runId })).toBe(true);
        expect((await codeRunDb.get({ publicId: runId })).status).toBe("timeout");
    });

    it("does not count expired runs as load", async () => {
        const before = await codeRunDb.load();
        const user = await makeUser("load");
        const runId = await newRun(user, { deadlineSec: -1 });
        await sql(`UPDATE challenge.code_runs SET queued_at = now() - interval '10 minutes' WHERE public_id = $1`, [runId]);

        const after = await codeRunDb.load();
        expect(after.active).toBe(before.active);
        expect(after.oldest_wait_sec).toBeLessThan(600);
        await codeRunDb.expire({ publicId: runId });
    });

    it("ends a failed run with a message, and the sweeper ends runs stuck past their deadline", async () => {
        const failing = await makeUser("failing");
        const failedRun = await newRun(failing);
        await codeRunDb.start({ publicId: failedRun });
        await challengeService.failCodeRun(failedRun);
        expect(await challengeService.getCodeRun({ userId: failing.publicId, runId: failedRun }))
            .toMatchObject({ status: "failed", error: { status: 503 } });

        const stuck = await makeUser("stuck");
        const stuckRun = await newRun(stuck, { deadlineSec: -180 });
        const swept = await challengeService.sweepCodeRuns();
        expect(swept.expired).toBeGreaterThanOrEqual(1);
        expect(await challengeService.getCodeRun({ userId: stuck.publicId, runId: stuckRun }))
            .toMatchObject({ status: "cancelled", error: { status: 503 } });
    });
});
