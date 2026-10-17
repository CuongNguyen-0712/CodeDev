import crypto from "crypto";
import { ulid } from "ulid";

import { cloudinaryFolder, destroyAsset, isCloudinaryConfigured, uploadBuffer } from "@/lib/cloudinary";
import { detectImageType, ACCEPTED_IMAGE_FORMATS } from "@/lib/imageType";
import { ApiError } from "@/lib/error/apiError";
import { invalidateUserCache } from "@/lib/cacheKeys";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";
import { mediaDb } from "@/db/media.db";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
// Incoming transformation: Cloudinary stores at most 512x512, so the original is never kept.
const AVATAR_MAX_SIDE = 512;

function isFileLike(file) {
    return file && typeof file === "object" && typeof file.arrayBuffer === "function" && typeof file.size === "number";
}

/**
 * Avatar upload:
 *   1. validate size and the real format (magic bytes, not the client MIME type);
 *   2. upload to <root>/<APP_ENV>/users/<userId>/avatars/<ulid> (folder chosen by the server);
 *   3. one DB transaction: storage.assets row + profile.info.image / avatar_asset_id, previous
 *      avatar marked deleted;
 *   4. after commit: delete the previous Cloudinary file, drop the user's caches, notify tabs.
 * If step 3 fails the new upload is deleted again, so no orphan stays in Cloudinary.
 */
export const mediaService = {
    uploadAvatar: async ({ userId, file }) => {
        if (!userId) throw new ApiError("Unauthorized", 401);
        if (!isFileLike(file)) throw new ApiError("Choose an image file to upload", 400);
        if (file.size === 0) throw new ApiError("The image file is empty", 400);
        if (file.size > MAX_AVATAR_BYTES) throw new ApiError("Images can be at most 5 MB", 413);
        if (!isCloudinaryConfigured()) throw new ApiError("Image uploads are not available right now", 503, { expose: true });

        const buffer = Buffer.from(await file.arrayBuffer());
        const type = detectImageType(buffer);
        if (!type) {
            throw new ApiError(`Unsupported image. Use ${ACCEPTED_IMAGE_FORMATS.map((f) => f.toUpperCase()).join(", ")}.`, 415);
        }

        const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
        const folder = cloudinaryFolder("users", userId, "avatars");

        let uploaded;
        try {
            uploaded = await uploadBuffer(buffer, {
                folder,
                public_id: ulid().toLowerCase(),
                resource_type: "image",
                allowed_formats: ACCEPTED_IMAGE_FORMATS,
                overwrite: false,
                transformation: [{ width: AVATAR_MAX_SIDE, height: AVATAR_MAX_SIDE, crop: "limit" }],
                tags: ["avatar"],
                context: { purpose: "avatar" },
            });
        } catch (error) {
            console.error("[media] Cloudinary upload failed:", error?.http_code, error?.message);
            throw new ApiError("Failed to upload the image, try again later", 502, { expose: true });
        }

        const asset = {
            publicId: `ast_${ulid().toLowerCase()}`,
            objectKey: uploaded.public_id,
            url: uploaded.secure_url,
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
            await destroyAsset(uploaded.public_id).catch((cleanupError) => {
                console.error("[media] Failed to remove orphaned upload:", uploaded.public_id, cleanupError?.message);
            });
            throw error;
        }

        if (!saved) {
            await destroyAsset(uploaded.public_id).catch(() => { });
            throw new ApiError("User not found", 404);
        }

        if (saved.previous?.provider === "cloudinary" && saved.previous.objectKey) {
            // Best effort: the DB already points at the new avatar; a leftover file is only storage.
            await destroyAsset(saved.previous.objectKey).catch((error) => {
                console.error("[media] Failed to delete previous avatar:", saved.previous.objectKey, error?.message);
            });
        }

        await invalidateUserCache(userId);
        publishToUser(userId, events.PROFILE_UPDATED, {});

        return { image: asset.url, width: asset.width, height: asset.height };
    },
};

export default mediaService;
