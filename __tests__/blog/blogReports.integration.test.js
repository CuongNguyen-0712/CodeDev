// Reports, the Reported queue and dismiss against real PostgreSQL; test users (and their posts) are deleted afterwards.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `br${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("blog reports (PostgreSQL)", () => {
    let sql, blogService, svc, adminBlogService, reportSchema;
    let author, fan, other;
    const actor = { id: null, publicId: `${TAG}_admin`, rank: 80 };
    const newUser = async (name) => {
        const publicId = `${TAG}_${name}`;
        const id = String(973000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        return { id, publicId };
    };
    const publish = async () => {
        const post = await blogService.create({ userId: author, input: { title: "A reportable post title", tags: ["js"], body: "Hello world", submit: true } });
        await sql(`UPDATE community.post SET status = 'published', published_at = now(), approved_at = now() WHERE public_id = $1`, [post.id]);
        return post;
    };
    const report = (userId, postId, reason = "Spam content") => svc.report({ userId, postId, input: { reason } });
    const queue = async (ids) => (await adminBlogService.list({ status: "reported" })).items.filter((i) => ids.includes(i.id));
    const act = (postId, action, reason) => adminBlogService.act({ actor, postId, action, reason, ip: "127.0.0.1" });

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ blogService } = await import("@/services/blog.service"));
        ({ blogInteractionService: svc } = await import("@/services/blogInteraction.service"));
        ({ adminBlogService } = await import("@/services/adminBlog.service"));
        ({ reportSchema } = await import("@/lib/validation/blog"));
        author = (await newUser("author")).publicId;
        fan = (await newUser("fan")).publicId;
        other = (await newUser("other")).publicId;
        actor.id = (await newUser("admin")).id;
    });

    afterAll(async () => {
        if (sql) await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("report once", async () => {
        const post = await publish();
        expect(reportSchema.safeParse({ reason: "abc" }).success).toBe(false);
        expect(await report(fan, post.id)).toEqual({ reported: true });
        await expect(report(fan, post.id)).rejects.toMatchObject({ status: 409 });
    });

    it("cannot report own post", async () => {
        const post = await publish();
        await expect(report(author, post.id)).rejects.toMatchObject({ status: 400 });
    });

    it("reported queue, dismiss, hide and no-report dismiss", async () => {
        const a = await publish();
        const b = await publish();
        await report(fan, a.id, "Reason A one");
        await report(other, a.id, "Reason A two");
        await report(fan, b.id, "Reason B one");

        const items = await queue([a.id, b.id]);
        expect(items.map((i) => i.id)).toEqual([a.id, b.id]);
        expect(items[0].reportCount).toBe(2);
        expect(items[0].reports.map((r) => r.reason).sort()).toEqual(["Reason A one", "Reason A two"]);

        expect(await act(a.id, "dismiss")).toEqual({ changed: true, status: "published" });
        expect(await queue([a.id])).toHaveLength(0);
        expect((await sql(`SELECT status FROM community.post WHERE public_id = $1`, [a.id])).rows[0].status).toBe("published");
        await expect(act(a.id, "dismiss")).rejects.toMatchObject({ status: 409 });

        await act(b.id, "hide", "Violates the rules");
        expect(await queue([b.id])).toHaveLength(0);
    });
});
