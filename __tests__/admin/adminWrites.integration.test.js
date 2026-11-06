// Admin edits that had no success-path test: each one must change the database, write its audit row
// and read back the new value (docs/admin-panel-plan.md 13). Every change is undone afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `aw${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
// Picked in beforeAll: a course with an active points price (a draft first), since seed courses come and go.
let COURSE;
const reason = "admin write round-trip test";

describe.skipIf(!hasDb)("admin writes persist (PostgreSQL)", () => {
    let sql, adminService, adminUserService, adminOpsService, adminRunService;
    // Fixed too: the points ledger also records who credited the points (created_by).
    const actor = { id: null, publicId: "adminwrites_test_admin", rank: 80, permissions: new Set() };
    // Point transactions are append-only, so a credited user can never be deleted: one fixed local
    // test learner is reused across runs and the tests compare balances before and after.
    const learner = { id: null, publicId: "adminwrites_test_learner" };
    let course;

    // The newest row of this run (the actor is reused across runs).
    const auditFor = async (action) => (await sql(
        `SELECT action, target_id, before, after FROM identity.audit_log
         WHERE actor_id = $1 AND action = $2 AND created_at > now() - interval '5 minutes' ORDER BY id DESC LIMIT 1`, [actor.id, action]
    )).rows[0];

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ adminService } = await import("@/services/admin.service"));
        ({ adminUserService } = await import("@/services/adminUser.service"));
        ({ adminOpsService } = await import("@/services/adminOps.service"));
        ({ adminRunService } = await import("@/services/adminRun.service"));
        course = (await sql(
            `SELECT c.id::text AS id, c.public_id, c.level::text AS level, c.publish_status::text AS status,
                    (SELECT amount::int FROM commerce.offer o WHERE o.course_id = c.id AND o.is_active AND o.price_type = 'points') AS points
             FROM catalog.course c
             WHERE c.is_deleted IS NOT TRUE AND EXISTS (SELECT 1 FROM commerce.offer o WHERE o.course_id = c.id AND o.is_active AND o.price_type = 'points')
             ORDER BY (c.publish_status = 'draft') DESC, c.id LIMIT 1`
        )).rows[0];
        COURSE = course?.public_id;
        for (const user of [actor, learner]) {
            user.id = (await sql(`SELECT id::text FROM identity.users WHERE public_id = $1`, [user.publicId])).rows[0]?.id;
            if (!user.id) {
                user.id = String(995000000000000 + Math.floor(Math.random() * 1e9));
                await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [user.id, user.publicId, `${user.publicId}@test.invalid`]);
            }
        }
        await sql(`INSERT INTO profile.info (user_id, name, surname) VALUES ($1, 'Write', 'Test') ON CONFLICT DO NOTHING`, [learner.id]);
    });

    afterAll(async () => {
        if (!sql || !course) return;
        // Restore the course exactly as it was.
        await sql(`UPDATE catalog.course SET level = $2::level_enum, publish_status = $3::publish_status_enum WHERE id = $1`, [course.id, course.level, course.status]).catch(() => {});
    });

    it("saves course metadata and publishing, with before / after in the audit log", async () => {
        const level = course.level === "advanced" ? "expert" : "advanced";
        const updated = await adminService.updateCourse({ actor, courseId: COURSE, input: { level, reason } });
        expect(updated.level).toBe(level);
        expect((await sql(`SELECT level::text FROM catalog.course WHERE id = $1`, [course.id])).rows[0].level).toBe(level);
        expect(await auditFor("course.update")).toMatchObject({ target_id: COURSE, before: { level: course.level }, after: { level } });

        const next = course.status === "published" ? "draft" : "published";
        await adminService.setPublishStatus({ actor, courseId: COURSE, status: next, reason });
        expect((await sql(`SELECT publish_status::text AS s FROM catalog.course WHERE id = $1`, [course.id])).rows[0].s).toBe(next);
        await adminService.setPublishStatus({ actor, courseId: COURSE, status: course.status, reason });
        await adminService.updateCourse({ actor, courseId: COURSE, input: { level: course.level, reason } });
    });

    it("saves a new points price and puts the old one back", async () => {
        const amount = (course.points || 100) + 1;
        await adminService.setOffer({ actor, courseId: COURSE, input: { priceType: "points", amount, reason } });
        const active = async () => (await sql(`SELECT amount::int FROM commerce.offer WHERE course_id = $1 AND is_active AND price_type = 'points'`, [course.id])).rows;
        expect(await active()).toEqual([{ amount }]);
        expect(await auditFor("offer.set")).toMatchObject({ target_id: COURSE });
        if (course.points) await adminService.setOffer({ actor, courseId: COURSE, input: { priceType: "points", amount: course.points, reason } });
        else await adminService.removeOffer({ actor, courseId: COURSE, priceType: "points", reason });
        expect(await active()).toEqual(course.points ? [{ amount: course.points }] : []);
    });

    it("credits points and EXP to a learner", async () => {
        const balance = async () => (await sql(`SELECT COALESCE(points, 0)::int AS points, exp::int AS exp FROM profile.info WHERE user_id = $1`, [learner.id])).rows[0];
        const before = await balance();
        const points = await adminService.adjustPoints({ actor, input: { userId: learner.publicId, amount: 25, reason, idempotencyKey: `${TAG}-points` } });
        expect(points.balanceAfter).toBe(before.points + 25);
        await adminService.adjustExperience({ actor, input: { userId: learner.publicId, amount: 40, reason, idempotencyKey: `${TAG}-exp` } });
        expect(await balance()).toEqual({ points: before.points + 25, exp: before.exp + 40 });
    });

    it("grants and revokes course access", async () => {
        await adminService.grantEntitlement({ actor, input: { userId: learner.publicId, courseId: COURSE, reason } });
        const rows = async () => (await sql(
            `SELECT public_id, status::text FROM commerce.entitlement WHERE user_id = $1 AND course_id = $2 ORDER BY granted_at DESC`, [learner.id, course.id]
        )).rows;
        const [granted] = await rows();
        expect(granted.status).toBe("active");
        await adminService.revokeEntitlement({ actor, input: { entitlementId: granted.public_id, reason } });
        expect((await rows())[0].status).toBe("revoked");
        expect(await auditFor("entitlement.revoke")).toMatchObject({ target_id: learner.publicId });
    });

    it("signs a learner out of every session", async () => {
        const sessionId = String(996000000000000 + Math.floor(Math.random() * 1e9));
        await sql(
            `INSERT INTO identity.sessions (id, user_id, expires_at, idle_expires_at, absolute_expires_at)
             VALUES ($1, $2, now() + interval '1 day', now() + interval '1 day', now() + interval '1 day')`, [sessionId, learner.id]
        );
        await adminUserService.revokeSessions({ actor, userId: learner.publicId, reason });
        const session = (await sql(`SELECT revoked_at IS NOT NULL OR is_revoked IS TRUE AS revoked FROM identity.sessions WHERE id = $1`, [sessionId])).rows[0];
        expect(session.revoked).toBe(true);
    });

    it("resolves a dead letter and records the closing of expired runs", async () => {
        const id = (await sql(
            `INSERT INTO ops.dead_letters (source, kind, ref, error) VALUES ('test', $1, $1, 'write round-trip') RETURNING id::text AS id`, [TAG]
        )).rows[0].id;
        try {
            await adminOpsService.resolve({ actor, id, reason });
            expect((await sql(`SELECT resolved_at IS NOT NULL AS done, resolution FROM ops.dead_letters WHERE id = $1`, [id])).rows[0]).toEqual({ done: true, resolution: reason });
        } finally {
            await sql(`DELETE FROM ops.dead_letters WHERE id = $1`, [id]);
        }
        const { closed } = await adminRunService.expireAll({ actor, reason });
        expect(typeof closed).toBe("number");
        expect(await auditFor("coderun.expire_all")).toMatchObject({ after: { closed } });
    });
});
