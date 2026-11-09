import path from "node:path";

import { cloudinaryFolder, destroyAsset, isCloudinaryConfigured, uploadBuffer } from "@/lib/cloudinary";
import { isProductionEnv } from "@/lib/appEnv.mjs";
import { deleteFromPayload, payloadConfig, uploadToPayload } from "@/lib/media/payloadMedia.mjs";

const cloudinaryStore = {
    provider: "cloudinary",
    isConfigured: isCloudinaryConfigured,
    async upload(buffer, { key, maxSide }) {
        const result = await uploadBuffer(buffer, {
            folder: cloudinaryFolder(...path.posix.dirname(key).split("/").filter((part) => part && part !== ".")),
            public_id: path.posix.basename(key),
            resource_type: "image",
            overwrite: true,
            invalidate: true,
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

export async function destroyStoredFile({ provider, objectKey, bucket }) {
    if (provider === "cloudinary") return void (await destroyAsset(objectKey));
    if (provider === "payload") return void (await payloadStore(process.env).destroy(objectKey));
    const { s3 } = await import("@/lib/s3");
    await s3.delete(objectKey, { bucket });
}
