import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * A Python (stdio) coding challenge through the app's service layer, end to end: workspace,
 * Run and Submit as code runs graded in the code runner, the two-step submission, points and EXP.
 *
 * Needs: DATABASE_URL with the python-rag-from-scratch seed applied, the codedev_sandbox
 * container (CODE_RUNNER_URL/TOKEN in .env.local) and MinIO with the starter uploaded.
 * Skipped otherwise. The learner, its access rows and its submission snapshots are removed after.
 */
const root = path.resolve(__dirname, "..", "..");
const env = loadEnv("development", root, "CODE_RUNNER_");
const CHALLENGE = "chal_coding_py_rag_112";
const lessonDir = path.join(root, "content/courses/python-rag-from-scratch/01-chunking-with-overlap/challenges", CHALLENGE);

const runnerUp = env.CODE_RUNNER_URL
    ? await fetch(new URL("/health", env.CODE_RUNNER_URL)).then((r) => r.json()).then((h) => h.languages?.includes("python")).catch(() => false)
    : false;
const minioUp = process.env.MINIO_ENDPOINT
    ? await fetch(`${process.env.MINIO_ENDPOINT}/minio/health/live`).then((r) => r.ok).catch(() => false)
    : false;
const ready = Boolean(process.env.DATABASE_URL && runnerUp && minioUp && env.CODE_RUNNER_TOKEN);

let sql, dbPool, challengeService, generateSonyflake, s3;
let user, challenge;
const one = async (text, params) => (await sql(text, params)).rows[0];

describe.skipIf(!ready)("python stdio challenge through the service layer", () => {
    beforeAll(async () => {
        process.env.CODE_RUNNER_URL = env.CODE_RUNNER_URL;
        process.env.CODE_RUNNER_TOKEN = env.CODE_RUNNER_TOKEN;
        ({ sql, dbPool } = await import("@/lib/db"));
        ({ challengeService } = await import("@/services/challenge.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));
        ({ s3 } = await import("@/lib/s3"));

        challenge = await one(
            `SELECT ch.id::text AS id, ch.course_id, ch.lesson_id, l.module_id
             FROM challenge.challenges ch JOIN course.lesson l ON l.id = ch.lesson_id
             WHERE ch.public_id = $1`,
            [CHALLENGE]
        );
        if (!challenge) throw new Error("Apply db/seeds/python-rag-from-scratch.sql first");

        // A learner with an admin grant (the course is a premium draft, so register_course refuses it).
        const id = String(generateSonyflake());
        const publicId = `py${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
        await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'Test', 'Py')`, [id]);
        await sql(`INSERT INTO commerce.entitlement (public_id, user_id, course_id, source) VALUES ($1, $2, $3, 'admin_grant')`, [`ent_${publicId}`, id, challenge.course_id]);
        await sql(`INSERT INTO learning.register (user_id, course_id, status) VALUES ($1, $2, 'in_progress')`, [id, challenge.course_id]);
        await sql(`INSERT INTO learning.history (user_id, course_id, module_id, lesson_id, status) VALUES ($1, $2, $3, $4, 'in_progress')`,
            [id, challenge.course_id, challenge.module_id, challenge.lesson_id]);
        user = { id, publicId };
    });

    afterAll(async () => {
        if (!dbPool || !user) return;
        const snapshots = await sql(`SELECT source_snapshot->>'s3_key' AS key FROM challenge.code_submissions WHERE user_id = $1`, [user.id]);
        for (const { key } of snapshots.rows) await s3.delete(key).catch(() => {});
        await sql(`DELETE FROM challenge.coding_workspaces WHERE user_id = $1`, [user.id]);
        await sql(`DELETE FROM challenge.code_runs WHERE user_id = $1`, [user.id]);
        await sql(`DELETE FROM challenge.code_submissions WHERE user_id = $1`, [user.id]);
        await sql(`DELETE FROM storage.assets WHERE owner_id = $1`, [user.id]);
        await sql(`DELETE FROM learning.history WHERE user_id = $1`, [user.id]);
        await sql(`DELETE FROM identity.users WHERE id = $1`, [user.id]);
    });

    const solution = () => fs.readFileSync(path.join(lessonDir, "solution.py"), "utf8");
    const starter = () => fs.readFileSync(path.join(lessonDir, "starter.py"), "utf8");

    it("loads the Python workspace with sample tests only", async () => {
        const workspace = await challengeService.getCodingWorkspace({ userId: user.publicId, challengeId: challenge.id });
        expect(workspace).toMatchObject({ language: "python", filePath: "chunker.py", harnessCode: null, hiddenCount: 5 });
        expect(workspace.starterCode).toContain("def chunk_words");
        expect(workspace.tests).toHaveLength(3);
    });

    // No Inngest in tests: the run is graded inside the call and comes back finished.
    const run = (code, kind = "manual") => challengeService.queueCodeRun({ userId: user.publicId, challengeId: challenge.id, code, kind });

    it("runs the sample tests in the code runner (starter fails, solution passes)", async () => {
        const failing = await run(starter());
        expect(failing).toMatchObject({ kind: "manual", status: "completed" });
        expect(failing.tests.map((t) => t.status)).toContain("failed");

        const passing = await run(solution());
        expect(passing.tests).toHaveLength(3);
        expect(passing.tests.every((t) => t.status === "passed")).toBe(true);
        expect(passing.tests[0]).toMatchObject({ actual: ["a b c d", "d e f g", "g h i j"] });
    }, 60_000);

    it("shows a syntax error as the test error", async () => {
        const broken = await run("def chunk_words(:\n");
        expect(broken.tests[0]).toMatchObject({ status: "error" });
        expect(broken.tests[0].error).toMatch(/SyntaxError/);
    }, 60_000);

    it("rejects a submission whose sample tests fail without using an attempt", async () => {
        const rejected = await run(starter(), "submit");
        expect(rejected).toMatchObject({ kind: "submit", status: "completed", error: { status: 409 } });
        expect((await one(`SELECT COUNT(*)::int AS n FROM challenge.code_submissions WHERE user_id = $1`, [user.id])).n).toBe(0);
    }, 60_000);

    it("grades a queued submission on the server and awards points and EXP", async () => {
        const graded = await run(solution(), "submit");
        expect(graded).toMatchObject({ kind: "submit", passed: true, testsPassed: 8, testsTotal: 8, attempts: 1, awardedPoints: 30, awardedExp: 20 });
        expect(graded.submissionId).toMatch(/^sub_[a-z0-9]{26}$/);
        const row = await one(`SELECT status, submission_id IS NOT NULL AS linked FROM challenge.code_runs WHERE public_id = $1`, [graded.runId]);
        expect(row).toEqual({ status: "completed", linked: true });
    }, 120_000);

    it("grades a two-step submission on the server and awards points and EXP only once", async () => {
        const started = await challengeService.startCodingSubmission({ userId: user.publicId, challengeId: challenge.id, code: solution(), results: {} });
        expect(started.hiddenTests).toEqual([]); // hidden inputs never reach the browser

        const finished = await challengeService.finishCodingSubmission({
            userId: user.publicId, challengeId: challenge.id, submissionId: started.submissionId, results: {},
        });
        // The queued submission above already earned them.
        expect(finished).toMatchObject({ passed: true, testsPassed: 8, testsTotal: 8, awardedPoints: 0, awardedExp: 0 });
    }, 120_000);
});
