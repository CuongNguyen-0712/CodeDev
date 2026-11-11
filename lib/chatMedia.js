import { Bucket } from "@upstash/blob";

import { isProductionEnv } from "@/lib/appEnv.mjs";
import { FILE_TYPES } from "@/lib/chat/limits";
import cloudinary, { cloudinaryFolder, destroyAsset, isCloudinaryConfigured } from "@/lib/cloudinary";
import { ApiError } from "@/lib/error/apiError";
import { buckets, s3, storageInfo } from "@/lib/s3.js";

// Private chat attachment storage. Server-only: import from services/routes, never from client code.
// New uploads: Cloudinary (images) and Upstash Blob (files) in production, the MinIO/S3 chat bucket
// elsewhere. Reads and deletes follow each row's `provider`, never the env.
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MIME_BY_FORMAT = Object.fromEntries(Object.entries(EXTENSIONS).map(([mime, ext]) => [ext, mime]));
const READ_SECONDS = 300;
const ID = /^(cnv|att)_[0-9a-z]{26}$/;

export const chatMediaProvider = () => (process.env.UPSTASH_BLOB_TOKEN ? "upstash" : "s3");

export function chatMediaKey({ conversationId, attachmentId, contentType }) {
    const extension = EXTENSIONS[contentType];
    if (!extension) throw new Error(`Unsupported chat image type: ${contentType}`);
    return `chat/${conversationId}/${attachmentId}.${extension}`;
}

let upstash = null;
const upstashBucket = () => (upstash ??= Bucket.fromEnv());

// Key API guard: production on S3 without Cloudinary configured turns chat images off, the rest of the site unaffected.
function assertConfigured() {
    if (chatMediaProvider() === "s3" && !storageInfo().chatImagesConfigured) throw new ApiError("Chat images are not configured", 503);
}

// Upstash: code not_found. S3: NotFound / 404. Cloudinary: http_code 404, on the error or under `error` (SDK rejection shape).
const isMissing = (error) => error?.code === "not_found" || error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404
    || error?.http_code === 404 || error?.error?.http_code === 404;

export async function signUpload(key, { contentType, size }) {
    assertConfigured();
    if (chatMediaProvider() === "upstash") {
        const { url, headers } = await upstashBucket().signedUploadUrl(key, { contentType, size });
        return { url, method: "PUT", headers };
    }
    const url = await s3.presignPut(key, { bucket: buckets.chat, contentType, size });
    return { url, method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(size) } };
}

export async function signRead(key) {
    assertConfigured();
    if (chatMediaProvider() === "upstash") {
        const { url, expiresAt } = await upstashBucket().signedReadUrl(key);
        return { url, expiresAt };
    }
    const url = await s3.presignGet(key, { bucket: buckets.chat, expiresIn: READ_SECONDS });
    return { url, expiresAt: new Date(Date.now() + READ_SECONDS * 1000) };
}

export async function inspect(key) {
    assertConfigured();
    try {
        if (chatMediaProvider() === "upstash") {
            const { contentType, size } = await upstashBucket().info(key);
            return { contentType, size };
        }
        const head = await s3.head(key, { bucket: buckets.chat });
        return { contentType: head.ContentType, size: head.ContentLength };
    } catch (error) {
        if (isMissing(error)) return null;
        throw error;
    }
}

export async function remove(key) {
    assertConfigured();
    try {
        if (chatMediaProvider() === "upstash") await upstashBucket().del(key);
        else await s3.delete(key, { bucket: buckets.chat });
    } catch (error) {
        if (!isMissing(error)) throw error;
    }
}

// --- Attachment API: every call takes a row `{ kind, provider, storageKey, contentType, size, fileName }`.
// Lives beside the key API above until its callers move over; inspectAttachment / removeAttachment
// then take the names inspect / remove.

const own = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

/** Where a new upload of this kind goes. */
export const storageFor = (kind) => (isProductionEnv() ? (kind === "image" ? "cloudinary" : "upstash") : "s3");

