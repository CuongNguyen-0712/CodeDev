#!/usr/bin/env node
/**
 * Uploads coding-challenge harness files to S3 and registers them as
 * `challenge.coding_files` rows with file_role = 'harness'.
 *
 * Usage:
 *   node scripts/seed-challenge-harness.mjs              # uses .env.local
 *   node scripts/seed-challenge-harness.mjs --env .env.production   # production storage + DB
 *   node scripts/seed-challenge-harness.mjs --dry-run    # print the plan only
 *
 * Harness files live in scripts/challenges/harness/<challenge public_id>.js and must
 * define `async function __harness(input, ctx)` (see lib/challenges/runner.js).
 * Starter/harness files are cached in Redis for 1h (`challenge:file:<object_key>`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import pg from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { resolveStorageConfig, s3ClientOptions, describeStorage } from "../lib/storageConfig.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const dryRun = args.includes("--dry-run");

dotenv.config({ path: path.resolve(root, envFile), quiet: true });
dotenv.config({ path: path.resolve(root, ".env"), quiet: true });

const harnessDir = path.join(root, "scripts", "challenges", "harness");
const files = fs.readdirSync(harnessDir).filter((f) => f.endsWith(".js"));

if (files.length === 0) {
    console.log("No harness files found.");
    process.exit(0);
}

// Same target as the app in this environment: MinIO in development, S3 (Neon) in production.
const storage = resolveStorageConfig();
console.log(`storage: ${describeStorage(storage)}`);
const s3 = new S3Client(s3ClientOptions(storage));
const bucket = storage.buckets.public;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

try {
    for (const file of files) {
        const publicId = path.basename(file, ".js");
        const body = fs.readFileSync(path.join(harnessDir, file), "utf8");

        const challenge = await db.query(
            `SELECT id FROM challenge.challenges WHERE public_id = $1 AND is_deleted = false`,
            [publicId]
        );

        if (challenge.rowCount === 0) {
            console.warn(`skip ${publicId}: challenge not found`);
            continue;
        }

        const challengeId = challenge.rows[0].id;
        const objectKey = `challenges/javascript/${publicId}/harness.js`;
        const assetPublicId = `ast_${publicId}_harness`;
        const size = Buffer.byteLength(body, "utf8");

        if (dryRun) {
            console.log(`[dry-run] ${publicId} -> s3://${bucket}/${objectKey} (${size} bytes)`);
            continue;
        }

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: body,
            ContentType: "application/javascript; charset=utf-8",
        }));

        await db.query("BEGIN");

        const asset = await db.query(
            `INSERT INTO storage.assets (public_id, provider, object_key, resource_type, mine_type, file_size, original_name)
             VALUES ($1, 's3', $2, 'raw', 'application/javascript', $3, 'harness.js')
             ON CONFLICT (public_id) DO UPDATE
                 SET object_key = EXCLUDED.object_key, file_size = EXCLUDED.file_size, updated_at = now()
             RETURNING id;`,
            [assetPublicId, objectKey, size]
        );

        await db.query(
            `INSERT INTO challenge.coding_files (challenge_id, language, file_path, file_role, asset_id)
             VALUES ($1, 'javascript', 'harness.js', 'harness', $2)
             ON CONFLICT ON CONSTRAINT uq_coding_files_path DO UPDATE
                 SET asset_id = EXCLUDED.asset_id, file_role = 'harness', updated_at = now();`,
            [challengeId, asset.rows[0].id]
        );

        await db.query("COMMIT");
        console.log(`seeded ${publicId} -> ${objectKey}`);
    }
} catch (error) {
    await db.query("ROLLBACK").catch(() => { });
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
} finally {
    await db.end();
}
