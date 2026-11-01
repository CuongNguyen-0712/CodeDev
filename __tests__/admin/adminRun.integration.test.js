import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Admin code runs (docs/admin-panel-plan.md 04) against a real PostgreSQL. Throwaway rows only. */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ar${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("admin code runs (PostgreSQL)", () => {
    let sql, loadActor, adminRunService, userId, actor, challengeId;

    const insertRun = async (suffix, status, extra = "") => {
        const publicId = `${TAG}${suffix}`;
        await sql(
            `INSERT INTO challenge.code_runs (public_id, user_id, challenge_id, run_type, language, source_snapshot, status, deadline_at, queued_at ${extra ? ", started_at" : ""})
             VALUES ($1, $2, $3, 'manual', 'python', '{"code":"print(1)"}', $4, now() + interval '2 minutes', now() ${extra ? ", now()" : ""})`,
            [publicId, userId, challengeId, status]
        );
        return publicId;
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ loadActor } = await import("@/lib/authz"));
        ({ adminRunService } = await import("@/services/adminRun.service"));
        userId = String(970000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [userId, `${TAG}_u`, `${TAG}@test.invalid`]);
        await sql(`INSERT INTO identity.user_roles (user_id, role_id) SELECT $1, id FROM identity.roles WHERE code = 'admin'`, [userId]);
        actor = await loadActor(`${TAG}_u`);
        challengeId = (await sql(`SELECT id FROM challenge.challenges ORDER BY id LIMIT 1`)).rows[0]?.id;
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM challenge.code_runs WHERE public_id LIKE $1`, [`${TAG}%`]);
        await sql(`DELETE FROM identity.users WHERE id = $1`, [userId]);
    });

    it("lists active runs with the queue per sandbox", async () => {
        if (!challengeId) return;
        const runId = await insertRun("q", "queued");
        const page = await adminRunService.list({ tab: "active", userId: `${TAG}_u` });
        expect(page.items.map((row) => row.id)).toContain(runId);
        expect(page.counts.active).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(page.queue)).toBe(true);
        await sql(`DELETE FROM challenge.code_runs WHERE public_id = $1`, [runId]);
    });

    it("cancels a running run once; a second cancel or a late result changes nothing", async () => {
        if (!challengeId) return;
        const runId = await insertRun("r", "running", "started");
        expect(await adminRunService.cancel({ actor, runId, reason: "stuck in the sandbox" })).toEqual({ id: runId, status: "cancelled" });
        await expect(adminRunService.cancel({ actor, runId, reason: "stuck in the sandbox" })).rejects.toMatchObject({ status: 409 });

        const { codeRunDb } = await import("@/db/codeRun.db");
        expect(await codeRunDb.finish({ publicId: runId, status: "completed", result: { graded: [] } })).toBe(false);
        expect((await sql(`SELECT status FROM challenge.code_runs WHERE public_id = $1`, [runId])).rows[0].status).toBe("cancelled");
    });

    it("audits every read of the learner's code", async () => {
        if (!challengeId) return;
        const runId = await insertRun("s", "queued");
        const view = await adminRunService.source({ actor, runId });
        expect(view.code).toBe("print(1)");
        const audit = (await sql(`SELECT action FROM identity.audit_log WHERE target_type = 'code_run' AND target_id = $1`, [runId])).rows;
        expect(audit.map((row) => row.action)).toEqual(["submission.view"]);
        await sql(`DELETE FROM challenge.code_runs WHERE public_id = $1`, [runId]);
    });
});

describe.skipIf(!hasDb)("admin challenge status (PostgreSQL)", () => {
    it("updates status, publishing and points with an audit row, then restores them", async () => {
        const { sql } = await import("@/lib/db");
        const { adminChallengeService } = await import("@/services/adminChallenge.service");
        const challenge = (await sql(`SELECT public_id, status::text AS status, is_published, points FROM challenge.challenges WHERE is_deleted IS NOT TRUE ORDER BY id LIMIT 1`)).rows[0];
        if (!challenge) return;
        const actor = { id: null };
        const changed = await adminChallengeService.update({ actor, challengeId: challenge.public_id, input: { status: "closed", points: 7, reason: "integration test" } });
        expect(changed).toMatchObject({ status: "closed", points: 7, isPublished: challenge.is_published });
        await adminChallengeService.update({ actor, challengeId: challenge.public_id, input: { status: challenge.status, points: challenge.points, reason: "integration test restore" } });
        const audit = (await sql(`SELECT before, after FROM identity.audit_log WHERE target_type = 'challenge' AND target_id = $1 ORDER BY id DESC LIMIT 2`, [challenge.public_id])).rows;
        expect(audit[1].after).toMatchObject({ status: "closed", points: 7 });
    });
});