/** Built from server-generated ids only; the extension comes from the allow-lists, never free text. */
export function storageKeyFor({ kind, provider, conversationId, attachmentId, contentType, fileName }) {
    if (!ID.test(conversationId) || !ID.test(attachmentId)) throw new Error("Chat storage keys take server-generated ids only");
    const fileExtension = /\.([^.]+)$/.exec(fileName ?? "")?.[1].toLowerCase();
    const extension = kind === "image" ? own(EXTENSIONS, contentType) : own(FILE_TYPES, fileExtension) && fileExtension;
    if (!extension) throw new Error(`Unsupported chat ${kind}: ${kind === "image" ? contentType : fileName}`);
    if (provider === "cloudinary") return `${cloudinaryFolder("chat", conversationId)}/${attachmentId}`;
    return `chat/${conversationId}/${attachmentId}.${extension}`;
}

const READY = {
    cloudinary: () => isCloudinaryConfigured(),
    upstash: () => Boolean(process.env.UPSTASH_BLOB_TOKEN),
    s3: () => true,
};

// Before any client call: a missing production store disables only that kind.
function assertReady({ kind, provider }) {
    const ready = own(READY, provider);
    if (!ready) throw new Error(`Unknown chat storage provider: ${provider}`);
    if (!ready()) throw new ApiError(kind === "file" ? "Chat files are not configured" : "Chat images are not configured", 503);
}

export async function uploadTicket(att) {
    assertReady(att);
    const { provider, storageKey: key, contentType, size } = att;
    if (provider === "cloudinary") {
        // No `folder`: with dynamic folders the public id carries the path. The secret signs, never travels.
        const paramsToSign = {
            public_id: key,
            timestamp: Math.floor(Date.now() / 1000),
            type: "authenticated",
            allowed_formats: "jpg,png,webp",
            overwrite: "false",
        };
        const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);
        return {
            method: "POST",
            url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
            fields: { ...paramsToSign, api_key: process.env.CLOUDINARY_API_KEY, signature },
        };
    }
    if (provider === "upstash") {
        const { url, headers } = await upstashBucket().signedUploadUrl(key, { contentType, size });
        return { method: "PUT", url, headers };
    }
    const url = await s3.presignPut(key, { bucket: buckets.chat, contentType, size });
    return { method: "PUT", url, headers: { "Content-Type": contentType, "Content-Length": String(size) } };
}

/** `{ contentType, size }` of the stored object, or null when there is none. */
export async function inspectAttachment(att) {
    assertReady(att);
    const { provider, storageKey: key } = att;
    try {
        if (provider === "cloudinary") {
            const { format, bytes } = await cloudinary.api.resource(key, { type: "authenticated", resource_type: "image" });
            return { contentType: own(MIME_BY_FORMAT, format) ?? null, size: bytes };
        }
        if (provider === "upstash") {
            const { contentType, size } = await upstashBucket().info(key);
            return { contentType, size };
        }
        const head = await s3.head(key, { bucket: buckets.chat });
        return { contentType: head.ContentType, size: head.ContentLength };
    } catch (error) {
        if (isMissing(error)) return null;
        throw error;
    }
}

/** Short-lived URL: images open, files download under their original name. */
export async function readUrl(att) {
    assertReady(att);
    const { kind, provider, storageKey: key, contentType, fileName } = att;
    if (provider === "cloudinary") {
        return cloudinary.utils.private_download_url(key, own(EXTENSIONS, contentType), {
            type: "authenticated",
            resource_type: "image",
            expires_at: Math.floor(Date.now() / 1000) + READ_SECONDS,
        });
    }
    if (provider === "upstash") return (await upstashBucket().signedReadUrl(key, { downloadAs: fileName })).url;
    if (kind === "file") return await s3.getDownloadUrl(key, { bucket: buckets.chat, filename: fileName });
    return await s3.presignGet(key, { bucket: buckets.chat, expiresIn: READ_SECONDS });
}

/** A missing object counts as removed. */
export async function removeAttachment(att) {
    assertReady(att);
    const { provider, storageKey: key } = att;
    try {
        if (provider === "cloudinary") await destroyAsset(key, { resourceType: "image", type: "authenticated" });
        else if (provider === "upstash") await upstashBucket().del(key);
        else await s3.delete(key, { bucket: buckets.chat });
    } catch (error) {
        if (!isMissing(error)) throw error;
    }
}
