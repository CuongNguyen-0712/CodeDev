import path from "node:path";

import { cloudinaryFolder, destroyAsset, isCloudinaryConfigured, uploadBuffer } from "@/lib/cloudinary";
import { isProductionEnv } from "@/lib/appEnv.mjs";
import { deleteFromPayload, payloadConfig, uploadToPayload } from "@/lib/media/payloadMedia.mjs";

const cloudinaryStore = {
    provider: "cloudinary",
    isConfigured: isCloudinaryConfigured,
    async upload(buffer, { key, maxSide, purpose, allowedFormats }) {
        const result = await uploadBuffer(buffer, {
            folder: cloudinaryFolder(...path.posix.dirname(key).split("/").filter((part) => part && part !== ".")),
            public_id: path.posix.basename(key),
            resource_type: "image",
            overwrite: false,
            ...(purpose ? { tags: [purpose], context: { purpose } } : {}),
            ...(allowedFormats ? { allowed_formats: allowedFormats } : {}),
            ...(maxSide ? { transformation: [{ width: maxSide, height: maxSide, crop: "limit" }] } : {}),
        });
        return {
            provider: "cloudinary",
            objectKey: result.public_id,
            url: result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            version: result.version,
            bytes: result.bytes,
        };
    },
    destroy: (objectKey) => destroyAsset(objectKey),
};

function payloadStore(env) {
    return {
        provider: "payload",
        isConfigured: () => payloadConfig(env) !== null,
        async upload(buffer, { key, mime, filename, purpose }) {
            const config = payloadConfig(env);
            if (!config) throw new Error("Payload media is not configured (PAYLOAD_URL, PAYLOAD_API_KEY)");
            const doc = await uploadToPayload({ ...config, buffer, filename, mime, key, purpose });
            return {
                provider: "payload",
                objectKey: String(doc.id),
                url: doc.url,
                width: doc.width,
                height: doc.height,
                format: String(doc.mimeType || "").split("/")[1] || null,
                version: null,
                bytes: doc.filesize,
            };
        },
        async destroy(objectKey) {
            const config = payloadConfig(env);
            if (!config) throw new Error("Payload media is not configured (PAYLOAD_URL, PAYLOAD_API_KEY)");
            return deleteFromPayload({ ...config, id: objectKey });
        },
    };
}

/** Cloudinary only in production; every other environment stores media in the Payload CMS. */
export function mediaStore(env = process.env) {
    return isProductionEnv(env) ? cloudinaryStore : payloadStore(env);
}

/**
 * Deletes a stored file. Each provider is only touched from its own environment: Cloudinary (production
 * media) is never deleted from elsewhere ("skipped", which callers treat as done), and production never
 * calls a Payload CMS.
 */
export async function destroyStoredFile({ provider, objectKey, bucket }, env = process.env) {
    const production = isProductionEnv(env);
    if (provider === "cloudinary") {
        if (!production) {
            console.warn("[media] not deleting Cloudinary file outside production:", objectKey);
            return "skipped";
        }
        return void (await destroyAsset(objectKey));
    }
    if (provider === "payload") {
        if (production) throw new Error(`refusing to delete Payload file ${objectKey} from production`);
        return void (await payloadStore(env).destroy(objectKey));
    }
    const { s3 } = await import("@/lib/s3");
    await s3.delete(objectKey, { bucket });
}
