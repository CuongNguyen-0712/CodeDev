import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Keyset pages (docs/api-conventions.md): comments on (created_at, id) and the people search on
 * (username, id). Rows that share a sort value must neither repeat nor go missing across pages.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ks${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

let sql, courseService, socialService, generateSonyflake;
const userIds = [];
let course, viewer;

async function makeUser(name) {
    const id = String(generateSonyflake());
    const publicId = `${TAG}_${name}`;
    await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [id, publicId, `${publicId}@test.invalid`]);
    await sql(`INSERT INTO profile.info (user_id, surname, name, show_profile) VALUES ($1, 'Test', $2, true)`, [id, name]);
    userIds.push(id);
    return { id, publicId };
}

describe.skipIf(!hasDb)("keyset pagination (PostgreSQL)", () => {
    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ courseService } = await import("@/services/course.service"));
        ({ socialService } = await import("@/services/social.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));

        course = (await sql(
            `INSERT INTO catalog.course (title, concept, description, instructor, public_id, language_id, category_id, level, access_model, publish_status)
             VALUES ($1, 'test', 'test', 'Test', $2, (SELECT MIN(id) FROM catalog.language), (SELECT MIN(id) FROM catalog.category), 'beginner', 'free', 'published')
             RETURNING id, public_id`,
            [`KS ${TAG}`, `${TAG}-course`]
        )).rows[0];
        viewer = await makeUser("viewer");
        // 45 comments, all with the same timestamp: only the id orders them.
        await sql(
            `INSERT INTO community.comment (user_id, reference_id, content, created_at)
             SELECT $1, $2, 'c' || g, '2026-01-01 10:00:00.123456' FROM generate_series(1, 45) g`,
            [viewer.id, course.id]
        );
        for (let i = 0; i < 12; i++) await makeUser(`p${String(i).padStart(2, "0")}`);
    });

    afterAll(async () => {
        if (!sql) return;
        if (course) await sql(`DELETE FROM community.comment WHERE reference_id = $1`, [course.id]);
        await sql(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [userIds]);
        if (course) await sql(`DELETE FROM catalog.course WHERE id = $1`, [course.id]);
    });

    it("walks every comment once across pages", async () => {
        const seen = [];
        let cursor = null;
        do {
            const page = await courseService.getComments({ courseId: course.public_id, cursor });
            seen.push(...page.items.map((c) => c.id));
            cursor = page.nextCursor ? (await import("@/services/course.service")).decodeCommentCursor(page.nextCursor) : null;
        } while (cursor);
        expect(seen).toHaveLength(45);
        expect(new Set(seen).size).toBe(45);
    });

    it("walks every matching user once across pages", async () => {
        const seen = [];
        let cursor = null;
        do {
            const page = await socialService.searchUsers({ userId: viewer.publicId, search: `${TAG}_p`, limit: 5, cursor });
            seen.push(...page.items.map((u) => u.id));
            cursor = page.nextCursor;
        } while (cursor);
        expect(seen).toHaveLength(12);
        expect(new Set(seen).size).toBe(12);
        expect(seen).toEqual([...seen].sort());
    });

    it("rejects a forged cursor with 400", async () => {
        await expect(socialService.searchUsers({ userId: viewer.publicId, search: "", cursor: "not-a-cursor" }))
            .rejects.toMatchObject({ status: 400 });
    });
});
