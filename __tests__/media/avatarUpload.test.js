import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Avatar upload flow: real PostgreSQL (DATABASE_URL), media store mocked. Checks the format
 * sniffing, the server-chosen folder, the single transaction (asset row + profile pointer), the
 * kept history (newest 10, restore, delete) and the cleanup of uploads that could not be saved.
 * The test user's profile image is restored afterwards.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const uploads = [];
const destroyed = [];
const purged = [];
const fake = { configured: true, seq: 0, run: Math.random().toString(36).slice(2, 8) };

vi.mock("@/lib/media/mediaStore", () => ({
    mediaStore: () => ({
        provider: "payload",
        isConfigured: () => fake.configured,
        upload: async (buffer, options) => {
            const objectKey = `t${fake.run}${fake.seq++}`;
            uploads.push({ objectKey, options, bytes: buffer.length });
            return { provider: "payload", objectKey, url: `http://127.0.0.1:3010/api/media/file/${objectKey}.png`, width: 64, height: 64, format: "png", version: null, bytes: buffer.length };
        },
        destroy: async (id) => { destroyed.push(id); return "ok"; },
    }),
    destroyStoredFile: async ({ provider, objectKey }) => { destroyed.push(objectKey); purged.push({ provider, objectKey }); },
}));

// 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const fileOf = (bytes, name = "me.png", type = "image/png") => new File([bytes], name, { type });

