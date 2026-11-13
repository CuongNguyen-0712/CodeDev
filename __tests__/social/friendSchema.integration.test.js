// Friend table indexes against real PostgreSQL (migration 027).
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.DATABASE_URL)("friend schema (PostgreSQL)", () => {
    it("friend indexes exist and the old receiver index is gone", async () => {
        const { sql } = await import("@/lib/db");
        const { rows } = await sql(`SELECT indexname FROM pg_indexes WHERE schemaname = 'community' AND tablename = 'friend'`);
        const names = rows.map((r) => r.indexname);
        expect(names).toEqual(expect.arrayContaining(["idx_friend_receiver_state", "idx_friend_sender_state", "uq_friend_pair"]));
        expect(names).not.toContain("idx_friend_receiver");
    });
});
