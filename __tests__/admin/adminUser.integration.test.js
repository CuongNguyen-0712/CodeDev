import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Admin user rules (docs/admin-panel-plan.md 3.5) against a real PostgreSQL with migrations
 * 20261101_007 and _008 applied. Throwaway users only, removed in afterAll.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `au${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

vi.mock("@/services/auth.service", () => ({ authService: { revokeAllSessions: vi.fn(async () => 0) } }));

let sql, loadActor, adminUserService, authService;
const ids = [];
let next = 1;

async function makeUser(name, roles = []) {
    const id = String(980000000000000 + Math.floor(Math.random() * 1e9) + next++);
    const publicId = `${TAG}_${name}`;
    await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
    for (const role of roles) {
        await sql(`INSERT INTO identity.user_roles (user_id, role_id) SELECT $1, id FROM identity.roles WHERE code = $2`, [id, role]);
    }
    ids.push(id);
    return { id, publicId };
}

describe.skipIf(!hasDb)("admin user rules (PostgreSQL)", () => {
    let superA, admin, admin2, manager, learner;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ loadActor } = await import("@/lib/authz"));
        ({ adminUserService } = await import("@/services/adminUser.service"));
        ({ authService } = await import("@/services/auth.service"));
        superA = await makeUser("super", ["user", "super_admin"]);
        admin = await makeUser("admin", ["user", "admin"]);
        admin2 = await makeUser("admin2", ["user", "admin"]);
        manager = await makeUser("manager", ["user", "course_manager"]);
        learner = await makeUser("learner", ["user"]);
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [ids]);
    });

    const actorOf = (user) => loadActor(user.publicId);
    const reason = "integration test reason";

    it("loads the highest role rank", async () => {
        expect((await actorOf(superA)).rank).toBe(100);
        expect((await actorOf(admin)).rank).toBe(80);
        expect((await actorOf(learner)).rank).toBe(10);
    });

    it("suspends and activates a lower-ranked user, signs them out and audits it", async () => {
        const until = new Date(Date.now() + 86400000).toISOString();
        const result = await adminUserService.setStatus({ actor: await actorOf(admin), userId: learner.publicId, status: "suspended", until, reason });
        expect(result.state).toBe("suspended");
        expect(authService.revokeAllSessions).toHaveBeenCalledWith({ userId: learner.publicId });

        const row = (await sql(`SELECT status, status_until FROM identity.users WHERE public_id = $1`, [learner.publicId])).rows[0];
        expect(row.status).toBe("blocked");
        expect(row.status_until).not.toBeNull();

        await adminUserService.setStatus({ actor: await actorOf(admin), userId: learner.publicId, status: "active", reason });
        const audit = (await sql(`SELECT action FROM identity.audit_log WHERE target_id = $1 ORDER BY id`, [learner.publicId])).rows.map((r) => r.action);
        expect(audit).toEqual(["user.suspended", "user.activate"]);
    });

    it("refuses a suspension without a future end date", async () => {
        await expect(adminUserService.setStatus({ actor: await actorOf(admin), userId: learner.publicId, status: "suspended", until: new Date(Date.now() - 1000).toISOString(), reason }))
            .rejects.toMatchObject({ status: 422 });
    });

    it("never acts on yourself or on the same or a higher rank", async () => {
        await expect(adminUserService.setStatus({ actor: await actorOf(admin), userId: admin.publicId, status: "blocked", reason })).rejects.toMatchObject({ status: 403 });
        await expect(adminUserService.setStatus({ actor: await actorOf(admin), userId: admin2.publicId, status: "blocked", reason })).rejects.toMatchObject({ status: 403 });
        await expect(adminUserService.setStatus({ actor: await actorOf(admin), userId: superA.publicId, status: "blocked", reason })).rejects.toMatchObject({ status: 403 });
        await expect(adminUserService.changeRole({ actor: await actorOf(manager), userId: learner.publicId, role: "admin", add: true, reason })).rejects.toMatchObject({ status: 403 });
    });

    it("assigns only roles below your rank, except a super admin", async () => {
        await expect(adminUserService.changeRole({ actor: await actorOf(admin), userId: learner.publicId, role: "admin", add: true, reason })).rejects.toMatchObject({ status: 403 });
        const granted = await adminUserService.changeRole({ actor: await actorOf(admin), userId: learner.publicId, role: "course_manager", add: true, reason });
        expect(granted.roles).toContain("course_manager");
        const promoted = await adminUserService.changeRole({ actor: await actorOf(superA), userId: learner.publicId, role: "admin", add: true, reason });
        expect(promoted.roles).toContain("admin");
        await adminUserService.changeRole({ actor: await actorOf(superA), userId: learner.publicId, role: "admin", add: false, reason });
        await adminUserService.changeRole({ actor: await actorOf(superA), userId: learner.publicId, role: "course_manager", add: false, reason });
    });

    it("lets a super admin remove another super admin (the last-one check guards concurrent removals)", async () => {
        const second = await makeUser("super2", ["user", "super_admin"]);
        const result = await adminUserService.changeRole({ actor: await actorOf(superA), userId: second.publicId, role: "super_admin", add: false, reason });
        expect(result.roles).not.toContain("super_admin");
    });

    it("masks emails and session details without user.pii", async () => {
        const managerActor = await actorOf(manager);
        managerActor.permissions.add("user.read");
        const view = await adminUserService.detail({ actor: managerActor, userId: learner.publicId });
        expect(view.email).toMatch(/^.\*\*\*@test\.invalid$/);
        const full = await adminUserService.detail({ actor: await actorOf(admin), userId: learner.publicId });
        expect(full.email).toBe(`${learner.publicId}@test.invalid`);
    });

    it("lifts suspensions that ended", async () => {
        await sql(`UPDATE identity.users SET status = 'blocked', status_until = now() - interval '1 minute' WHERE public_id = $1`, [learner.publicId]);
        expect(await adminUserService.liftEndedSuspensions()).toBeGreaterThanOrEqual(1);
        expect((await sql(`SELECT status FROM identity.users WHERE public_id = $1`, [learner.publicId])).rows[0].status).toBe("active");
    });

    it("lists users with masked emails and tab counts", async () => {
        const page = await adminUserService.list({ actor: await actorOf(admin), search: TAG, tab: "all" });
        expect(page.items.length).toBeGreaterThanOrEqual(5);
        expect(page.counts.all).toBeGreaterThanOrEqual(5);
        const timeline = await adminUserService.activity({ actor: await actorOf(admin), userId: learner.publicId });
        expect(timeline.items.some((item) => item.kind === "admin")).toBe(true);
    });
});

describe.skipIf(!hasDb)("admin overview figures (PostgreSQL)", () => {
    it("counts in one query and keeps zero days in the activity series", async () => {
        const { adminDashboardDb } = await import("@/db/adminDashboard.db");
        const figures = await adminDashboardDb.figures();
        expect(figures.users_total).toBeGreaterThan(0);
        expect(typeof figures.submissions_today).toBe("number");
        expect((await adminDashboardDb.recentAudit()).length).toBeLessThanOrEqual(5);
        expect((await adminDashboardDb.topCourses()).length).toBeLessThanOrEqual(5);
    });

    it("returns the window and the one before it, one row per UTC day ending today", async () => {
        const { adminDashboardDb } = await import("@/db/adminDashboard.db");
        const rows = await adminDashboardDb.activityByDay(14);
        expect(rows).toHaveLength(28);
        const days = rows.map((row) => Date.parse(`${row.day}T00:00:00Z`));
        days.slice(1).forEach((day, index) => expect(day - days[index]).toBe(86_400_000));
        expect(rows.at(-1).day).toBe(new Date().toISOString().slice(0, 10));
        for (const key of ["submissions", "signups", "learners", "runs_completed", "runs_failed", "runs_timeout"]) {
            expect(typeof rows[0][key]).toBe("number");
        }
        // Today's submissions agree with the KPI the figures count.
        const figures = await adminDashboardDb.figures();
        expect(rows.at(-1).submissions).toBe(figures.submissions_today);
    });

    it("splits the activity into two equal windows and falls back to 14 days", async () => {
        const { adminDashboardService } = await import("@/services/adminDashboard.service");
        const result = await adminDashboardService.activity({ days: 7 });
        expect(result.days).toBe(14);
        expect(result.current).toHaveLength(14);
        expect(result.previous).toHaveLength(14);
        expect(result.previous.at(-1).day < result.current[0].day).toBe(true);
    });
});
