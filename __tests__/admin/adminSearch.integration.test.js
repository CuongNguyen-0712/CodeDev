import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Admin search and list filters against a real PostgreSQL: the Ctrl+K groups per permission,
 * LIKE wildcard escaping, and the orders / audit / users filters. Throwaway rows, removed in
 * afterAll (audit rows stay: the log is append-only).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `as${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

vi.mock("@/services/auth.service", () => ({ authService: { revokeAllSessions: vi.fn(async () => 0) } }));

let sql, loadActor, adminSearchService, adminService, adminAuditService, adminUserService;
const userIds = [];
let courseId;
let next = 1;

async function makeUser(name, roles = [], createdAt = null) {
    const id = String(970000000000000 + Math.floor(Math.random() * 1e9) + next++);
    const publicId = `${TAG}_${name}`;
    await sql(
        `INSERT INTO identity.users (id, public_id, username, email, email_verified, created_at) VALUES ($1, $2, $2, $3, true, COALESCE($4::timestamp, now()))`,
        [id, publicId, `${publicId}@test.invalid`, createdAt]
    );
    for (const role of roles) {
        await sql(`INSERT INTO identity.user_roles (user_id, role_id) SELECT $1, id FROM identity.roles WHERE code = $2`, [id, role]);
    }
    userIds.push(id);
    return { id, publicId };
}

async function makeOrder(user, suffix, status, createdAt) {
    const { rows } = await sql(
        `INSERT INTO commerce.orders (public_id, user_id, status, created_at) VALUES ($1, $2, $3::public.order_status, $4::timestamp) RETURNING id`,
        [`${TAG}-${suffix}`, user.id, status, createdAt]
    );
    await sql(`INSERT INTO commerce.order_items (order_id, course_id) VALUES ($1, $2)`, [rows[0].id, courseId]);
    return `${TAG}-${suffix}`;
}

describe.skipIf(!hasDb)("admin search and list filters (PostgreSQL)", () => {
    let admin, manager, buyer, early, late;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ loadActor } = await import("@/lib/authz"));
        ({ adminSearchService } = await import("@/services/adminSearch.service"));
        ({ adminService } = await import("@/services/admin.service"));
        ({ adminAuditService } = await import("@/services/adminAudit.service"));
        ({ adminUserService } = await import("@/services/adminUser.service"));
        admin = await makeUser("admin", ["user", "admin"]);
        manager = await makeUser("manager", ["user", "course_manager"]);
        buyer = await makeUser("buyer", ["user"]);
        early = await makeUser("early", ["user"], "2020-01-15 10:00:00");
        late = await makeUser("late", ["user"], "2020-03-15 10:00:00");
        courseId = (await sql(
            `INSERT INTO catalog.course (title, concept, description, instructor, public_id, language_id, category_id, level, access_model, publish_status)
             VALUES ($1, 'test', 'test', 'Test', $2, (SELECT MIN(id) FROM catalog.language), (SELECT MIN(id) FROM catalog.category), 'beginner', 'free', 'draft')
             RETURNING id`,
            [`Search ${TAG} 100% done`, `${TAG}-course`]
        )).rows[0].id;
        await makeOrder(buyer, "o1", "completed", "2021-05-10 12:00:00");
        await makeOrder(buyer, "o2", "refunded", "2021-06-20 12:00:00");
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM commerce.orders WHERE user_id = ANY($1::bigint[])`, [userIds]);
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [userIds]);
        if (courseId) await sql(`DELETE FROM catalog.course WHERE id = $1`, [courseId]);
    });

    const actorOf = (user) => loadActor(user.publicId);
    const types = (result) => result.groups.map((group) => group.type);

    it("returns users, courses and orders to an admin, at most 5 per group", async () => {
        const result = await adminSearchService.search({ actor: await actorOf(admin), q: TAG });
        expect(types(result)).toEqual(expect.arrayContaining(["user", "course", "order"]));
        for (const group of result.groups) expect(group.items.length).toBeLessThanOrEqual(5);
        const exact = await adminSearchService.search({ actor: await actorOf(admin), q: buyer.publicId, type: "user" });
        expect(exact.groups[0].items[0]).toMatchObject({ id: buyer.publicId, label: buyer.publicId });
    });

    it("gives a course manager no users or orders group", async () => {
        const actor = await actorOf(manager);
        const result = await adminSearchService.search({ actor, q: TAG });
        expect(types(result)).toContain("course");
        expect(types(result)).not.toContain("user");
        expect(types(result)).not.toContain("order");
        expect((await adminSearchService.search({ actor, q: TAG, type: "user" })).groups).toEqual([]);
    });

    it("treats % and _ in the query as plain characters", async () => {
        const actor = await actorOf(admin);
        const literal = await adminSearchService.search({ actor, q: `${TAG} 100%`, type: "course" });
        expect(literal.groups[0]?.items.map((item) => item.id)).toEqual([`${TAG}-course`]);
        expect((await adminSearchService.search({ actor, q: `${TAG}%done`, type: "course" })).groups).toEqual([]);
        expect((await adminSearchService.search({ actor, q: `${TAG}%`, type: "user" })).groups).toEqual([]);
        expect((await adminSearchService.search({ actor, q: `${TAG.slice(0, -1)}_`, type: "user" })).groups).toEqual([]);
    });

    it("needs 2 characters and cuts the query to 100", async () => {
        const actor = await actorOf(admin);
        expect(await adminSearchService.search({ actor, q: " a " })).toEqual({ q: "a", groups: [] });
        expect((await adminSearchService.search({ actor, q: `  ${"x".repeat(150)}` })).q).toHaveLength(100);
    });

    it("finds a run by its exact id or an id suffix of 8+ characters", async () => {
        const run = (await sql(`SELECT public_id FROM challenge.code_runs ORDER BY id DESC LIMIT 1`)).rows[0];
        if (!run) return; // no run in this database to look for
        const actor = await actorOf(admin);
        const ids = async (q) => (await adminSearchService.search({ actor, q, type: "run" })).groups[0]?.items.map((item) => item.id) || [];
        expect(await ids(run.public_id)).toContain(run.public_id);
        expect(await ids(run.public_id.slice(-8))).toContain(run.public_id);
        expect(await ids(run.public_id.slice(-7))).not.toContain(run.public_id);
    });

    it("filters orders by id, buyer, status and date range", async () => {
        const ids = async (filters) => (await adminService.listOrders(filters)).map((order) => order.id);
        expect(await ids({ q: `${TAG}-o1` })).toEqual([`${TAG}-o1`]);
        expect(await ids({ q: buyer.publicId })).toEqual([`${TAG}-o2`, `${TAG}-o1`]);
        expect(await ids({ q: buyer.publicId, status: "refunded" })).toEqual([`${TAG}-o2`]);
        expect(await ids({ q: buyer.publicId, from: "2021-06-01" })).toEqual([`${TAG}-o2`]);
        expect(await ids({ q: buyer.publicId, to: "2021-05-10" })).toEqual([`${TAG}-o1`]);
        expect(await ids({ q: `${TAG}%` })).toEqual([]);
    });

    it("searches audit entries by action, target id and actor username", async () => {
        await sql(
            `INSERT INTO identity.audit_log (actor_id, action, target_type, target_id, reason) VALUES ($1, 'search.test', 'user', $2, 'integration test')`,
            [admin.id, `${TAG}-target`]
        );
        const actor = await actorOf(admin);
        const find = async (q) => (await adminAuditService.list({ actor, filters: { q, range: "all" } })).items.filter((item) => item.target_id === `${TAG}-target`);
        expect(await find(`${TAG}-target`)).toHaveLength(1);
        expect(await find(admin.publicId)).toHaveLength(1);
        expect((await find("search.test")).length).toBe(1);
        expect(await find(`${TAG}-targe_`)).toHaveLength(0);
    });

    it("filters users by joined date and pages in each sort order", async () => {
        const actor = await actorOf(admin);
        const joined = await adminUserService.list({ actor, search: TAG, joinedFrom: "2020-01-01", joinedTo: "2020-02-01" });
        expect(joined.items.map((item) => item.id)).toEqual([early.publicId]);

        for (const sort of ["newest", "oldest", "seen"]) {
            const seen = [];
            let cursor = null;
            do {
                const page = await adminUserService.list({ actor, search: TAG, sort, cursor, limit: 2 });
                seen.push(...page.items.map((item) => item.id));
                cursor = page.nextCursor;
            } while (cursor);
            expect(new Set(seen).size).toBe(5);
            expect(seen).toHaveLength(5);
            if (sort === "oldest") expect(seen.slice(0, 2)).toEqual([early.publicId, late.publicId]);
            if (sort === "newest") expect(seen.slice(-2)).toEqual([late.publicId, early.publicId]);
        }
    });
});
