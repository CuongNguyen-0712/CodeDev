import crypto from "crypto";
import { ulid } from "ulid";

import { destroyStoredFile, mediaStore } from "@/lib/media/mediaStore";
import { isProductionEnv } from "@/lib/appEnv.mjs";
import { detectImageType, ACCEPTED_IMAGE_FORMATS } from "@/lib/imageType";
import { ApiError } from "@/lib/error/apiError";
import { invalidateUserCache } from "@/lib/cacheKeys";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";
import { mediaDb } from "@/db/media.db";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
// The store keeps at most 512x512 (Cloudinary transformation / Payload resize), so the original is never kept.
const AVATAR_MAX_SIDE = 512;

function isFileLike(file) {
    return file && typeof file === "object" && typeof file.arrayBuffer === "function" && typeof file.size === "number";
}

/**
 * Avatar upload:
 *   1. validate size and the real format (magic bytes, not the client MIME type);
 *   2. upload through the media store (Cloudinary in production, the local Payload CMS elsewhere) to
 *      users/<userId>/avatars/<ulid> (key chosen by the server);
 *   3. one DB transaction: storage.assets row + profile.info.image / avatar_asset_id; earlier
 *      avatars stay as history, those past the newest 10 are marked deleted;
 *   4. after commit: delete the pruned files, drop the user's caches, notify tabs.
 * If step 3 fails the new upload is deleted again, so no orphan stays in the store.
 */
export const mediaService = {
    uploadAvatar: async ({ userId, file }) => {
        if (!userId) throw new ApiError("Unauthorized", 401);
        if (!isFileLike(file)) throw new ApiError("Choose an image file to upload", 400);
        if (file.size === 0) throw new ApiError("The image file is empty", 400);
        if (file.size > MAX_AVATAR_BYTES) throw new ApiError("Images can be at most 5 MB", 413);
        const store = mediaStore();
        if (!store.isConfigured()) {
            if (!isProductionEnv()) console.warn("[media] start the local CMS: npm run cms:up");
            throw new ApiError("Image uploads are not available right now", 503, { expose: true });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const type = detectImageType(buffer);
        if (!type) {
            throw new ApiError(`Unsupported image. Use ${ACCEPTED_IMAGE_FORMATS.map((f) => f.toUpperCase()).join(", ")}.`, 415);
        }

        const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

        let uploaded;
        try {
            uploaded = await store.upload(buffer, {
                key: `users/${userId}/avatars/${ulid().toLowerCase()}`,
                mime: type.mime,
                filename: `avatar.${type.format}`,
                maxSide: AVATAR_MAX_SIDE,
                allowedFormats: ACCEPTED_IMAGE_FORMATS,
                purpose: "avatar",
            });
        } catch (error) {
            console.error(`[media] ${store.provider} upload failed:`, error?.http_code ?? error?.status, error?.message);
            // No HTTP status: the store was not reached (local CMS down while PAYLOAD_URL is set).
            if (!isProductionEnv() && error?.status == null && error?.http_code == null) {
                console.warn("[media] start the local CMS: npm run cms:up");
                throw new ApiError("Image uploads are not available right now", 503, { expose: true });
            }
            throw new ApiError("Failed to upload the image, try again later", 502, { expose: true });
        }

        const asset = {
            publicId: `ast_${ulid().toLowerCase()}`,
            provider: uploaded.provider,
            objectKey: uploaded.objectKey,
            url: uploaded.url,
            mime: type.mime,
            size: uploaded.bytes ?? file.size,
            originalName: typeof file.name === "string" ? file.name.slice(0, 255) : null,
            width: uploaded.width ?? null,
            height: uploaded.height ?? null,
            format: uploaded.format ?? type.format,
            version: uploaded.version ?? null,
            checksum,
        };

        let saved;
        try {
            saved = await mediaDb.setAvatar({ userId, asset });
        } catch (error) {
            await store.destroy(uploaded.objectKey).catch((cleanupError) => {
                console.error("[media] Failed to remove orphaned upload:", uploaded.objectKey, cleanupError?.message);
            });
            throw error;
        }

        if (!saved) {
            await store.destroy(uploaded.objectKey).catch(() => { });
            throw new ApiError("User not found", 404);
        }

        for (const old of saved.pruned) await destroyFile(old);
        await afterAvatarChange(userId);

        return { image: asset.url, width: asset.width, height: asset.height };
    },

    listAvatars: async ({ userId }) => {
        const rows = await mediaDb.listAvatars({ userId });
        return rows.map((row) => ({
            id: row.public_id,
            url: row.external_url,
            width: row.width,
            height: row.height,
            createdAt: row.created_at,
            current: Boolean(row.current),
        }));
    },

    /** Makes a kept avatar the profile image again. */
    restoreAvatar: async ({ userId, assetId }) => {
        const result = await mediaDb.restoreAvatar({ userId, assetPublicId: assetId });
        if (!result) throw new ApiError("That photo is no longer available", 404);
        await afterAvatarChange(userId);
        return { image: result.url };
    },

    /** Deletes a kept avatar (not the current one) and its file. */
    deleteAvatar: async ({ userId, assetId }) => {
        const result = await mediaDb.deleteAvatar({ userId, assetPublicId: assetId });
        if (!result) throw new ApiError("That photo is no longer available", 404);
        if (result === "current") throw new ApiError("Choose another photo before deleting your current one", 409);
        await destroyFile(result);
        return { deleted: true };
    },
};

// Best effort: the DB no longer uses the file; a leftover file is only storage.
async function destroyFile({ provider, objectKey }) {
    if (!objectKey) return;
    await destroyStoredFile({ provider, objectKey }).catch((error) => {
        console.error("[media] Failed to delete avatar file:", objectKey, error?.message);
    });
}

async function afterAvatarChange(userId) {
    await invalidateUserCache(userId);
    await publishToUser(userId, events.PROFILE_UPDATED, {});
}

export default mediaService;
