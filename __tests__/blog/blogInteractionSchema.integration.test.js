// Community blog interaction tables: post_like, post_comment, post_report.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `bi${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("blog interaction schema (PostgreSQL)", () => {
    let sql, userId, postId;
    let n = 0;

    const insertPost = async () => {
        const k = `${TAG}_p${n++}`;
        return (await sql(
            `INSERT INTO community.post (public_id, author_id, slug, title, excerpt, body_md, tags, status, published_at)
             VALUES ($1, $2, $1, 't', 'e', 'b', '{a}', 'published', now()) RETURNING id::text AS id`,
            [k, userId]
        )).rows[0].id;
    };
    const insertComment = (pid, body) =>
        sql(`INSERT INTO community.post_comment (public_id, post_id, user_id, body) VALUES ($1, $2, $3, $4)`, [`${TAG}_c${n++}`, pid, userId, body]);

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        userId = String(970000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`, [userId, `${TAG}_u`, `${TAG}_u@test.invalid`]);
        postId = await insertPost();
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
        await sql(`DELETE FROM community.post WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("one like per user", async () => {
        await sql(`INSERT INTO community.post_like (post_id, user_id) VALUES ($1, $2)`, [postId, userId]);
        await expect(sql(`INSERT INTO community.post_like (post_id, user_id) VALUES ($1, $2)`, [postId, userId])).rejects.toMatchObject({ code: "23505" });
    });

    it("comment body limits", async () => {
        await expect(insertComment(postId, "")).rejects.toMatchObject({ code: "23514" });
        await expect(insertComment(postId, "x".repeat(2001))).rejects.toMatchObject({ code: "23514" });
        await insertComment(postId, "x".repeat(2000));
    });

    it("one report per user", async () => {
        const q = `INSERT INTO community.post_report (post_id, reporter_id, reason) VALUES ($1, $2, 'spam spam')`;
        await sql(q, [postId, userId]);
        await expect(sql(q, [postId, userId])).rejects.toMatchObject({ code: "23505" });
    });

    it("deleting the post cascades", async () => {
        const pid = await insertPost();
        await sql(`INSERT INTO community.post_like (post_id, user_id) VALUES ($1, $2)`, [pid, userId]);
        await insertComment(pid, "hi");
        await sql(`INSERT INTO community.post_report (post_id, reporter_id, reason) VALUES ($1, $2, 'spam spam')`, [pid, userId]);
        await sql(`DELETE FROM community.post WHERE id = $1`, [pid]);
        for (const t of ["post_like", "post_comment", "post_report"]) {
            expect((await sql(`SELECT 1 FROM community.${t} WHERE post_id = $1`, [pid])).rows).toHaveLength(0);
        }
    });

    it("blog publish EXP rule exists and blog_post is an allowed EXP source", async () => {
        const rule = (await sql(`SELECT amount, is_active FROM profile.exp_rule WHERE rule_key = 'blog.post_published'`)).rows[0];
        expect(rule).toMatchObject({ amount: 20, is_active: true });
        const id = crypto.randomUUID();
        await sql(
            `INSERT INTO profile.exp_transaction (id, user_id, amount, source_type, source_id, rule_key, exp_after)
             VALUES ($1, $2, 20, 'blog_post', $3, 'blog.post_published', 20)`,
            [id, userId, postId]
        );
        await sql(`DELETE FROM profile.exp_transaction WHERE id = $1`, [id]);
    });
});
