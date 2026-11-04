import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin announcements (migration 20261104_018) against a real PostgreSQL: each audience type
 * selects the right active accounts, a send writes one copy per person even when a batch runs
 * twice, and a retraction takes every copy out of the inboxes. Fixtures are tagged and removed.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `an${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

let sql, dbPool, withTransaction, announcementDb, announcementService, generateSonyflake;
const userIds = [];
const announcementIds = [];
let course;

async function makeUser(name, { status = "active" } = {}) {
    const id = String(generateSonyflake());
    const publicId = `${TAG}_${name}`;
    await sql(`INSERT INTO identity.users (id, public_id, username, email, status) VALUES ($1, $2, $3, $4, $5)`,
        [id, publicId, publicId, `${publicId}@test.invalid`, status]);
    await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'Test', $2)`, [id, name]);
    userIds.push(id);
    return { id, publicId };
}

const create = (audience) => withTransaction(async (client) => {
    const row = await announcementDb.create(client, { title: `T ${TAG}`, body: "Body", link: "/home", audience, sendAt: null, createdBy: null });
    announcementIds.push(row.id);
    return row;
});
const copies = async (id) => (await sql(
    `SELECT n.is_deleted, u.public_id FROM profile.notification n JOIN identity.users u ON u.id = n.user_id
     WHERE n.kind = 'announcement' AND n.dedupe_key = $1 ORDER BY u.public_id`, [id])).rows;

describe.skipIf(!hasDb)("admin announcements (PostgreSQL)", () => {
    let a, b, suspended;

    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        const ready = (await sql(`SELECT to_regclass('ops.announcement') AS t`)).rows[0];
        if (!ready.t) throw new Error("Run `npm run db:migrate` first (migration 20261104_018)");
        ({ withTransaction } = await import("@/lib/dbTransaction"));
        ({ announcementDb } = await import("@/db/announcement.db"));
        ({ announcementService } = await import("@/services/announcement.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));

        a = await makeUser("a");
        b = await makeUser("b");
        suspended = await makeUser("s", { status: "blocked" });
        await sql(`INSERT INTO identity.user_roles (user_id, role_id) SELECT $1, id FROM identity.roles WHERE code = 'instructor'`, [a.id]);
        course = (await sql(
            `INSERT INTO catalog.course (title, concept, description, instructor, public_id, language_id, category_id, level, access_model, publish_status)
             VALUES ($1, 'test', 'test', 'Test', $2, (SELECT MIN(id) FROM catalog.language), (SELECT MIN(id) FROM catalog.category), 'beginner', 'free', 'published')
             RETURNING id, public_id`, [`Ann ${TAG}`, `${TAG}-course`])).rows[0];
        await sql(`INSERT INTO learning.register (user_id, course_id) VALUES ($1, $2), ($3, $2)`, [b.id, course.id, suspended.id]);
    });

    afterAll(async () => {
        if (!dbPool) return;
        await sql(`DELETE FROM profile.notification WHERE kind = 'announcement' AND dedupe_key = ANY($1::text[])`, [announcementIds]);
        await sql(`DELETE FROM ops.announcement WHERE id = ANY($1::uuid[])`, [announcementIds]);
        if (course) {
            await sql(`DELETE FROM learning.register WHERE course_id = $1`, [course.id]);
            await sql(`DELETE FROM catalog.course WHERE id = $1`, [course.id]);
        }
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [userIds]);
    });

    it("counts only active accounts in each audience", async () => {
        expect(await announcementDb.countAudience({ type: "users", userIds: [a.publicId, b.publicId, suspended.publicId] })).toBe(2);
        expect(await announcementDb.countAudience({ type: "course", courseId: course.public_id })).toBe(1);
        const instructors = await announcementDb.countAudience({ type: "role", roles: ["instructor"] });
        expect(instructors).toBeGreaterThanOrEqual(1);
    });

    it("sends one copy per recipient, even when a batch runs twice", async () => {
        const row = await create({ type: "users", userIds: [a.publicId, b.publicId, suspended.publicId] });
        const started = await announcementDb.startSending(row.id);
        const first = await announcementDb.deliverBatch({ announcement: started, afterId: "0", limit: 1000 });
        const again = await announcementDb.deliverBatch({ announcement: started, afterId: "0", limit: 1000 });
        expect(first).toMatchObject({ selected: 2, inserted: 2 });
        expect(again).toMatchObject({ selected: 2, inserted: 0 });

        const done = await announcementDb.finishSending(row.id);
        expect(done.recipients).toBe(2);
        expect((await copies(row.id)).map((c) => c.public_id)).toEqual([a.publicId, b.publicId]);
    });

    it("pages through users in small batches", async () => {
        const row = await create({ type: "users", userIds: [a.publicId, b.publicId] });
        const started = await announcementDb.startSending(row.id);
        const one = await announcementDb.deliverBatch({ announcement: started, afterId: "0", limit: 1 });
        const two = await announcementDb.deliverBatch({ announcement: started, afterId: one.lastId, limit: 1 });
        const three = await announcementDb.deliverBatch({ announcement: started, afterId: two.lastId, limit: 1 });
        expect([one.inserted, two.inserted, three.selected]).toEqual([1, 1, 0]);
    });

    it("delivers inline, then a retraction removes every copy", async () => {
        const row = await create({ type: "course", courseId: course.public_id });
        expect(await announcementService.deliver(row.id)).toEqual({ id: row.id, recipients: 1 });
        expect(await copies(row.id)).toEqual([{ is_deleted: false, public_id: b.publicId }]);

        await announcementService.retract({ actor: { id: null }, id: row.id, reason: "test" });
        expect(await copies(row.id)).toEqual([{ is_deleted: true, public_id: b.publicId }]);
        expect((await announcementDb.get(row.id)).status).toBe("retracted");
    });

    it("a cancelled announcement never starts", async () => {
        const row = await create({ type: "users", userIds: [a.publicId] });
        await announcementService.cancel({ actor: { id: null }, id: row.id });
        expect(await announcementDb.startSending(row.id)).toBeNull();
        expect(await copies(row.id)).toEqual([]);
    });
});
