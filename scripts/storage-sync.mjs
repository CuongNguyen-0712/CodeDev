#!/usr/bin/env node
/**
 * Copies the object storage of the remote environment (Neon S3, AWS_* variables) into the local
 * MinIO of compose.yml (MINIO_* variables): every bucket, folder placeholder and file,
 * keeping keys, content type and metadata. Read-only on the source; never deletes on the target.
 *
 * Usage:
 *   node scripts/storage-sync.mjs                    # .env.local, both buckets
 *   node scripts/storage-sync.mjs --init             # only create the buckets in MinIO
 *   node scripts/storage-sync.mjs --dry-run          # print the plan only
 *   node scripts/storage-sync.mjs --bucket public    # one bucket
 *   node scripts/storage-sync.mjs --prefix challenges/javascript/
 *   node scripts/storage-sync.mjs --env .env.development.local
 *
 * Unchanged objects (same size and ETag) are skipped, so the script can be re-run any time,
 * e.g. to pick up new production files or after the MinIO volume was reset.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
    HeadObjectCommand,
    HeadBucketCommand,
    CreateBucketCommand,
} from "@aws-sdk/client-s3";

import { resolveStorageConfig, s3ClientOptions, describeStorage } from "../lib/storageConfig.mjs";
import { isLocalUrl } from "../lib/appEnv.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const envFile = option("--env", ".env.local");
const dryRun = args.includes("--dry-run");
const initOnly = args.includes("--init");
const prefix = option("--prefix", "");
const onlyBucket = option("--bucket");
const CONCURRENCY = 4;

dotenv.config({ path: path.resolve(root, envFile), quiet: true });
dotenv.config({ path: path.resolve(root, ".env"), quiet: true });

// Source: the remote S3 (AWS_*). Target: the local MinIO (MINIO_*). Read with explicit providers
// so the per-environment default does not matter here.
const sourceConfig = resolveStorageConfig({ ...process.env, APP_ENV: "development", STORAGE_PROVIDER: "s3" });
const targetConfig = resolveStorageConfig({ ...process.env, APP_ENV: "development", STORAGE_PROVIDER: "minio" });

if (!isLocalUrl(targetConfig.endpoint)) {
    console.error(`Refusing to write: target ${describeStorage(targetConfig)} is not a local endpoint.`);
    process.exit(1);
}

const source = initOnly ? null : new S3Client(s3ClientOptions(sourceConfig));
const target = new S3Client(s3ClientOptions(targetConfig));

const buckets = [targetConfig.buckets.public, targetConfig.buckets.private]
    .filter((bucket) => !onlyBucket || bucket === onlyBucket);

if (!initOnly) console.log(`source: ${describeStorage(sourceConfig)}`);
console.log(`target: ${describeStorage(targetConfig)}${dryRun ? "  [dry-run]" : ""}`);

/** `docker compose up -d` returns before MinIO listens: retry connection errors for ~20 s. */
async function withStartupRetry(run) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await run();
        } catch (error) {
            const starting = ["ECONNREFUSED", "ECONNRESET"].includes(error?.code) || error?.$metadata?.httpStatusCode === 503;
            if (!starting || attempt >= 10) throw error;
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
}

async function* listObjects(bucket) {
    let ContinuationToken;
    do {
        const page = await source.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken }));
        for (const object of page.Contents || []) yield object;
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
}

async function ensureBucket(bucket) {
    try {
        await withStartupRetry(() => target.send(new HeadBucketCommand({ Bucket: bucket })));
        return false;
    } catch (error) {
        if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== "NotFound") throw error;
    }
    if (!dryRun) await target.send(new CreateBucketCommand({ Bucket: bucket }));
    return true;
}

async function isUpToDate(bucket, object) {
    try {
        const head = await target.send(new HeadObjectCommand({ Bucket: bucket, Key: object.Key }));
        return head.ContentLength === object.Size && head.ETag === object.ETag;
    } catch {
        return false;
    }
}

async function copyObject(bucket, object) {
    const response = await source.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key }));
    const body = Buffer.from(await response.Body.transformToByteArray());
    await target.send(new PutObjectCommand({
        Bucket: bucket,
        Key: object.Key,
        Body: body,
        ContentType: response.ContentType,
        Metadata: response.Metadata,
        CacheControl: response.CacheControl,
    }));
}

const totals = { copied: 0, skipped: 0, failed: 0, bytes: 0 };

for (const bucket of buckets) {
    const created = await ensureBucket(bucket);
    console.log(`\n${bucket}${created ? (dryRun ? " (bucket would be created)" : " (bucket created)") : " (exists)"}`);
    if (initOnly) continue;

    const queue = [];
    for await (const object of listObjects(bucket)) queue.push(object);

    let index = 0;
    const worker = async () => {
        while (index < queue.length) {
            const object = queue[index++];
            try {
                if (!created && await isUpToDate(bucket, object)) {
                    totals.skipped += 1;
                    continue;
                }
                if (!dryRun) await copyObject(bucket, object);
                totals.copied += 1;
                totals.bytes += object.Size || 0;
                console.log(`  ${dryRun ? "would copy" : "copied"} ${object.Key} (${object.Size} B)`);
            } catch (error) {
                totals.failed += 1;
                console.error(`  failed ${object.Key}: ${error?.name || "Error"} ${error?.message || ""}`);
            }
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

console.log(`\n${dryRun ? "planned" : "copied"} ${totals.copied} (${totals.bytes} B), unchanged ${totals.skipped}, failed ${totals.failed}`);
process.exitCode = totals.failed > 0 ? 1 : 0;
