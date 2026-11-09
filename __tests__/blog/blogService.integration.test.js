// Author writes and public reads against real PostgreSQL; test users are deleted afterwards (posts cascade).
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `bs${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const img = (n) => `https://res.cloudinary.com/demo/image/upload/${TAG}-${n}.png`;
const input = (over = {}) => ({ title: "A fine post title", tags: ["js"], body: "Hello world", submit: false, ...over });

describe.skipIf(!hasDb)("blog service (PostgreSQL)", () => {
    let sql, blogService;
    const ids = {};
    const newUser = async (name, verified = true) => {
        const publicId = `${TAG}_${name}`;
        const id = String(970000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, $4)`, [id, publicId, `${publicId}@test.invalid`, verified]);
        ids[name] = id;
        return publicId;
    };
    const setStatus = (postId, status) => sql(`UPDATE community.post SET status = $2, hidden_at = now() WHERE public_id = $1`, [postId, status]);
    const approve = (postId) => sql(`UPDATE community.post SET approved_at = now() WHERE public_id = $1`, [postId]);
    let a, b;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ blogService } = await import("@/services/blog.service"));
        a = await newUser("a");
        b = await newUser("b");
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM storage.assets WHERE public_id LIKE $1`, [`${TAG}%`]);
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("first submitted post waits for review", async () => {
        const post = await blogService.create({ userId: a, input: input({ submit: true }) });
        expect(post).toMatchObject({ status: "pending" });
        expect(post.id).toMatch(/^pst_[0-9a-z]{26}$/);
    });

    it("a trusted author publishes at once", async () => {
        const c = await newUser("c");
        const first = await blogService.create({ userId: c, input: input({ submit: true }) });
        await approve(first.id);
        const second = await blogService.create({ userId: c, input: input({ submit: true, title: "Second post here" }) });
        expect(second.status).toBe("published");
        expect((await sql(`SELECT published_at FROM community.post WHERE public_id = $1`, [second.id])).rows[0].published_at).not.toBeNull();
        expect((await blogService.listMine({ userId: c })).trusted).toBe(true);
    });

    it("draft stays draft", async () => {
        expect(await blogService.create({ userId: a, input: input() })).toMatchObject({ status: "draft" });
    });

    it("unverified email cannot write", async () => {
        const u = await newUser("u", false);
        await expect(blogService.create({ userId: u, input: input() })).rejects.toMatchObject({ status: 403, message: "Verify your email to write on the blog" });
    });

    it("another user's post is 404", async () => {
        const post = await blogService.create({ userId: a, input: input() });
        await expect(blogService.update({ userId: b, postId: post.id, input: input() })).rejects.toMatchObject({ status: 404 });
        await expect(blogService.remove({ userId: b, postId: post.id })).rejects.toMatchObject({ status: 404 });
        await expect(blogService.getOwn({ userId: b, postId: post.id })).rejects.toMatchObject({ status: 404 });
    });

    it("images from other origins are refused", async () => {
        await expect(blogService.create({ userId: a, input: input({ body: "![a](https://evil.example/a.png)" }) })).rejects.toMatchObject({ status: 400 });
    });

    it("twenty-one images are refused", async () => {
        const body = Array.from({ length: 21 }, (_, n) => `![i](${img(n)})`).join("\n\n");
        await expect(blogService.create({ userId: a, input: input({ body }) })).rejects.toMatchObject({ status: 400 });
    });

    it("links own blog assets", async () => {
        const asset = (owner, n) => sql(
            `INSERT INTO storage.assets (public_id, provider, external_url, resource_type, owner_id, purpose) VALUES ($1, 'cloudinary', $2, 'image', $3, 'blog')`,
            [`${TAG}_ast${n}`, img(n), ids[owner]]
        );
        await asset("a", 1);
        // Same URL pattern but owned by B: A may not use it, and nothing is written.
        await asset("b", 2);
        const count = async (id) => (await sql(`SELECT count(*)::int AS n FROM community.post_asset pa JOIN community.post p ON p.id = pa.post_id WHERE p.public_id = $1`, [id])).rows[0].n;
        await expect(blogService.create({ userId: a, input: input({ title: "Borrowed image", body: `![x](${img(1)})\n\n![y](${img(2)})` }) }))
            .rejects.toMatchObject({ status: 400, message: "Images must be uploaded to CodeDev" });
        expect((await sql(`SELECT count(*)::int AS n FROM community.post WHERE author_id = $1 AND title = 'Borrowed image'`, [ids.a])).rows[0].n).toBe(0);
        // A Cloudinary URL that is no one's asset is refused too, although its origin is allowed.
        await expect(blogService.create({ userId: a, input: input({ body: `![z](${img(99)})` }) }))
            .rejects.toMatchObject({ status: 400, message: "Images must be uploaded to CodeDev" });
        const post = await blogService.create({ userId: a, input: input({ body: `![x](${img(1)})` }) });
        expect(await count(post.id)).toBe(1);
        await blogService.update({ userId: a, postId: post.id, input: input({ body: "no images" }) });
        expect(await count(post.id)).toBe(0);
    });

    it("hidden post can be appealed once", async () => {
        const post = await blogService.create({ userId: a, input: input() });
        await setStatus(post.id, "hidden");
        await sql(`UPDATE community.post SET hidden_at = '2026-01-01T00:00:00Z' WHERE public_id = $1`, [post.id]);
        const appeal = { ...input(), appealReason: "Please look again, thanks" };
        await expect(blogService.update({ userId: a, postId: post.id, input: appeal })).resolves.toMatchObject({ status: "pending" });
        expect((await sql(`SELECT hidden_at = '2026-01-01T00:00:00Z' AS same FROM community.post WHERE public_id = $1`, [post.id])).rows[0].same).toBe(true);
        expect((await sql(`SELECT appealed_at FROM community.post WHERE public_id = $1`, [post.id])).rows[0].appealed_at).not.toBeNull();
        await expect(blogService.update({ userId: a, postId: post.id, input: appeal })).rejects.toMatchObject({ status: 409 });
        await setStatus(post.id, "hidden");
        await expect(blogService.update({ userId: a, postId: post.id, input: appeal })).rejects.toMatchObject({ status: 403 });
        const mine = (await blogService.listMine({ userId: a })).items.find((item) => item.id === post.id);
        expect(mine.purgeAt).toBeInstanceOf(Date);
    });

    it("public reads show only published", async () => {
        const d = await newUser("d");
        const pending = await blogService.create({ userId: d, input: input({ submit: true, tags: [`${TAG}x`] }) });
        expect(await blogService.getPublishedBySlug(pending.slug)).toBeNull();
        await approve(pending.id);
        const made = [];
        for (let n = 0; n < 13; n++) made.push(await blogService.create({ userId: d, input: input({ submit: true, title: `Public post ${n}`, tags: [`${TAG}t`] }) }));
        expect(made.every((post) => post.status === "published")).toBe(true);
        const first = await blogService.listPublished({ tag: `${TAG}t` });
        expect(first.items).toHaveLength(12);
        expect(first.nextCursor).toBeTruthy();
        const second = await blogService.listPublished({ tag: `${TAG}t`, cursor: first.nextCursor });
        expect(second.items).toHaveLength(1);
        expect(second.nextCursor).toBeNull();
        expect(first.items[0]).toMatchObject({ readingMinutes: 1, author: { id: d, username: d } });
        expect(await blogService.listPublished({ tag: `${TAG}x` })).toMatchObject({ items: [] });
        expect(await blogService.getPublishedBySlug(made[0].slug)).toMatchObject({ id: made[0].id, body: "Hello world" });
    });

    it("remove hides it from public reads", async () => {
        const e = await newUser("e");
        const first = await blogService.create({ userId: e, input: input({ submit: true }) });
        await approve(first.id);
        const post = await blogService.create({ userId: e, input: input({ submit: true, title: "To be removed" }) });
        expect(await blogService.getPublishedBySlug(post.slug)).not.toBeNull();
        const { revalidateTag } = await import("next/cache");
        revalidateTag.mockClear();
        await blogService.update({ userId: e, postId: post.id, input: input({ submit: true, title: "To be removed, edited" }) });
        // An edit of a live post may be served stale once; a removal expires at once.
        expect(revalidateTag).toHaveBeenLastCalledWith(`post:${post.id}`, "max");
        await expect(blogService.remove({ userId: e, postId: post.id })).resolves.toEqual({ deleted: true });
        expect(revalidateTag).toHaveBeenLastCalledWith(`post:${post.id}`, { expire: 0 });
        expect(await blogService.getPublishedBySlug(post.slug)).toBeNull();
        expect((await blogService.listMine({ userId: e })).items.some((item) => item.id === post.id)).toBe(false);
    });
});
