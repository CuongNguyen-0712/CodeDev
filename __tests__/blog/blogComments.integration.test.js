// Comments, author delete and admin hide against real PostgreSQL; test users (and their posts) are deleted afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `bc${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("blog comments (PostgreSQL)", () => {
    let sql, dbPool, blogService, svc, adminBlogService, commentInputSchema;
    let author, fan, other;
    const actor = { id: null, publicId: `${TAG}_admin`, rank: 80 };
    const newUser = async (name) => {
        const publicId = `${TAG}_${name}`;
        const id = String(972000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        return { id, publicId };
    };
    const publish = async () => {
        const post = await blogService.create({ userId: author, input: { title: "A commentable post title", tags: ["js"], body: "Hello world", submit: true } });
        await sql(`UPDATE community.post SET status = 'published', published_at = now(), approved_at = now() WHERE public_id = $1`, [post.id]);
        return post;
    };
    const count = async (postId) => (await svc.viewer({ userId: null, postId })).commentCount;
    const hide = (commentId, hidden) => adminBlogService.setCommentHidden({ actor, commentId, hidden, reason: "Off topic", ip: "127.0.0.1" });

    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        ({ blogService } = await import("@/services/blog.service"));
        ({ blogInteractionService: svc } = await import("@/services/blogInteraction.service"));
        ({ adminBlogService } = await import("@/services/adminBlog.service"));
        ({ commentInputSchema } = await import("@/lib/validation/blog"));
        author = (await newUser("author")).publicId;
        fan = (await newUser("fan")).publicId;
        other = (await newUser("other")).publicId;
        actor.id = (await newUser("admin")).id;
    });

    afterAll(async () => {
        if (sql) await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("comment and count", async () => {
        const post = await publish();
        const c = await svc.addComment({ userId: fan, postId: post.id, input: { body: "Nice read" } });
        expect(c).toMatchObject({ body: "Nice read", own: true, author: { id: fan } });
        expect(await count(post.id)).toBe(1);
        const list = await svc.listComments({ userId: other, postId: post.id });
        expect(list.items).toHaveLength(1);
        expect(list.items[0]).toMatchObject({ id: c.id, own: false });
    });

    it("blank comment rejected", () => {
        expect(commentInputSchema.safeParse({ body: "   " }).success).toBe(false);
        expect(commentInputSchema.parse({ body: "  hi  " }).body).toBe("hi");
    });

    it("only the author deletes", async () => {
        const post = await publish();
        const c = await svc.addComment({ userId: fan, postId: post.id, input: { body: "Mine" } });
        await expect(svc.deleteComment({ userId: other, commentId: c.id })).rejects.toMatchObject({ status: 404 });
        expect(await svc.deleteComment({ userId: fan, commentId: c.id })).toEqual({ deleted: true });
        expect(await count(post.id)).toBe(0);
    });

    it("hide then delete counts once", async () => {
        const post = await publish();
        const c = await svc.addComment({ userId: fan, postId: post.id, input: { body: "Spam" } });
        expect(await hide(c.id, true)).toEqual({ changed: true });
        expect(await hide(c.id, true)).toEqual({ changed: false });
        expect(await count(post.id)).toBe(0);
        await svc.deleteComment({ userId: fan, commentId: c.id });
        expect(await count(post.id)).toBe(0);
        await expect(hide(c.id, false)).rejects.toMatchObject({ status: 404 });
    });

    it("hidden comments are not listed, and show restores them", async () => {
        const post = await publish();
        const c = await svc.addComment({ userId: fan, postId: post.id, input: { body: "Hide me" } });
        await hide(c.id, true);
        expect((await svc.listComments({ userId: null, postId: post.id })).items).toEqual([]);
        await hide(c.id, false);
        expect(await count(post.id)).toBe(1);
        expect((await svc.listComments({ userId: null, postId: post.id })).items).toHaveLength(1);
    });

    it("pages newest first by keyset", async () => {
        const post = await publish();
        for (let i = 0; i < 21; i++) await svc.addComment({ userId: fan, postId: post.id, input: { body: `c${i}` } });
        const p1 = await svc.listComments({ userId: null, postId: post.id });
        expect(p1.items).toHaveLength(20);
        expect(p1.nextCursor).toBeTruthy();
        const p2 = await svc.listComments({ userId: null, postId: post.id, cursor: p1.nextCursor });
        expect(p2.items.map((x) => x.body)).toEqual(["c0"]);
        expect(p2.nextCursor).toBeNull();
    });

    it("hidden post blocks comments", async () => {
        const post = await publish();
        await sql(`UPDATE community.post SET status = 'hidden', hidden_at = now() WHERE public_id = $1`, [post.id]);
        await expect(svc.addComment({ userId: fan, postId: post.id, input: { body: "x" } })).rejects.toMatchObject({ status: 404 });
        await expect(svc.listComments({ userId: fan, postId: post.id })).rejects.toMatchObject({ status: 404 });
    });

    it("admin list", async () => {
        const post = await publish();
        const c = await svc.addComment({ userId: fan, postId: post.id, input: { body: "Admin sees" } });
        await hide(c.id, true);
        const { items } = await adminBlogService.listComments({});
        expect(items.find((x) => x.id === c.id)).toMatchObject({ hidden: true, post: { id: post.id, title: "A commentable post title", status: "published", deleted: false } });
        const audit = (await sql(`SELECT action, target_type FROM identity.audit_log WHERE actor_id = $1 AND target_id = $2`, [actor.id, c.id])).rows;
        expect(audit).toEqual([{ action: "blog.comment_hide", target_type: "post_comment" }]);
    });

    it("admin list carries the post's status and whether it is deleted", async () => {
        const hiddenPost = await publish();
        const deletedPost = await publish();
        const a = await svc.addComment({ userId: fan, postId: hiddenPost.id, input: { body: "On a hidden post" } });
        const b = await svc.addComment({ userId: fan, postId: deletedPost.id, input: { body: "On a deleted post" } });
        await sql(`UPDATE community.post SET status = 'hidden', hidden_at = now() WHERE public_id = $1`, [hiddenPost.id]);
        await sql(`UPDATE community.post SET deleted_at = now() WHERE public_id = $1`, [deletedPost.id]);
        const { items } = await adminBlogService.listComments({});
        expect(items.find((x) => x.id === a.id).post).toMatchObject({ status: "hidden", deleted: false });
        expect(items.find((x) => x.id === b.id).post).toMatchObject({ deleted: true });
    });

    // The purge locks the post, then its comments; deleting a comment must take the same order or the two deadlock (40P01).
    it("deleting a comment locks the post before the comment", async () => {
        const post = await publish();
        const c = await svc.addComment({ userId: fan, postId: post.id, input: { body: "Lock order" } });
        const client = await dbPool.connect();
        try {
            await client.query("BEGIN");
            await client.query(`SELECT 1 FROM community.post WHERE public_id = $1 FOR UPDATE`, [post.id]);
            const deleting = svc.deleteComment({ userId: fan, commentId: c.id });
            await new Promise((resolve) => setTimeout(resolve, 300));
            // Waiting on the post, the delete must not hold the comment yet.
            await client.query(`SELECT 1 FROM community.post_comment WHERE public_id = $1 FOR UPDATE NOWAIT`, [c.id]);
            await client.query("COMMIT");
            expect(await deleting).toEqual({ deleted: true });
        } finally {
            await client.query("ROLLBACK").catch(() => {});
            client.release();
        }
        expect(await count(post.id)).toBe(0);
    });
});