describe("image type detection", () => {
    it("trusts the bytes, not the declared MIME type", async () => {
        const { detectImageType } = await import("@/lib/imageType");
        expect(detectImageType(PNG)).toEqual({ mime: "image/png", format: "png" });
        expect(detectImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
        expect(detectImageType(Buffer.from("GIF89a" + "x".repeat(10)))).toMatchObject({ format: "gif" });
        expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toMatchObject({ format: "jpg" });
    });

    it("builds upload folders per environment from server-side values only", async () => {
        const { cloudinaryFolder } = await vi.importActual("@/lib/cloudinary");
        expect(cloudinaryFolder("users", "abc-123", "avatars")).toBe("codedev/production/users/abc-123/avatars");
        expect(cloudinaryFolder("users", "../../etc", "avatars")).toBe("codedev/production/users/______etc/avatars");
    });
});

describe.skipIf(!hasDb)("avatar upload (PostgreSQL)", () => {
    let sql, mediaService, userId, original;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ mediaService } = await import("@/services/media.service"));
        const row = (await sql(
            `SELECT u.public_id, i.image, i.avatar_asset_id FROM identity.users u JOIN profile.info i ON i.user_id = u.id ORDER BY u.id LIMIT 1`
        )).rows[0];
        userId = row.public_id;
        original = { image: row.image, avatarAssetId: row.avatar_asset_id };
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(
            `UPDATE profile.info SET image = $1, avatar_asset_id = $2 WHERE user_id = (SELECT id FROM identity.users WHERE public_id = $3)`,
            [original.image, original.avatarAssetId, userId]
        );
        await sql(
            `DELETE FROM storage.assets WHERE object_key = 'codedev/test/other' OR owner_id = (SELECT id FROM identity.users WHERE public_id = $1)`,
            [userId]
        );
    });

    beforeEach(() => {
        uploads.length = 0;
        destroyed.length = 0;
        purged.length = 0;
        fake.configured = true;
    });

    const profile = async () => (await sql(
        `SELECT i.image, i.avatar_asset_id::text AS asset_id FROM profile.info i JOIN identity.users u ON u.id = i.user_id WHERE u.public_id = $1`,
        [userId]
    )).rows[0];

    it("returns 503 when the store is not configured, without a new asset row", async () => {
        fake.configured = false;
        const count = async () => (await sql(`SELECT count(*)::int AS n FROM storage.assets`)).rows[0].n;
        const before = await count();
        await expect(mediaService.uploadAvatar({ userId, file: fileOf(PNG) })).rejects.toMatchObject({ status: 503 });
        expect(await count()).toBe(before);
        expect(uploads).toHaveLength(0);
    });

    it("rejects files whose bytes are not an accepted image, whatever the declared type", async () => {
        await expect(mediaService.uploadAvatar({ userId, file: fileOf(Buffer.from("<svg onload=alert(1)>" + " ".repeat(20)), "x.png") }))
            .rejects.toMatchObject({ status: 415 });
        await expect(mediaService.uploadAvatar({ userId, file: fileOf(Buffer.alloc(6 * 1024 * 1024)) }))
            .rejects.toMatchObject({ status: 413 });
        expect(uploads).toHaveLength(0);
    });

    it("uploads into the user's folder and records the asset and the profile pointer together", async () => {
        const result = await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });

        expect(uploads).toHaveLength(1);
        expect(uploads[0].options.key).toMatch(new RegExp(`^users/${userId}/avatars/[0-9a-z]{26}$`));
        expect(uploads[0].options.maxSide).toBe(512);

        const current = await profile();
        expect(current.image).toBe(result.image);
        const asset = (await sql(`SELECT * FROM storage.assets WHERE id = $1`, [current.asset_id])).rows[0];
        expect(asset).toMatchObject({ provider: "payload", purpose: "avatar", mine_type: "image/png", format: "png", width: 64, deleted_at: null });
        expect(asset.object_key).toBe(uploads[0].objectKey);
        expect(asset.checksum).toMatch(/^[0-9a-f]{64}$/);
    });

    it("replacing an avatar keeps the previous one as history", async () => {
        await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        const first = await profile();
        const firstKey = uploads.at(-1).objectKey;

        await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        const second = await profile();

        expect(second.asset_id).not.toBe(first.asset_id);
        const old = (await sql(`SELECT deleted_at FROM storage.assets WHERE id = $1`, [first.asset_id])).rows[0];
        expect(old.deleted_at).toBeNull();
        expect(destroyed).not.toContain(firstKey);

        const list = await mediaService.listAvatars({ userId });
        expect(list[0]).toMatchObject({ current: true, url: second.image });
        expect(list.filter((item) => item.current)).toHaveLength(1);
    });

    it("keeps at most 10 avatars and deletes the files of older ones", async () => {
        for (let i = 0; i < 11; i++) await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        const keys = uploads.map((u) => u.objectKey);

        const list = await mediaService.listAvatars({ userId });
        expect(list).toHaveLength(10);
        expect(list[0].current).toBe(true);
        expect(destroyed).toContain(keys[0]);
        expect(destroyed).not.toContain(keys.at(-1));
    });

    it("restores a kept avatar, and refuses to delete the current one", async () => {
        await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        const [, older] = await mediaService.listAvatars({ userId });

        expect(await mediaService.restoreAvatar({ userId, assetId: older.id })).toEqual({ image: older.url });
        expect((await profile()).image).toBe(older.url);
        await expect(mediaService.deleteAvatar({ userId, assetId: older.id })).rejects.toMatchObject({ status: 409 });
        expect((await mediaService.listAvatars({ userId })).find((item) => item.current)?.id).toBe(older.id);
    });

    it("deletes a kept avatar and its file", async () => {
        await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        const oldKey = uploads.at(-1).objectKey;
        await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        const [, older] = await mediaService.listAvatars({ userId });

        expect(await mediaService.deleteAvatar({ userId, assetId: older.id })).toEqual({ deleted: true });
        expect(destroyed).toContain(oldKey);
        expect((await mediaService.listAvatars({ userId })).map((item) => item.id)).not.toContain(older.id);
        await expect(mediaService.restoreAvatar({ userId, assetId: older.id })).rejects.toMatchObject({ status: 404 });
    });

    it("refuses another user's avatar", async () => {
        const other = (await sql(
            `SELECT u.id FROM identity.users u JOIN profile.info i ON i.user_id = u.id WHERE u.public_id <> $1 ORDER BY u.id LIMIT 1`,
            [userId]
        )).rows[0];
        if (!other) return;
        const assetId = "ast_00000000000000000000000000";
        await sql(
            `INSERT INTO storage.assets (public_id, provider, object_key, external_url, resource_type, owner_id, purpose)
             VALUES ($1, 'cloudinary', 'codedev/test/other', 'https://res.cloudinary.com/x.png', 'image', $2, 'avatar')`,
            [assetId, other.id]
        );
        await expect(mediaService.restoreAvatar({ userId, assetId })).rejects.toMatchObject({ status: 404 });
        await expect(mediaService.deleteAvatar({ userId, assetId })).rejects.toMatchObject({ status: 404 });
    });

    it("removes the new upload again when the database write fails", async () => {
        const { mediaDb } = await import("@/db/media.db");
        const before = await profile();
        const spy = vi.spyOn(mediaDb, "setAvatar").mockRejectedValueOnce(new Error("db down"));

        await expect(mediaService.uploadAvatar({ userId, file: fileOf(PNG) })).rejects.toThrow("db down");
        expect(destroyed).toContain(uploads.at(-1).objectKey);
        expect(await profile()).toEqual(before);
        spy.mockRestore();
    });
});
