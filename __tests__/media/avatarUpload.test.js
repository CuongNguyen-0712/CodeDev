import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Avatar upload flow: real PostgreSQL (DATABASE_URL), Cloudinary mocked. Checks the format
 * sniffing, the server-chosen folder, the single transaction (asset row + profile pointer +
 * retired previous avatar) and the cleanup of uploads that could not be saved.
 * The test user's profile image is restored afterwards.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const uploads = [];
const destroyed = [];

vi.mock("@/lib/cloudinary", async () => {
    const actual = await vi.importActual("@/lib/cloudinary");
    return {
        ...actual,
        isCloudinaryConfigured: () => true,
        uploadBuffer: vi.fn(async (buffer, options) => {
            const publicId = `${options.folder}/${options.public_id}`;
            uploads.push({ publicId, options, bytes: buffer.length });
            return {
                public_id: publicId,
                secure_url: `https://res.cloudinary.com/test/image/upload/v1/${publicId}.png`,
                bytes: buffer.length, width: 64, height: 64, format: "png", version: 1,
            };
        }),
        destroyAsset: vi.fn(async (publicId) => {
            destroyed.push(publicId);
            return "ok";
        }),
    };
});

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
        expect(cloudinaryFolder("users", "abc-123", "avatars")).toBe("codedev/test/users/abc-123/avatars");
        expect(cloudinaryFolder("users", "../../etc", "avatars")).toBe("codedev/test/users/______etc/avatars");
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
        await sql(`DELETE FROM storage.assets WHERE provider = 'cloudinary' AND object_key LIKE 'codedev/test/%'`);
    });

    beforeEach(() => {
        uploads.length = 0;
        destroyed.length = 0;
    });

    const profile = async () => (await sql(
        `SELECT i.image, i.avatar_asset_id::text AS asset_id FROM profile.info i JOIN identity.users u ON u.id = i.user_id WHERE u.public_id = $1`,
        [userId]
    )).rows[0];

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
        expect(uploads[0].options.folder).toBe(`codedev/test/users/${userId}/avatars`);
        expect(uploads[0].options).toMatchObject({ resource_type: "image", overwrite: false });

        const current = await profile();
        expect(current.image).toBe(result.image);
        const asset = (await sql(`SELECT * FROM storage.assets WHERE id = $1`, [current.asset_id])).rows[0];
        expect(asset).toMatchObject({ provider: "cloudinary", purpose: "avatar", mine_type: "image/png", format: "png", width: 64, deleted_at: null });
        expect(asset.object_key).toBe(uploads[0].publicId);
        expect(asset.checksum).toMatch(/^[0-9a-f]{64}$/);
    });

    it("replacing an avatar retires the previous asset and deletes its file", async () => {
        await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        const first = await profile();
        const firstKey = uploads.at(-1).publicId;

        await mediaService.uploadAvatar({ userId, file: fileOf(PNG) });
        const second = await profile();

        expect(second.asset_id).not.toBe(first.asset_id);
        const old = (await sql(`SELECT deleted_at FROM storage.assets WHERE id = $1`, [first.asset_id])).rows[0];
        expect(old.deleted_at).not.toBeNull();
        expect(destroyed).toContain(firstKey);
    });

    it("removes the new upload again when the database write fails", async () => {
        const { mediaDb } = await import("@/db/media.db");
        const before = await profile();
        const spy = vi.spyOn(mediaDb, "setAvatar").mockRejectedValueOnce(new Error("db down"));

        await expect(mediaService.uploadAvatar({ userId, file: fileOf(PNG) })).rejects.toThrow("db down");
        expect(destroyed).toContain(uploads.at(-1).publicId);
        expect(await profile()).toEqual(before);
        spy.mockRestore();
    });
});
