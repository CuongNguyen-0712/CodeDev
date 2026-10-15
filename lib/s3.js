import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// S3-compatible storage (Neon storage). Server-only module.
// - public bucket:  challenge starter / harness files (S3_BUCKET)
// - private bucket: user-owned files such as code submissions (S3_PRIVATE_BUCKET)
export const buckets = {
    public: process.env.S3_BUCKET,
    private: process.env.S3_PRIVATE_BUCKET || "private",
};

// User submissions live under coding/ in the private bucket; everything else is public content.
export function bucketForKey(key = "") {
    return key.startsWith("coding/") ? buckets.private : buckets.public;
}

let s3Client = null;

function getClient() {
    if (s3Client) return s3Client;

    if (!process.env.AWS_ENDPOINT_URL_S3 || !buckets.public) {
        throw new Error("S3 storage is not configured (AWS_ENDPOINT_URL_S3 / S3_BUCKET)");
    }

    s3Client = new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
        endpoint: process.env.AWS_ENDPOINT_URL_S3,
        forcePathStyle: true,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });

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
};

export default s3;
