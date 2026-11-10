// Course ratings (docs/admin-panel-plan.md 12, migration 20261103_012): the trigger keeps
// catalog.course.rating_avg / rating_count in step with the visible ratings. Runs in one transaction
// that is rolled back, on an existing course.
import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("course rating trigger (PostgreSQL)", () => {
    let client;
    let courseId;
    const users = [];

    const course = async () => (await client.query(
        `SELECT rating_avg::text AS avg, rating_count AS n FROM catalog.course WHERE id = $1`, [courseId]
    )).rows[0];
    // One milestone (20%) unless a test says otherwise: these cases are about one rating per learner.
    const rate = (user, stars, milestone = 20) => client.query(
        `INSERT INTO community.course_rating (user_id, course_id, milestone, stars) VALUES ($1, $2, $4, $3)
         ON CONFLICT (user_id, course_id, milestone) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now()`,
        [user, courseId, stars, milestone]
    );

    beforeAll(async () => {
        client = new pg.Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();
        await client.query("BEGIN");
        courseId = (await client.query(`SELECT id::text FROM catalog.course ORDER BY id LIMIT 1`)).rows[0].id;
        await client.query(`DELETE FROM community.course_rating WHERE course_id = $1`, [courseId]);
        const tag = crypto.randomBytes(3).toString("hex");
        for (let i = 0; i < 3; i += 1) {
            const id = String(970000000000000 + Math.floor(Math.random() * 1e9));
            await client.query(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`,
                [id, `cr${tag}${i}`, `cr${tag}${i}@test.invalid`]);
            users.push(id);
        }
    });

    afterAll(async () => {
        if (!client) return;
        await client.query("ROLLBACK");
        await client.end();
    });

    it("starts empty, then averages new ratings", async () => {
        expect(await course()).toEqual({ avg: null, n: 0 });
        await rate(users[0], 5);
        await rate(users[1], 4);
        expect(await course()).toEqual({ avg: "4.50", n: 2 });
    });

    it("keeps one rating per learner: changing it moves the average, not the count", async () => {
        await rate(users[1], 2);
        expect(await course()).toEqual({ avg: "3.50", n: 2 });
    });

    it("shows the public rating only from 3 ratings and always the count (migration 013)", async () => {
        const shown = async () => (await client.query(`SELECT rating::text AS rating, reviews::int AS reviews FROM catalog.course WHERE id = $1`, [courseId])).rows[0];
        expect(await shown()).toEqual({ rating: null, reviews: 2 });
        await rate(users[2], 1);
        expect(await shown()).toEqual({ rating: "2.67", reviews: 3 });
        await client.query(`DELETE FROM community.course_rating WHERE user_id = $1 AND course_id = $2`, [users[2], courseId]);
        expect(await shown()).toEqual({ rating: null, reviews: 2 });
    });

    it("leaves hidden ratings out and counts them again when shown", async () => {
        await rate(users[2], 1);
        expect(await course()).toEqual({ avg: "2.67", n: 3 });
        await client.query(`UPDATE community.course_rating SET is_hidden = true WHERE user_id = $1 AND course_id = $2`, [users[2], courseId]);
        expect(await course()).toEqual({ avg: "3.50", n: 2 });
        await client.query(`UPDATE community.course_rating SET is_hidden = false WHERE user_id = $1 AND course_id = $2`, [users[2], courseId]);
        expect(await course()).toEqual({ avg: "2.67", n: 3 });
    });

    it("recounts when a rating or its user is deleted, and refuses stars outside 1-5", async () => {
        await client.query(`DELETE FROM community.course_rating WHERE user_id = $1 AND course_id = $2`, [users[2], courseId]);
        expect(await course()).toEqual({ avg: "3.50", n: 2 });
        await client.query(`DELETE FROM identity.users WHERE id = $1`, [users[0]]);
        expect(await course()).toEqual({ avg: "2.00", n: 1 });
        await client.query("SAVEPOINT bad_stars");
        await expect(rate(users[1], 6)).rejects.toMatchObject({ code: "23514" });
        await client.query("ROLLBACK TO SAVEPOINT bad_stars");
    });
});
