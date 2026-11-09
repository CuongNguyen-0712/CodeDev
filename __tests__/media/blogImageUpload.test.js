import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Blog image upload: real PostgreSQL (DATABASE_URL), media store mocked like avatarUpload.test.js. */
const hasDb = Boolean(process.env.DATABASE_URL);

const uploads = [];
const destroyed = [];
const fake = { run: Math.random().toString(36).slice(2, 8), seq: 0 };

vi.mock("@/lib/media/mediaStore", () => ({
    mediaStore: () => ({
        provider: "payload",
        isConfigured: () => true,
        upload: async (buffer, options) => {
            const objectKey = `t${fake.run}${fake.seq++}`;
            uploads.push({ objectKey, options, bytes: buffer.length });
            return { provider: "payload", objectKey, url: `http://127.0.0.1:3010/api/media/file/${objectKey}.png`, width: 64, height: 64, format: "png", version: null, bytes: buffer.length };
        },
        destroy: async (id) => { destroyed.push(id); return "ok"; },
    }),
    destroyStoredFile: async () => { },
}));

// 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const fileOf = (bytes, name = "pic.png", type = "image/png") => new File([bytes], name, { type });

describe.skipIf(!hasDb)("blog image upload (PostgreSQL)", () => {
    const TAG = `bi${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
    let sql, mediaService, verified, unverified;

    const newUser = async (name, isVerified) => {
        const publicId = `${TAG}_${name}`;
        const id = String(960000000000000 + Math.floor(Math.random() * 1e9));
        await sql(`INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, $4)`, [id, publicId, `${publicId}@test.invalid`, isVerified]);
        return publicId;
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ mediaService } = await import("@/services/media.service"));
        verified = await newUser("v", true);
        unverified = await newUser("u", false);
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM storage.assets WHERE owner_id IN (SELECT id FROM identity.users WHERE public_id LIKE $1)`, [`${TAG}%`]);
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}%`]);
    });

    beforeEach(() => {
        uploads.length = 0;
        destroyed.length = 0;
    });

    it("stores a PNG and records a purpose 'blog' asset", async () => {
        const result = await mediaService.uploadBlogImage({ userId: verified, file: fileOf(PNG) });

        expect(uploads).toHaveLength(1);
        expect(uploads[0].options.key).toMatch(new RegExp(`^users/${verified}/blog/[0-9a-z]{26}$`));
        expect(uploads[0].options.maxSide).toBe(1600);
        expect(uploads[0].options.purpose).toBe("content");
        expect(result).toEqual({ url: expect.stringContaining(uploads[0].objectKey), width: 64, height: 64 });

        const rows = (await sql(
            `SELECT a.* FROM storage.assets a JOIN identity.users u ON u.id = a.owner_id WHERE u.public_id = $1 AND a.purpose = 'blog'`,
            [verified]
        )).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ external_url: result.url, deleted_at: null, object_key: uploads[0].objectKey });
    });

    it("rejects a file over 5 MB with 413", async () => {
        await expect(mediaService.uploadBlogImage({ userId: verified, file: fileOf(Buffer.alloc(6 * 1024 * 1024)) }))
            .rejects.toMatchObject({ status: 413 });
        expect(uploads).toHaveLength(0);
    });

    it("rejects a non-image with 415", async () => {
        await expect(mediaService.uploadBlogImage({ userId: verified, file: fileOf(Buffer.from("just some text, not an image"), "a.txt", "text/plain") }))
            .rejects.toMatchObject({ status: 415 });
        expect(uploads).toHaveLength(0);
    });

    it("rejects an unverified email with 403 before uploading", async () => {
        await expect(mediaService.uploadBlogImage({ userId: unverified, file: fileOf(PNG) }))
            .rejects.toMatchObject({ status: 403, message: "Verify your email to write on the blog" });
        expect(uploads).toHaveLength(0);
    });

    it("removes the upload when saving the row fails", async () => {
        const { mediaDb } = await import("@/db/media.db");
        const spy = vi.spyOn(mediaDb, "insertAsset").mockRejectedValueOnce(new Error("db down"));
        await expect(mediaService.uploadBlogImage({ userId: verified, file: fileOf(PNG) })).rejects.toThrow("db down");
        expect(destroyed).toContain(uploads.at(-1).objectKey);
        spy.mockRestore();
    });
});
