import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * profile.notification (migration 20261104_017) against a real PostgreSQL: dedupe per fact,
 * read state scoped to the owner, unread filter and keyset paging. Fixtures are tagged and
 * removed in afterAll.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `nt${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

let sql, dbPool, notificationDb, notificationService, generateSonyflake;
const userIds = [];

async function makeUser(name) {
    const id = String(generateSonyflake());
    const publicId = `${TAG}_${name}`;
    await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $3, $4)`,
        [id, publicId, publicId, `${publicId}@test.invalid`]);
    await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'Test', $2)`, [id, name]);
    userIds.push(id);
    return { id, publicId };
}

const unread = async (user) => (await notificationDb.unreadCount({ userId: user.publicId })).rows[0].n;
const insert = (user, kind, dedupeKey, title = kind) =>
    notificationDb.insert({ userId: user.publicId, kind, title, message: "m", dedupeKey });

describe.skipIf(!hasDb)("notification inbox (PostgreSQL)", () => {
    let a, b;

    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        const ready = (await sql(`SELECT to_regclass('profile.notification') AS t,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'profile' AND table_name = 'notification' AND column_name = 'dedupe_key') AS migrated`)).rows[0];
        if (!ready.migrated) throw new Error("Run `npm run db:migrate` first (migration 20261104_017)");
        ({ notificationDb } = await import("@/db/notification.db"));
        ({ notificationService } = await import("@/services/notification.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));
        a = await makeUser("a");
        b = await makeUser("b");
    });

    afterAll(async () => {
        if (!dbPool) return;
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [userIds]);
    });

    it("writes one row per (user, kind, dedupe key)", async () => {
        expect((await insert(a, "level_up", "2")).rowCount).toBe(1);
        expect((await insert(a, "level_up", "2")).rowCount).toBe(0);
        expect((await insert(b, "level_up", "2")).rowCount).toBe(1);
        expect((await insert(a, "level_up", null)).rowCount).toBe(1); // no key: always a new row
        expect(await unread(a)).toBe(2);
        expect(await unread(b)).toBe(1);
    });

    it("marks only the caller's rows, by id or all", async () => {
        const { rows } = await notificationDb.list({ userId: a.publicId });
        expect(rows).toHaveLength(2);
        // b cannot mark a's row
        expect((await notificationDb.markRead({ userId: b.publicId, ids: [rows[0].id] })).rowCount).toBe(0);
        expect((await notificationDb.markRead({ userId: a.publicId, ids: [rows[0].id] })).rowCount).toBe(1);
        expect(await unread(a)).toBe(1);
        const unreadOnly = await notificationDb.list({ userId: a.publicId, unreadOnly: true });
        expect(unreadOnly.rows.map((r) => r.id)).toEqual([rows[1].id]);

        expect((await notificationDb.markAllRead({ userId: a.publicId })).rowCount).toBe(1);
        expect(await unread(a)).toBe(0);
        expect(await unread(b)).toBe(1);
        const readAt = await sql(`SELECT COUNT(*)::int AS n FROM profile.notification WHERE user_id = $1 AND read_at IS NOT NULL`, [a.id]);
        expect(readAt.rows[0].n).toBe(2);
    });

    it("dismissed rows leave the inbox and the count, and only for their owner", async () => {
        const row = (await insert(b, "course_completed", "dismiss-me")).rows[0];
        expect(await unread(b)).toBe(2);
        expect((await notificationDb.dismiss({ userId: a.publicId, ids: [row.id] })).rowCount).toBe(0);
        expect((await notificationDb.dismiss({ userId: b.publicId, ids: [row.id] })).rowCount).toBe(1);
        expect(await unread(b)).toBe(1);
        const { rows } = await notificationDb.list({ userId: b.publicId });
        expect(rows.map((r) => r.id)).not.toContain(row.id);
    });

    it("pages newest first with an opaque cursor", async () => {
        for (let i = 0; i < 25; i++) await insert(b, "achievement", `ach-${i}`, `Achievement ${i}`);
        const page1 = await notificationService.list({ userId: b.publicId });
        expect(page1.items).toHaveLength(20);
        expect(page1.hasMore).toBe(true);
        expect(page1.unreadCount).toBe(26);
        expect(page1.items[0].title).toBe("Achievement 24");
        expect(page1.items[0].createdAt).toBeInstanceOf(Date);

        const { decodeNotificationCursor } = await import("@/services/notification.service");
        const page2 = await notificationService.list({ userId: b.publicId, cursor: decodeNotificationCursor(page1.nextCursor) });
        expect(page2.items).toHaveLength(6);
        expect(page2.hasMore).toBe(false);
        expect(page2.nextCursor).toBeNull();
        const ids = [...page1.items, ...page2.items].map((n) => n.id);
        expect(new Set(ids).size).toBe(26);
    });
});
