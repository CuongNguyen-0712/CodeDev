// Moderation and appeal decisions against real PostgreSQL; test users (and their posts) are deleted afterwards.
import crypto from "node:crypto";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ab${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const APPEALED = "hidden_at = now() - interval '5 days', hidden_reason = 'bad', appealed_at = now()";

describe.skipIf(!hasDb)("admin blog moderation (PostgreSQL)", () => {
    let sql, adminBlogService, blogService, adminBlogActionSchema, BLOG_HIDDEN_PURGE_DAYS;
    const actor = { id: null, publicId: `${TAG}_admin`, rank: 80 };
    let author, n = 0;
    const newUser = async (name) => {
        const publicId = `${TAG}_${name}`;
        const id = String(960000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        return { id, publicId };
    };
    const post = async (status, extra = "") => {
        const publicId = `pst_${ulid().toLowerCase()}`;
        await sql(
            `INSERT INTO community.post (public_id, author_id, slug, title, excerpt, body_md, tags, status) VALUES ($1, $2, $3, 'A fine post title', 'x', 'Hello', ARRAY['js'], $4)`,
            [publicId, author.id, `${TAG}-${n++}`, status]
        );
        if (extra) await sql(`UPDATE community.post SET ${extra} WHERE public_id = $1`, [publicId]);
        return publicId;
    };
    const row = async (id) => (await sql(`SELECT * FROM community.post WHERE public_id = $1`, [id])).rows[0];
    const act = (postId, action, reason) => adminBlogService.act({ actor, postId, action, reason, ip: "127.0.0.1" });

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ adminBlogService } = await import("@/services/adminBlog.service"));
        ({ blogService, BLOG_HIDDEN_PURGE_DAYS } = await import("@/services/blog.service"));
        ({ adminBlogActionSchema } = await import("@/lib/validation/blog"));
        actor.id = (await newUser("admin")).id;
        author = await newUser("author");
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("approve publishes, audits, and makes the author's next submit publish at once", async () => {
        const id = await post("pending");
        await expect(act(id, "approve")).resolves.toEqual({ changed: true, status: "published" });
        const r = await row(id);
        expect(r).toMatchObject({ status: "published", approved_by: actor.id });
        expect(r.approved_at).not.toBeNull();
        expect(r.published_at).not.toBeNull();
        const audit = (await sql(
            `SELECT action, target_type, target_id, before->>'status' AS b, after->>'status' AS a FROM identity.audit_log WHERE actor_id = $1 AND target_id = $2`, [actor.id, id]
        )).rows;
        expect(audit).toEqual([{ action: "blog.approve", target_type: "post", target_id: id, b: "pending", a: "published" }]);
        const next = await blogService.create({ userId: author.publicId, input: { title: "Second post here", tags: ["js"], body: "Hi", submit: true } });
        expect(next.status).toBe("published");
    });

    it("reject needs a reason (schema) and stores it", async () => {
        expect(adminBlogActionSchema.safeParse({ action: "reject" }).success).toBe(false);
        expect(adminBlogActionSchema.safeParse({ action: "hide" }).success).toBe(false);
        expect(adminBlogActionSchema.safeParse({ action: "approve" }).success).toBe(true);
        const id = await post("pending");
        await expect(act(id, "reject", "Not on topic for the blog")).resolves.toEqual({ changed: true, status: "rejected" });
        expect(await row(id)).toMatchObject({ status: "rejected", reject_reason: "Not on topic for the blog" });
    });

    it("hide then show round-trips hidden_at", async () => {
        const id = await post("published", "published_at = now()");
        await expect(act(id, "hide", "Spam links inside")).resolves.toEqual({ changed: true, status: "hidden" });
        expect(await row(id)).toMatchObject({ status: "hidden", hidden_reason: "Spam links inside" });
        expect((await row(id)).hidden_at).not.toBeNull();
        await expect(act(id, "show")).resolves.toEqual({ changed: true, status: "published" });
        expect(await row(id)).toMatchObject({ status: "published", hidden_at: null, hidden_reason: null });
    });

    it("appeal approve clears hidden_at; appeal reject keeps it and returns to hidden", async () => {
        const approveId = await post("pending", APPEALED);
        await expect(act(approveId, "approve")).resolves.toEqual({ changed: true, status: "published" });
        expect(await row(approveId)).toMatchObject({ status: "published", hidden_at: null, hidden_reason: null });

        const rejectId = await post("pending", APPEALED);
        const before = await row(rejectId);
        await expect(act(rejectId, "reject", "Still breaks the rules")).resolves.toEqual({ changed: true, status: "hidden" });
        const after = await row(rejectId);
        expect(after.status).toBe("hidden");
        expect(after.hidden_at).toEqual(before.hidden_at);
        expect(after.appealed_at).toEqual(before.appealed_at);
    });

    it("the appeal-rejected notice carries the purge date", async () => {
        const id = await post("pending", APPEALED);
        const hiddenAt = (await row(id)).hidden_at;
        await act(id, "reject", "Still breaks the rules");
        const due = new Date(hiddenAt.getTime() + BLOG_HIDDEN_PURGE_DAYS * 86400000).toISOString().slice(0, 10);
        const note = (await sql(`SELECT title, message FROM profile.notification WHERE user_id = $1 AND dedupe_key LIKE $2`, [author.id, `blog:${id}:reject:%`])).rows[0];
        expect(note.title).toBe("Appeal rejected");
        expect(note.message).toContain(due);
    });

    it("rejecting an appeal twice is a repeat, not a 409", async () => {
        const id = await post("pending", APPEALED);
        await act(id, "reject", "Still breaks the rules");
        await expect(act(id, "reject", "Still breaks the rules")).resolves.toEqual({ changed: false, status: "hidden" });
    });

    it("hide, show, hide notifies twice; the notice names the reason and that hide's purge date", async () => {
        const id = await post("published", "published_at = now()");
        const hides = async () => (await sql(
            `SELECT message FROM profile.notification WHERE user_id = $1 AND kind = 'content_hidden' AND dedupe_key LIKE $2 ORDER BY id`, [author.id, `blog:${id}:hide:%`]
        )).rows.map((r) => r.message);
        const dueOf = async () => new Date((await row(id)).hidden_at.getTime() + BLOG_HIDDEN_PURGE_DAYS * 86400000).toISOString().slice(0, 10);
        await act(id, "hide", "Spam links inside.");
        const first = await dueOf();
        await act(id, "show");
        await act(id, "hide", "Spam links inside.");
        const second = await dueOf();
        const messages = await hides();
        expect(messages).toHaveLength(2);
        expect(messages[0]).toBe(`Hidden: Spam links inside. It will be deleted on ${first} unless it is restored. You can appeal once from My posts.`);
        expect(messages[1]).toContain("Spam links inside.");
        expect(messages[1]).toContain(second);
        expect(messages[1]).not.toContain("..");
    });

    it("lists queues: appeal apart from pending, purgeAt only on hidden", async () => {
        const plain = await post("pending");
        const appeal = await post("pending", "hidden_at = now(), appealed_at = now()");
        const hidden = await post("hidden", "hidden_at = now(), hidden_reason = 'bad'");
        const ids = async (status) => (await adminBlogService.list({ status })).items.map((i) => i.id);
        expect(await ids("pending")).toContain(plain);
        expect(await ids("pending")).not.toContain(appeal);
        expect(await ids("appeal")).toContain(appeal);
        const item = (await adminBlogService.list({ status: "hidden" })).items.find((i) => i.id === hidden);
        expect(item.purgeAt).toBeInstanceOf(Date);
        expect(item.author).toMatchObject({ id: author.publicId });
    });

    it("refuses impossible moves with 409 and answers a repeat with changed false", async () => {
        const draft = await post("draft");
        await expect(act(draft, "approve")).rejects.toMatchObject({ status: 409, message: "Not allowed from draft" });
        const id = await post("pending");
        await act(id, "approve");
        await expect(act(id, "approve")).resolves.toEqual({ changed: false, status: "published" });
        await expect(act(`pst_${"0".repeat(26)}`, "approve")).rejects.toMatchObject({ status: 404 });
    });
});
