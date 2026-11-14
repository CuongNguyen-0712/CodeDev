// team_members.joined_at column, its index and the migration's backfill, against real PostgreSQL.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ts${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const migrationsDir = path.join(process.cwd(), "db", "migrations");

describe.skipIf(!hasDb)("team_members joined_at (PostgreSQL)", () => {
    let sql;
    const userId = String(975000000000000 + Math.floor(Math.random() * 1e9));
    const teamId = `${TAG}t`;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
    });

    afterAll(async () => {
        if (!sql) return;
        const run = (text, params) => sql(text, params).catch((error) => console.error("[team schema test cleanup]", error));
        await run(`DELETE FROM community.team WHERE id = $1`, [teamId]);
        await run(`DELETE FROM identity.users WHERE id = $1`, [userId]);
    });

    it("team_members has joined_at and the joined index", async () => {
        const col = await sql(`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'community' AND table_name = 'team_members' AND column_name = 'joined_at'`);
        expect(col.rows).toEqual([{ is_nullable: "YES" }]);
        const idx = await sql(`SELECT 1 FROM pg_indexes WHERE schemaname = 'community' AND tablename = 'team_members' AND indexname = 'idx_team_members_team_joined'`);
        expect(idx.rows).toHaveLength(1);
    });

    it("existing approved rows get joined_at backfilled", async () => {
        const file = fs.readdirSync(migrationsDir).find((f) => f.endsWith("_team_members_joined_at.sql"));
        const backfill = fs.readFileSync(path.join(migrationsDir, file), "utf8").match(/UPDATE community\.team_members[\s\S]*?;/)[0];

        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified, status) VALUES ($1, $2, $2, $3, true, 'active')`, [userId, TAG, `${TAG}@test.invalid`]);
        await sql(`INSERT INTO community.team (id, name, size, host_id) VALUES ($1, 'Schema test', 5, $2)`, [teamId, userId]);
        await sql(`INSERT INTO community.team_members (team_id, user_id, status, created_at, updated_at, joined_at) VALUES ($1, $2, 'approved', '2026-01-01', '2026-02-02', NULL)`, [teamId, userId]);

        await sql(backfill);

        const { rows } = await sql(`SELECT joined_at = updated_at AS ok FROM community.team_members WHERE team_id = $1`, [teamId]);
        expect(rows).toEqual([{ ok: true }]);
    });
});
