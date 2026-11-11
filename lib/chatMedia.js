import { Bucket } from "@upstash/blob";

import { ApiError } from "@/lib/error/apiError";
import { buckets, s3, storageInfo } from "@/lib/s3.js";

// Private chat image storage. Server-only: import from services/routes, never from client code.
// Upstash Blob in production (UPSTASH_BLOB_TOKEN set), the MinIO/S3 chat bucket otherwise.
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const S3_READ_SECONDS = 300;

export const chatMediaProvider = () => (process.env.UPSTASH_BLOB_TOKEN ? "upstash" : "s3");

export function chatMediaKey({ conversationId, attachmentId, contentType }) {
    const extension = EXTENSIONS[contentType];
    if (!extension) throw new Error(`Unsupported chat image type: ${contentType}`);
    return `chat/${conversationId}/${attachmentId}.${extension}`;
}

let upstash = null;
const upstashBucket = () => (upstash ??= Bucket.fromEnv());

// Production on S3 with neither UPSTASH_BLOB_TOKEN nor S3_CHAT_BUCKET: chat images off, the rest of the site unaffected.
function assertConfigured() {
    if (chatMediaProvider() === "s3" && !storageInfo().chatConfigured) throw new ApiError("Chat images are not configured", 503);
}

const isMissing = (error) => error?.code === "not_found" || error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404;

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
    const url = await s3.presignGet(key, { bucket: buckets.chat, expiresIn: S3_READ_SECONDS });
    return { url, expiresAt: new Date(Date.now() + S3_READ_SECONDS * 1000) };
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
