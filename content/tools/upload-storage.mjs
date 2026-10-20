#!/usr/bin/env node
/**
 * Uploads a lesson's object-storage files to the PUBLIC bucket of the environment's storage
 * (lib/storageConfig.mjs: MinIO in development, Neon/S3 in production):
 *
 *   challenges/<language>/<public_id>/starter.<ext>   (+ harness.js for javascript)
 *   courses/<course>/<lesson>/starter-template.zip  (zipped from <lesson>/starter-template/)
 *
 * Writes <lesson>/storage-manifest.json (keys, sizes, content types) for the DB seed.
 *
 * Usage:
 *   node content/tools/upload-storage.mjs <lesson folder>                # .env.local
 *   node content/tools/upload-storage.mjs <lesson folder> --env .env.production
 *   node content/tools/upload-storage.mjs <lesson folder> --dry-run      # build manifest + zip only
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { LANGUAGES, challengeLanguage } from "./languages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const dryRun = args.includes("--dry-run");
require("dotenv").config({ path: path.join(root, envFile), quiet: true });

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { resolveStorageConfig, s3ClientOptions, describeStorage } = await import(pathToFileURL(path.join(root, "lib", "storageConfig.mjs")).href);

const lessonDir = path.resolve(args[0]);
const lessonSlug = path.basename(lessonDir);
const courseSlug = path.basename(path.dirname(lessonDir));
const { challenges } = JSON.parse(fs.readFileSync(path.join(lessonDir, "challenges.json"), "utf8"));

// ------------------------------------------------------------- collect files
const files = [];
for (const challenge of challenges.filter((c) => c.type !== "quiz")) {
    const language = challengeLanguage(challenge);
    const { ext, contentType } = LANGUAGES[language];
    // The harness contract is javascript only.
    for (const role of language === "javascript" ? ["starter", "harness"] : ["starter"]) {
        const source = path.join(lessonDir, "challenges", challenge.publicId, `${role}.${ext}`);
        if (!fs.existsSync(source)) continue;
        files.push({
            role,
            challengePublicId: challenge.publicId,
            source,
            key: `challenges/${language}/${challenge.publicId}/${role}.${ext}`,
            contentType,
            originalName: role === "starter" ? (challenge.coding?.filePath || `starter.${ext}`) : "harness.js",
        });
    }
}

const templateDir = path.join(lessonDir, "starter-template");
if (fs.existsSync(templateDir)) {
    const zipPath = path.join(os.tmpdir(), `${courseSlug}-${lessonSlug}-starter-template.zip`);
    fs.rmSync(zipPath, { force: true });
    if (process.platform === "win32") {
        execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${templateDir}\\*' -DestinationPath '${zipPath}' -Force`]);
    } else {
        execFileSync("zip", ["-qr", zipPath, "."], { cwd: templateDir });
    }
    files.push({
        role: "lesson-starter",
        source: zipPath,
        key: `courses/${courseSlug}/${lessonSlug}/starter-template.zip`,
        contentType: "application/zip",
        originalName: "starter-template.zip",
    });
}

for (const f of files) f.size = fs.statSync(f.source).size;

// ------------------------------------------------------------- upload
const storage = resolveStorageConfig();
if (storage.errors?.length) {
    console.error("Storage is not configured:", storage.errors.join("; "));
    process.exit(1);
}
console.log(`target: ${describeStorage(storage)} | bucket: ${storage.buckets.public}${dryRun ? " | DRY RUN" : ""}`);

if (!dryRun) {
    const client = new S3Client(s3ClientOptions(storage));
    for (const f of files) {
        await client.send(new PutObjectCommand({
            Bucket: storage.buckets.public,
            Key: f.key,
            Body: fs.readFileSync(f.source),
            ContentType: f.contentType,
        }));
        console.log(`uploaded ${f.key} (${f.size} bytes)`);
    }
}

const manifest = {
    bucket: "public",
    files: files.map(({ role, challengePublicId, key, contentType, originalName, size }) => ({ role, challengePublicId, key, contentType, originalName, size })),
};
fs.writeFileSync(path.join(lessonDir, "storage-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${path.relative(root, path.join(lessonDir, "storage-manifest.json"))}`);
