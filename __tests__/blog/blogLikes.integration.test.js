// Likes, counters and viewer state against real PostgreSQL; test users are deleted afterwards (posts cascade).
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `bl${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("blog likes (PostgreSQL)", () => {
    let sql, blogService, svc;
    let author, fan, unverified;
    const newUser = async (name, verified = true) => {
        const publicId = `${TAG}_${name}`;
        const id = String(971000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, $4)`, [id, publicId, `${publicId}@test.invalid`, verified]);
        return publicId;
    };
    // A published post by `author`; the first post of an author waits for review, so approve it directly.
    const publish = async (title = "A likeable post title") => {
        const post = await blogService.create({ userId: author, input: { title, tags: ["js"], body: "Hello world", submit: true } });
        await sql(`UPDATE community.post SET status = 'published', published_at = now(), approved_at = now() WHERE public_id = $1`, [post.id]);
        return post;
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ blogService } = await import("@/services/blog.service"));
        ({ blogInteractionService: svc } = await import("@/services/blogInteraction.service"));
        author = await newUser("author");
        fan = await newUser("fan");
        unverified = await newUser("unv", false);
    });

    afterAll(async () => {
        if (sql) await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("like twice counts once", async () => {
        const post = await publish();
        expect(await svc.like({ userId: fan, postId: post.id })).toEqual({ liked: true, likeCount: 1 });
        expect(await svc.like({ userId: fan, postId: post.id })).toEqual({ liked: true, likeCount: 1 });
        const rows = (await sql(`SELECT count(*)::int AS n FROM community.post_like l JOIN community.post p ON p.id = l.post_id WHERE p.public_id = $1`, [post.id])).rows;
        expect(rows[0].n).toBe(1);
    });

    it("unlike without a like changes nothing", async () => {
        const post = await publish();
        expect(await svc.unlike({ userId: fan, postId: post.id })).toEqual({ liked: false, likeCount: 0 });
    });

    it("unlike removes the like once", async () => {
        const post = await publish();
        await svc.like({ userId: fan, postId: post.id });
        expect(await svc.unlike({ userId: fan, postId: post.id })).toEqual({ liked: false, likeCount: 0 });
        expect(await svc.unlike({ userId: fan, postId: post.id })).toEqual({ liked: false, likeCount: 0 });
    });

    it("cannot like own post", async () => {
        const post = await publish();
        await expect(svc.like({ userId: author, postId: post.id })).rejects.toMatchObject({ status: 400, message: "You cannot like your own post" });
    });

    it("unverified cannot like", async () => {
        const post = await publish();
        await expect(svc.like({ userId: unverified, postId: post.id })).rejects.toMatchObject({ status: 403, message: "Verify your email to write on the blog" });
    });

    it("hidden post is 404", async () => {
        const post = await publish();
        await sql(`UPDATE community.post SET status = 'hidden', hidden_at = now() WHERE public_id = $1`, [post.id]);
        await expect(svc.like({ userId: fan, postId: post.id })).rejects.toMatchObject({ status: 404 });
    });

    it("viewer state", async () => {
        const post = await publish();
        expect(await svc.viewer({ userId: null, postId: post.id })).toEqual({ likeCount: 0, commentCount: 0, liked: false, reported: false, own: false });
        expect(await svc.viewer({ userId: fan, postId: post.id })).toMatchObject({ liked: false, own: false });
        await svc.like({ userId: fan, postId: post.id });
        expect(await svc.viewer({ userId: fan, postId: post.id })).toMatchObject({ likeCount: 1, liked: true, own: false });
        expect(await svc.viewer({ userId: author, postId: post.id })).toMatchObject({ liked: false, own: true });
    });

    it("public reads carry counts", async () => {
        const post = await publish("Counted post title");
        await svc.like({ userId: fan, postId: post.id });
        expect(await blogService.getPublishedBySlug(post.slug)).toMatchObject({ likeCount: 1, commentCount: 0 });
    });

    it("feedState: signed out gets no ids but real counts", async () => {
        const liked = await publish();
        const other = await publish();
        await svc.like({ userId: fan, postId: liked.id });
        const postIds = [liked.id, other.id, "not-an-id"];
        expect(await svc.feedState({ userId: null, postIds })).toEqual({
            ids: [],
            counts: { [liked.id]: { likeCount: 1, commentCount: 0 }, [other.id]: { likeCount: 0, commentCount: 0 } },
        });
        expect((await svc.feedState({ userId: fan, postIds })).ids).toEqual([liked.id]);
    });

    it("feedState: counts match the rows after a like and a comment", async () => {
        const post = await publish();
        await svc.like({ userId: fan, postId: post.id });
        await svc.addComment({ userId: fan, postId: post.id, input: { body: "Counted comment" } });
        const rows = (await sql(
            `SELECT (SELECT count(*)::int FROM community.post_like l WHERE l.post_id = p.id) AS likes,
                    (SELECT count(*)::int FROM community.post_comment c WHERE c.post_id = p.id) AS comments
             FROM community.post p WHERE p.public_id = $1`, [post.id]
        )).rows[0];
        expect(rows).toEqual({ likes: 1, comments: 1 });
        expect((await svc.feedState({ userId: fan, postIds: [post.id] })).counts[post.id]).toEqual({ likeCount: rows.likes, commentCount: rows.comments });
    });

    it("feedState: 51 ids is a 400", async () => {
        const postIds = Array.from({ length: 51 }, (_, i) => `pst_${String(i).padStart(26, "0")}`);
        await expect(svc.feedState({ userId: fan, postIds })).rejects.toMatchObject({ status: 400 });
    });
});
