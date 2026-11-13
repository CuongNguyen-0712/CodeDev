// Friend table schema against real PostgreSQL (migrations 027 and 028).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TAG = `fsc${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!process.env.DATABASE_URL)("friend schema (PostgreSQL)", () => {
    let sql, n = 0;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
    });

    afterAll(async () => {
        if (sql) await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]).catch((error) => console.error("[friend schema cleanup]", error));
    });

    it("friend indexes exist and the old receiver and sender indexes are gone", async () => {
        const { rows } = await sql(`SELECT indexname FROM pg_indexes WHERE schemaname = 'community' AND tablename = 'friend'`);
        const names = rows.map((r) => r.indexname);
        expect(names).toEqual(expect.arrayContaining(["idx_friend_receiver_state", "idx_friend_sender_state", "uq_friend_pair"]));
        expect(names).not.toContain("idx_friend_receiver");
        expect(names).not.toContain("idx_friend_sender");
    });

    it("updated_at is NOT NULL (invitation keyset paging on (updated_at, id))", async () => {
        const { rows } = await sql(
            `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'community' AND table_name = 'friend' AND column_name = 'updated_at'`);
        expect(rows[0].is_nullable).toBe("NO");
    });

    it("the 028 cleanup statement deletes friend rows of blocked pairs, in either direction, and nothing else", async () => {
        const migration = fs.readFileSync(path.join(process.cwd(), "db/migrations/20261113_028_friend_cleanup.sql"), "utf-8");
        const cleanup = migration.match(/DELETE FROM community\.friend[\s\S]*?;/)[0];
        const newUser = async () => {
            const publicId = `${TAG}_${n++}`;
            const id = String(977000000000000 + Math.floor(Math.random() * 1e9));
            await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified, status) VALUES ($1, $2, $2, $3, true, 'active')`, [id, publicId, `${publicId}@test.invalid`]);
            return id;
        };
        const [a, b, c, d, e, f] = [await newUser(), await newUser(), await newUser(), await newUser(), await newUser(), await newUser()];
        // Bypass the service: legacy rows that chatService.block would have deleted.
        await sql(`INSERT INTO community.friend (sender_id, receiver_id, status) VALUES ($1, $2, 'accepted'), ($3, $4, 'pending'), ($5, $6, 'accepted')`, [a, b, c, d, e, f]);
        await sql(`INSERT INTO community.user_block (blocker_id, blocked_id) VALUES ($1, $2), ($3, $4)`, [a, b, d, c]);

        await sql(cleanup);

        const { rows } = await sql(`SELECT sender_id::text AS sender FROM community.friend WHERE sender_id = ANY($1::bigint[])`, [[a, c, e]]);
        expect(rows).toEqual([{ sender: e }]);
    });
});
