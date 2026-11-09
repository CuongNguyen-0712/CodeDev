// Community blog tables (community.post, post_asset) and the blog.moderate permission.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `bs${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("blog schema (PostgreSQL)", () => {
    let sql, authorId;
    let n = 0;

    const insertPost = (overrides = {}) => {
        const k = `${TAG}_${n++}`;
        const row = { status: "draft", tags: "{a}", ...overrides };
        return sql(
            `INSERT INTO community.post (public_id, author_id, slug, title, excerpt, body_md, tags, status)
             VALUES ($1, $2, $1, 't', 'e', 'b', $3, $4) RETURNING id::text AS id`,
            [k, authorId, row.tags, row.status]
        );
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        authorId = String(980000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [authorId, `${TAG}_u`, `${TAG}_u@test.invalid`]);
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM storage.assets WHERE public_id LIKE $1`, [`${TAG}%`]);
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("rejects an unknown status", async () => {
        await expect(insertPost({ status: "archived" })).rejects.toMatchObject({ code: "23514" });
    });

    it("rejects six tags", async () => {
        await expect(insertPost({ tags: "{a,b,c,d,e,f}" })).rejects.toMatchObject({ code: "23514" });
    });

    it("cascades post_asset when the post is deleted", async () => {
        const postId = (await insertPost()).rows[0].id;
        const assetId = (await sql(
            `INSERT INTO storage.assets (public_id, provider, resource_type) VALUES ($1, 'payload', 'image') RETURNING id::text AS id`,
            [`${TAG}_asset`]
        )).rows[0].id;
        await sql(`INSERT INTO community.post_asset (post_id, asset_id) VALUES ($1, $2)`, [postId, assetId]);
        await sql(`DELETE FROM community.post WHERE id = $1`, [postId]);
        const left = await sql(`SELECT 1 FROM community.post_asset WHERE post_id = $1`, [postId]);
        expect(left.rows).toHaveLength(0);
    });

    it("grants blog.moderate to admin", async () => {
        const rows = (await sql(
            `SELECT r.code FROM identity.role_permissions rp
             JOIN identity.roles r ON r.id = rp.role_id
             JOIN identity.permissions p ON p.id = rp.permission_id
             WHERE p.resource = 'blog' AND p.action = 'moderate' ORDER BY r.code`
        )).rows.map((row) => row.code);
        expect(rows).toEqual(["admin", "course_manager", "super_admin"]);
    });
});
