/** Where content media goes: Cloudinary in production, the local Payload CMS otherwise. Node builtins and relative imports only. */
import { appEnv, isLocalUrl } from "../../lib/appEnv.mjs";

export function resolveMediaTarget(env) {
    if (appEnv(env) === "production") {
        for (const name of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
            if (!env[name]) throw new Error(`production media upload needs ${name}`);
        }
        return { provider: "cloudinary", manifestName: "assets.json", courseManifestName: "course.json" };
    }
    if (!env.PAYLOAD_URL || !env.PAYLOAD_API_KEY) throw new Error("non-production media upload needs PAYLOAD_URL and PAYLOAD_API_KEY");
    if (!isLocalUrl(env.PAYLOAD_URL)) throw new Error(`PAYLOAD_URL must point at a local CMS, got ${env.PAYLOAD_URL}`);
    return { provider: "payload", manifestName: "assets.local.json", courseManifestName: "course.local.json" };
}

export const needsUpload = (entry, checksum, { remoteExists }) => !entry || entry.checksum !== checksum || remoteExists === false;

export const mediaKey = ({ course, lesson, name }) => ["courses", course, lesson, name].filter(Boolean).join("/");

export const cloudinaryPublicId = (key) => `codedev/production/${key}`;

const formatOf = (mime) => String(mime || "").split("/")[1]?.replace(/\+.*/, "") || null;

/** Manifest entry for a Payload media doc (uploadToPayload result). */
export const payloadEntry = ({ key, doc, mime, checksum }) => ({
    key,
    url: doc.url,
    width: doc.width,
    height: doc.height,
    format: formatOf(doc.mimeType || mime),
    bytes: doc.filesize,
    checksum,
    provider: "payload",
    mime: doc.mimeType || mime,
});

/** Manifest entry for a Cloudinary upload result; `url` is the delivery URL, `mime` what that URL serves. */
export const cloudinaryEntry = ({ key, result, url, mime, checksum, video }) => ({
    key,
    publicId: result.public_id,
    url,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
    ...(video ? { duration: result.duration } : {}),
    checksum,
    provider: "cloudinary",
    mime,
});

/** Names present in both lists (a diagram and a video would share one key). */
export const duplicateNames = (imageFiles, videoFiles) => {
    const stem = (f) => f.replace(/\.[^.]+$/, "");
    const images = new Map(imageFiles.map((f) => [stem(f), f]));
    return videoFiles.filter((f) => images.has(stem(f))).map((f) => [images.get(stem(f)), f]);
};
