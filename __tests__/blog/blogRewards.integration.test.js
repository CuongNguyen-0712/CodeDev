// EXP for a post's first publish against real PostgreSQL; test users are deleted afterwards (posts cascade).
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `br${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("blog publish EXP (PostgreSQL)", () => {
    let sql, blogService, adminBlogService, actor;
    let n = 0;
    const newUser = async (name) => {
        const publicId = `${TAG}_${name}`;
        const id = String(974000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'T', 'T')`, [id]);
        return { id, publicId };
    };
    const input = (submit = true) => ({ title: `A rewarded post ${n++}`, tags: ["js"], body: "Hello world", submit });
    const trust = (user) => sql(
        `INSERT INTO community.post (public_id, author_id, slug, title, excerpt, body_md, tags, status, approved_at) VALUES ($1, $2, $1, 't', 'x', 'x', ARRAY['js'], 'draft', now())`,
        [`pst_${TAG}${n++}`, user.id]
    );
    const expRows = async (postPublicId) => (await sql(
        `SELECT t.amount FROM profile.exp_transaction t JOIN community.post p ON p.id = t.source_id WHERE t.source_type = 'blog_post' AND p.public_id = $1`, [postPublicId]
    )).rows;
    const exp = async (user) => Number((await sql(`SELECT exp FROM profile.info WHERE user_id = $1`, [user.id])).rows[0].exp);

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ blogService } = await import("@/services/blog.service"));
        ({ adminBlogService } = await import("@/services/adminBlog.service"));
        actor = { ...(await newUser("admin")), rank: 80 };
    });

    afterAll(async () => {
        if (sql) await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("trusted author's publish earns 20 EXP once", async () => {
        const u = await newUser("trusted");
        await trust(u);
        const before = await exp(u);
        const post = await blogService.create({ userId: u.publicId, input: input() });
        expect(post.status).toBe("published");
        expect(post.rewards.awardedExp).toBe(20);
        expect(await expRows(post.id)).toHaveLength(1);
        expect(Number((await expRows(post.id))[0].amount)).toBe(20);
        expect(await exp(u)).toBe(before + 20);
        const again = await blogService.update({ userId: u.publicId, postId: post.id, input: input() });
        expect(again.rewards).toBeUndefined();
        expect(await expRows(post.id)).toHaveLength(1);
    });

    it("second publish within 24 hours earns nothing", async () => {
        const u = await newUser("twice");
        await trust(u);
        await blogService.create({ userId: u.publicId, input: input() });
        const second = await blogService.create({ userId: u.publicId, input: input() });
        expect(second.status).toBe("published");
        expect(second.rewards).toBeUndefined();
        expect(await expRows(second.id)).toHaveLength(0);
    });

    it("draft earns nothing", async () => {
        const u = await newUser("draft");
        await trust(u);
        const post = await blogService.create({ userId: u.publicId, input: input(false) });
        expect(await expRows(post.id)).toHaveLength(0);
    });

    it("admin approve pays the first post", async () => {
        const u = await newUser("fresh");
        const post = await blogService.create({ userId: u.publicId, input: input() });
        expect(post.status).toBe("pending");
        expect(await expRows(post.id)).toHaveLength(0);
        await adminBlogService.act({ actor, postId: post.id, action: "approve", ip: "127.0.0.1" });
        expect(await expRows(post.id)).toHaveLength(1);
    });

    it("hide keeps EXP and show does not pay twice", async () => {
        const u = await newUser("hider");
        const post = await blogService.create({ userId: u.publicId, input: input() });
        const act = (action) => adminBlogService.act({ actor, postId: post.id, action, reason: "r", ip: "127.0.0.1" });
        await act("approve");
        const after = await exp(u);
        await act("hide");
        expect(await exp(u)).toBe(after);
        await act("show");
        expect(await expRows(post.id)).toHaveLength(1);
        expect(await exp(u)).toBe(after);
    });
});
