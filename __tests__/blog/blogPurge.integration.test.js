// Nightly purge of long-hidden posts against real PostgreSQL. It selects every hidden post in the DB,
// so a test skips rather than delete someone's local rows.
import crypto from "node:crypto";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `bp${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

describe.skipIf(!hasDb)("blog hidden purge (PostgreSQL)", () => {
    let sql, blogService, adminBlogService, author, n = 0;
    const outboxIds = new Set();
    const post = async (status, extra = "") => {
        const publicId = `pst_${ulid().toLowerCase()}`;
        const id = (await sql(
            `INSERT INTO community.post (public_id, author_id, slug, title, excerpt, body_md, tags, status) VALUES ($1, $2, $3, 'A fine post title', 'x', 'Hello', ARRAY['js'], $4) RETURNING id::text AS id`,
            [publicId, author.id, `${TAG}-${n++}`, status]
        )).rows[0].id;
        if (extra) await sql(`UPDATE community.post SET ${extra} WHERE id = $1`, [id]);
        return { id, publicId };
    };
    const hiddenDaysAgo = (days) => post("hidden", `hidden_at = now() - interval '${days} days', hidden_reason = 'bad'`);
    const exists = async (p) => (await sql(`SELECT 1 FROM community.post WHERE id = $1`, [p.id])).rowCount === 1;
    const asset = async (name) => (await sql(
        `INSERT INTO storage.assets (public_id, provider, external_url, resource_type, owner_id, purpose, object_key)
         VALUES ($1, 'payload', $2, 'image', $3, 'blog', $4) RETURNING id::text AS id`,
        [`${TAG}_${name}`, `https://media.test.invalid/${TAG}/${name}.png`, author.id, `${TAG}/${name}.png`]
    )).rows[0].id;
    const cover = (p, assetId) => sql(`UPDATE community.post SET cover_asset_id = $2 WHERE id = $1`, [p.id, assetId]);
    const link = (p, assetId) => sql(`INSERT INTO community.post_asset (post_id, asset_id) VALUES ($1, $2)`, [p.id, assetId]);
    // Re-checked right before every purge: it deletes all hidden posts in the DB, not only ours.
    const purge = async (ctx) => {
        const foreign = (await sql(`SELECT count(*)::int AS n FROM community.post WHERE status = 'hidden' AND hidden_at < now() - interval '30 days' AND author_id <> $1`, [author.id])).rows[0].n;
        if (foreign) ctx.skip(`${foreign} unrelated hidden post(s) older than 30 days exist; the purge would delete them`);
        const result = await blogService.runHiddenPurge({ days: 30 });
        result.outboxIds.forEach((id) => outboxIds.add(id));
        return result;
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ blogService } = await import("@/services/blog.service"));
        ({ adminBlogService } = await import("@/services/adminBlog.service"));
        const publicId = `${TAG}_author`;
        const id = String(950000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, publicId, `${publicId}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'T', 'T')`, [id]);
        author = { id, publicId };
    });

    afterAll(async () => {
        if (!sql) return;
        if (outboxIds.size) await sql(`DELETE FROM identity.auth_outbox WHERE id = ANY($1::bigint[])`, [[...outboxIds]]);
        await sql(`DELETE FROM identity.auth_outbox WHERE event_type = 'storage.purge' AND payload::text LIKE $1`, [`%${TAG}%`]);
        await sql(`DELETE FROM storage.assets WHERE public_id LIKE $1`, [`${TAG}%`]);
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("purges posts hidden 31 days, keeps 29 days, pending appeals and shown posts", async (ctx) => {
        const old = await hiddenDaysAgo(31);
        const fresh = await hiddenDaysAgo(29);
        const appeal = await post("pending", "hidden_at = now() - interval '40 days', appealed_at = now(), hidden_reason = 'bad'");
        const shown = await post("published", "published_at = now()");
        expect(await purge(ctx)).toMatchObject({ purged: 1, files: 0, outboxIds: [] });
        expect(await exists(old)).toBe(false);
        expect(await exists(fresh)).toBe(true);
        expect(await exists(appeal)).toBe(true);
        expect(await exists(shown)).toBe(true);

        await adminBlogService.act({ actor: { id: author.id }, postId: appeal.publicId, action: "reject", reason: "Still breaks the rules" });
        expect((await purge(ctx)).purged).toBe(1);
        expect(await exists(appeal)).toBe(false);
        expect(await exists(fresh)).toBe(true);
    });

    it("deletes unshared assets, spares shared ones, and a second run does nothing", async (ctx) => {
        const x = await hiddenDaysAgo(31);
        const y = await post("published", "published_at = now()");
        const s = await asset("shared"), t = await asset("only");
        await link(x, s); await link(y, s); await link(x, t);
        const result = await purge(ctx);
        expect(result).toMatchObject({ purged: 1, files: 1 });
        expect(result.outboxIds).toHaveLength(1);
        const deleted = async (id) => (await sql(`SELECT deleted_at FROM storage.assets WHERE id = $1`, [id])).rows[0].deleted_at;
        expect(await deleted(t)).not.toBeNull();
        expect(await deleted(s)).toBeNull();
        const queued = (await sql(`SELECT event_type, payload FROM identity.auth_outbox WHERE id = $1`, [result.outboxIds[0]])).rows[0];
        expect(queued.event_type).toBe("storage.purge");
        expect(queued.payload.files).toEqual([{ provider: "payload", key: `${TAG}/only.png`, bucket: null }]);
        expect(await exists(y)).toBe(true);

        expect(await purge(ctx)).toEqual({ purged: 0, files: 0, outboxIds: [] });
    });

    it("retires an asset shared by two purged posts exactly once", async (ctx) => {
        const x1 = await hiddenDaysAgo(31), x2 = await hiddenDaysAgo(32);
        const s = await asset("twice");
        await link(x1, s); await link(x2, s);
        const result = await purge(ctx);
        expect(result).toMatchObject({ purged: 2, files: 1 });
        const queued = (await sql(`SELECT payload FROM identity.auth_outbox WHERE id = $1`, [result.outboxIds[0]])).rows[0];
        expect(queued.payload.files).toEqual([{ provider: "payload", key: `${TAG}/twice.png`, bucket: null }]);
    });

    it("keeps an asset that a post outside the batch uses as its cover, and retires a purged post's own cover", async (ctx) => {
        const x = await hiddenDaysAgo(31);
        const y = await post("published", "published_at = now()");
        const kept = await asset("covered"), own = await asset("owncover");
        await link(x, kept); await cover(y, kept); await cover(x, own);
        const result = await purge(ctx);
        expect(result).toMatchObject({ purged: 1, files: 1 });
        const deleted = async (id) => (await sql(`SELECT deleted_at FROM storage.assets WHERE id = $1`, [id])).rows[0].deleted_at;
        expect(await deleted(kept)).toBeNull();
        expect(await deleted(own)).not.toBeNull();
        const queued = (await sql(`SELECT payload FROM identity.auth_outbox WHERE id = $1`, [result.outboxIds[0]])).rows[0];
        expect(queued.payload.files.map((f) => f.key)).toEqual([`${TAG}/owncover.png`]);
    });
});
