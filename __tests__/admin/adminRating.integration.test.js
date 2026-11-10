// Admin side of course ratings (docs/admin-panel-plan.md 12.5): summary and histogram, hiding a
// rating takes it out of the average and writes the audit log. Test users are deleted afterwards,
// which removes their ratings and lets the trigger restore the course's figures.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ar${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("admin course ratings (PostgreSQL)", () => {
    let sql, adminRatingService, coursePublicId, courseDbId;
    const users = [];
    const actor = { id: null, publicId: `${TAG}_admin`, rank: 80 };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ adminRatingService } = await import("@/services/adminRating.service"));
        const course = (await sql(
            `SELECT c.id::text AS id, c.public_id FROM catalog.course c
             WHERE c.is_deleted IS NOT TRUE AND NOT EXISTS (SELECT 1 FROM community.course_rating r WHERE r.course_id = c.id)
             ORDER BY c.id LIMIT 1`
        )).rows[0];
        courseDbId = course.id;
        coursePublicId = course.public_id;
        const newUser = async (publicId) => {
            const id = String(980000000000000 + Math.floor(Math.random() * 1e9));
            await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [id, publicId, `${publicId}@test.invalid`]);
            return id;
        };
        actor.id = await newUser(actor.publicId);
        for (const [index, stars] of [5, 4, 1].entries()) {
            const id = await newUser(`${TAG}_l${index}`);
            users.push({ id, publicId: `${TAG}_l${index}` });
            await sql(`INSERT INTO community.course_rating (user_id, course_id, milestone, stars) VALUES ($1, $2, 20, $3)`, [id, courseDbId, stars]);
        }
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("summarises the ratings with a 1-5 histogram", async () => {
        const data = await adminRatingService.get({ courseId: coursePublicId });
        expect(data).toMatchObject({ average: 3.33, count: 3, hidden: 0, recent: { average: 3.33, count: 3 } });
        expect(data.histogram.map((row) => row.count)).toEqual([1, 0, 0, 1, 1]);
        expect(data.items).toHaveLength(3);
    });

    it("hides a rating out of the average, audits it, and shows it again", async () => {
        const reason = "spam rating from a test account";
        await expect(adminRatingService.setHidden({ actor, courseId: coursePublicId, userId: users[2].publicId, hidden: true, reason })).resolves.toEqual({ changed: true });
        expect(await adminRatingService.get({ courseId: coursePublicId })).toMatchObject({ average: 4.5, count: 2, hidden: 1 });
        await expect(adminRatingService.setHidden({ actor, courseId: coursePublicId, userId: users[2].publicId, hidden: true, reason })).resolves.toEqual({ changed: false });
        await adminRatingService.setHidden({ actor, courseId: coursePublicId, userId: users[2].publicId, hidden: false, reason });
        expect(await adminRatingService.get({ courseId: coursePublicId })).toMatchObject({ average: 3.33, count: 3, hidden: 0 });

        const audit = (await sql(
            `SELECT action, target_id, after->>'hidden' AS hidden FROM identity.audit_log WHERE actor_id = $1 ORDER BY id`, [actor.id]
        )).rows;
        expect(audit).toEqual([
            { action: "rating.hide", target_id: coursePublicId, hidden: "true" },
            { action: "rating.show", target_id: coursePublicId, hidden: "false" },
        ]);
    });

    it("counts each learner once, with their latest milestone", async () => {
        const id = String(980000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [id, `${TAG}_m`, `${TAG}_m@test.invalid`]);
        // 20% -> 2 stars, then 50% -> 5 stars: only the 5 counts, next to the 5, 4 and 1 of the fixture.
        await sql(`INSERT INTO community.course_rating (user_id, course_id, milestone, stars) VALUES ($1, $2, 20, 2), ($1, $2, 50, 5)`, [id, courseDbId]);
        const course = (await sql(`SELECT rating_avg::float AS avg, rating_count AS n FROM catalog.course WHERE id = $1`, [courseDbId])).rows[0];
        expect(course).toEqual({ avg: 3.75, n: 4 });
        await sql(`DELETE FROM identity.users WHERE id = $1`, [id]);
    });

    it("answers 404 for an unknown course or a learner without a rating", async () => {
        await expect(adminRatingService.get({ courseId: `${TAG}-none` })).rejects.toMatchObject({ status: 404 });
        await expect(adminRatingService.setHidden({ actor, courseId: coursePublicId, userId: actor.publicId, hidden: true, reason: "no rating here at all" })).rejects.toMatchObject({ status: 404 });
    });
});
