import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

export function isCloudinaryConfigured() {
    return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/**
 * Folder for uploads, decided by the server only:
 *   <CLOUDINARY_ROOT_FOLDER | "codedev">/production/<...parts>
 * Cloudinary is used by production only (development and test store media in the Payload CMS),
 * so the segment is fixed; it also lets stray non-production files be told apart and wiped.
 */
export function cloudinaryFolder(...parts) {
    const root = String(process.env.CLOUDINARY_ROOT_FOLDER || "codedev").replace(/^\/+|\/+$/g, "");
    const safe = parts.map((part) => String(part).replace(/[^A-Za-z0-9_-]/g, "_"));
    return [root, "production", ...safe].join("/");
}

/** Streams a buffer to Cloudinary (no base64 data URI: ~33% smaller request). */
export function uploadBuffer(buffer, options) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
        stream.end(buffer);
    });
}

/** Deletes an asset and purges it from the CDN. Missing assets count as deleted. */
export async function destroyAsset(publicId, { resourceType = "image" } = {}) {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
    if (result?.result !== "ok" && result?.result !== "not found") {
        throw new Error(`Cloudinary destroy failed: ${result?.result || "unknown"}`);
    }
    return result.result;
}

export default cloudinary;
