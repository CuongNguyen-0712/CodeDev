import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Leaderboards, privacy switches and public profiles against a real PostgreSQL
 * (DATABASE_URL, migration 20261019_001 applied). Throwaway users only, removed in afterAll.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `rk${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

let sql, dbPool, rankingDb, profileService, generateSonyflake;
const userIds = [];
let nextSource = 1;

const one = async (text, params) => (await sql(text, params)).rows[0];

async function makeUser(name) {
    const id = String(generateSonyflake());
    const publicId = `${TAG}_${name}`;
    await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $3, $4)`,
        [id, publicId, publicId, `${publicId}@test.invalid`]);
    await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'Test', $2)`, [id, name]);
    userIds.push(id);
    return { id, publicId };
}

const addExp = (user, amount) =>
    sql(`SELECT * FROM public.post_exp($1::bigint, $2::int, 'adjustment', NULL, NULL, NULL, NULL, 'ranking test')`, [user.id, amount]);
const addPoints = (user, amount, action = "credit", entryType = "earned") =>
    sql(`SELECT * FROM public.post_points($1::bigint, $2, $3, $4::bigint, 'lesson', $5::bigint)`,
        [user.id, action, entryType, amount, 900000000 + nextSource++]);

const ours = (rows) => rows.filter((row) => row.id.startsWith(TAG)).map((row) => row.id);
const standing = async (board, user) => (await rankingDb.getStanding({ board, userKey: user.publicId })).rows[0];

describe.skipIf(!hasDb)("ranking and public profiles (PostgreSQL)", () => {
    let a, b, c;

    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        const ready = await one(`SELECT to_regclass('profile.rank_tier') AS t`);
        if (!ready.t) throw new Error("Run `npm run db:migrate` first (migration 20261019_001)");
        ({ rankingDb } = await import("@/db/ranking.db"));
        ({ profileService } = await import("@/services/profile.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));

        a = await makeUser("a");
        b = await makeUser("b");
        c = await makeUser("c");
        // Far above real data so the three are the top of the EXP board.
        await addExp(a, 900000);
        await addExp(b, 900300);
        await addExp(c, 900300); // same score as b, reached later
    });

    afterAll(async () => {
        if (!dbPool) return;
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [userIds]);
    });

    it("orders a board by score, ties by who got there first", async () => {
        const top = (await rankingDb.getTop({ board: "exp", limit: 50 })).rows;
        expect(ours(top)).toEqual([b.publicId, c.publicId, a.publicId]);

        const [sb, sc, sa] = await Promise.all([standing("exp", b), standing("exp", c), standing("exp", a)]);
        expect(sc.position).toBe(sb.position + 1);
        expect(sa.position).toBe(sc.position + 1);
        expect(sa.tier_title).toBe("Master");
    });

    it("hides an opted-out learner from others but keeps their own position", async () => {
        const before = await standing("exp", a);
        await profileService.updatePrivacy(c.publicId, { showOnLeaderboard: false });

        const top = (await rankingDb.getTop({ board: "exp", limit: 50 })).rows;
        expect(ours(top)).toEqual([b.publicId, a.publicId]);
        expect((await standing("exp", a)).position).toBe(before.position - 1);

        const own = await standing("exp", c);
        expect(own.visible).toBe(false);
        expect(own.opted_out).toBe(true);
        expect(own.position).toBeGreaterThan(0);

        await profileService.updatePrivacy(c.publicId, { showOnLeaderboard: true });
    });

    it("returns the overall tier of listed learners who are on the leaderboard", async () => {
        await profileService.updatePrivacy(c.publicId, { showOnLeaderboard: false });
        const rows = (await rankingDb.getOverallTiers([a.publicId, c.publicId, "nobody"])).rows;
        expect(rows.map((row) => row.id)).toEqual([a.publicId]);
        expect(rows[0].tier_title).toBe("Legend");
        await profileService.updatePrivacy(c.publicId, { showOnLeaderboard: true });
    });

    it("counts earned points only: spending and adjustments do not change the points rank", async () => {
        await addPoints(a, 500);
        expect(Number((await standing("points", a)).score)).toBe(500);

        await addPoints(a, 200, "debit", "spent");
        await addPoints(a, 50, "credit", "adjusted");
        expect(Number((await standing("points", a)).score)).toBe(500);
    });

    it("scores the 30-day board from recent ledger entries only", async () => {
        const future = new Date(Date.now() + 60_000).toISOString();
        const s = (await rankingDb.getStanding({ board: "exp", since: future, userKey: a.publicId })).rows[0];
        expect(Number(s.score)).toBe(0);
        expect(s.position).toBeNull();
    });

    it("serves a public profile without private fields, and 404s hidden ones", async () => {
        const profile = await profileService.getPublicProfile(a.publicId);
        expect(profile).toMatchObject({ id: a.publicId, username: a.publicId, showLearning: false, courses: null });
        for (const key of ["email", "points", "phone", "surname", "name", "db_id"]) {
            expect(profile).not.toHaveProperty(key);
        }

        expect(await profileService.getPublicProfile(a.id)).toBeNull(); // internal id never resolves

        await profileService.updatePrivacy(a.publicId, { showProfile: false });
        expect(await profileService.getPublicProfile(a.publicId)).toBeNull();
        await profileService.updatePrivacy(a.publicId, { showProfile: true });
    });

    it("rejects privacy updates that are not booleans", async () => {
        await expect(profileService.updatePrivacy(a.publicId, { showProfile: "yes" })).rejects.toMatchObject({ status: 400 });
        await expect(profileService.updatePrivacy(a.publicId, {})).rejects.toMatchObject({ status: 400 });
    });
});
