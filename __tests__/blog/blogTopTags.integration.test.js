// The feed's Topics list against real PostgreSQL; test users are deleted afterwards (posts cascade).
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `tt${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
// Every tag of this run starts with TAG, so the posts already in the database stay out of the assertions.
const t = (name) => `${TAG}-${name}`;
const ALL = 100000;

describe.skipIf(!hasDb)("blog top tags (PostgreSQL)", () => {
    let sql, blogService, author;
    const mine = async (limit = ALL) => (await blogService.listTopTags({ limit })).map((topic) => topic.name).filter((tag) => tag.startsWith(TAG));
    const post = (tags, submit = true) => blogService.create({
        userId: author,
        input: { title: `Top tags ${crypto.randomBytes(3).toString("hex")}`, tags, body: "Hello world", submit },
    });

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ blogService } = await import("@/services/blog.service"));
        author = `${TAG}_a`;
        const id = String(970000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, true)`, [id, author, `${author}@test.invalid`]);
        await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'T', 'T')`, [id]);
        // The first post waits for review; once it is approved the author publishes at once.
        const first = await post([t("pending")]);
        await sql(`UPDATE community.post SET approved_at = now() WHERE public_id = $1`, [first.id]);
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    it("orders by the number of published posts, then by name", async () => {
        for (const tags of [[t("three")], [t("three"), t("two")], [t("three"), t("two"), t("one-b")], [t("one-a")]]) {
            expect(await post(tags)).toMatchObject({ status: "published" });
        }
        expect(await mine()).toEqual([t("three"), t("two"), t("one-a"), t("one-b")]);
    });

    it("pending, draft, hidden and deleted posts do not count", async () => {
        // `busy` would lead with four posts if these counted; only its one published post does.
        expect(await post([t("busy")])).toMatchObject({ status: "published" });
        expect(await post([t("busy"), t("draft")], false)).toMatchObject({ status: "draft" });
        const hidden = await post([t("busy"), t("hidden")]);
        await sql(`UPDATE community.post SET status = 'hidden', hidden_at = now() WHERE public_id = $1`, [hidden.id]);
        const removed = await post([t("busy"), t("deleted")]);
        await blogService.remove({ userId: author, postId: removed.id });

        expect(await mine()).toEqual([t("three"), t("two"), t("busy"), t("one-a"), t("one-b")]);
    });

    it("returns at most `limit` tags", async () => {
        expect(await blogService.listTopTags({ limit: 3 })).toHaveLength(3);
        expect((await blogService.listTopTags()).length).toBeLessThanOrEqual(12);
    });
});
