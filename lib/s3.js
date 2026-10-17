import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { resolveStorageConfig, s3ClientOptions, describeStorage } from "@/lib/storageConfig.mjs";

// S3-compatible object storage. Server-only module.
// The target follows the environment (lib/storageConfig.mjs): MinIO in development,
// Neon / S3 in production.
// - public bucket:  challenge starter / harness files (S3_BUCKET)
// - private bucket: user-owned files such as code submissions (S3_PRIVATE_BUCKET)
const storage = resolveStorageConfig();

export const buckets = storage.buckets;

export const storageInfo = () => ({ ...storage, credentials: undefined, description: describeStorage(storage) });

// User submissions live under coding/ in the private bucket; everything else is public content.
export function bucketForKey(key = "") {
    return key.startsWith("coding/") ? buckets.private : buckets.public;
}

let s3Client = null;

function getClient() {
    if (s3Client) return s3Client;

    s3Client = new S3Client(s3ClientOptions(storage));

    return s3Client;
}

export const s3 = {
    putText: async ({ key, body, bucket = bucketForKey(key), contentType = "text/plain; charset=utf-8", metadata = {} }) => {
        await getClient().send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            Metadata: metadata,
        }));

        return { key, bucket, size: Buffer.byteLength(body, "utf8") };
    },

    getText: async (key, { bucket = bucketForKey(key) } = {}) => {
        const response = await getClient().send(new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        }));

        return await response.Body.transformToString("utf-8");
    },

    delete: async (key, { bucket = bucketForKey(key) } = {}) => {
        await getClient().send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        }));
    },

    // Short-lived GET URL that makes the browser save the object as `filename`.
    getDownloadUrl: async (key, { bucket = bucketForKey(key), filename, expiresIn = 300 } = {}) => {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ...(filename && { ResponseContentDisposition: `attachment; filename="${filename.replace(/["\\\r\n]/g, "")}"` }),
        });

        return await getSignedUrl(getClient(), command, { expiresIn });
    },
};

/** Reachability of both buckets, for /api/health. */
export async function checkStorage() {
    const client = getClient();
    await Promise.all([buckets.public, buckets.private].map((Bucket) => client.send(new HeadBucketCommand({ Bucket }))));
    return true;
}

export default s3;
