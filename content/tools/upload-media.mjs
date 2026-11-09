#!/usr/bin/env node
/**
 * Uploads course covers, lesson diagrams (diagrams/) and lesson videos (videos/).
 *
 *   APP_ENV=production            -> Cloudinary; writes assets.json and course.json `image`
 *   anything else (development)   -> the local Payload CMS; writes assets.local.json and course.local.json
 *
 * Keys are stable (courses/<course>[/<lesson>]/<name>) and uploads replace, so re-running after
 * editing a file updates it in place. Unchanged files (same sha256, document still there) are skipped.
 *
 * Usage: node content/tools/upload-media.mjs <course folder | lesson folder> [--env .env.local] [--dry-run]
 *   course folder: cover.svg + every lesson listed in course.json; lesson folder: its diagrams/ and videos/.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { cloudinaryEntry, cloudinaryPublicId, duplicateNames, mediaKey, needsUpload, payloadEntry, resolveMediaTarget } from "./mediaTarget.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const dryRun = args.includes("--dry-run");
require("dotenv").config({ path: path.join(root, envFile), quiet: true });
// Shared values (.env) under the env file above, the order Next.js uses.
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });

const target = resolveMediaTarget(process.env);
const MAX_BYTES = 200 * 1024 * 1024;
const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm" };

let cloudinary = null;
let payload = null;
let payloadAuth = null;
if (target.provider === "cloudinary") {
    ({ v2: cloudinary } = require("cloudinary"));
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });
} else {
    payload = await import("../../lib/media/payloadMedia.mjs");
    payloadAuth = payload.payloadConfig(process.env);
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {});
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
const rel = (file) => path.relative(root, file).replaceAll("\\", "/");

/** Sends one file; resolves to the complete manifest entry. */
async function send({ key, buffer, filename, mime, kind, cover, checksum }) {
    if (payload) {
        const doc = await payload.uploadToPayload({ ...payloadAuth, buffer, filename, mime, key, purpose: "content" });
        return payloadEntry({ key, doc, mime, checksum });
    }
    const options = { public_id: cloudinaryPublicId(key), overwrite: true, invalidate: true, resource_type: kind };
    const result = await new Promise((resolve, reject) => {
        const done = (error, res) => (error ? reject(error) : resolve(res));
        if (kind === "video" && buffer.length > 20 * 1024 * 1024) cloudinary.uploader.upload_large_stream({ ...options, chunk_size: 20 * 1024 * 1024 }, done).end(buffer);
        else cloudinary.uploader.upload_stream(options, done).end(buffer);
    });
    if (kind === "video") return cloudinaryEntry({ key, result, url: result.secure_url, mime, checksum, video: true });
    // Covers: the browser picks WebP/AVIF. Diagrams: SVG sources are rasterised to PNG at delivery.
    const delivery = cover
        ? { transformation: [{ width: 1600, crop: "limit" }, { fetch_format: "auto", quality: "auto" }] }
        : { format: "png", transformation: [{ width: 1600, crop: "limit" }, { quality: "auto" }] };
    // The SDK analytics query (?_a=...) is dropped for covers so the stored URL is stable.
    const url = cloudinary.url(result.public_id, { secure: true, ...delivery, version: result.version });
    return cloudinaryEntry({ key, result, url: cover ? url.split("?")[0] : url, mime: mime === "image/svg+xml" ? "image/png" : mime, checksum });
}

/** Uploads unless the manifest says it is current; returns the entry to store. */
async function sync({ label, entry, size, read, ...file }) {
    if (size > MAX_BYTES) throw new Error(`${label} is larger than 200 MB`);
    file.buffer = read();
    const checksum = sha256(file.buffer);
    let remoteExists = true;
    if (payload && entry?.checksum === checksum && !dryRun) remoteExists = Boolean(await payload.findByKey({ ...payloadAuth, key: file.key }));
    if (!needsUpload(entry, checksum, { remoteExists })) {
        console.log(`unchanged ${label}`);
        return entry;
    }
    if (dryRun) {
        console.log(`would upload ${label} -> ${file.key} (${target.provider})`);
        return entry;
    }
    const result = await send({ ...file, checksum });
    console.log(`uploaded ${label} -> ${result.url}`);
    return result;
}

async function uploadLesson(lessonDir) {
    const lesson = path.basename(lessonDir);
    const course = path.basename(path.dirname(lessonDir));
    const manifestPath = path.join(lessonDir, target.manifestName);
    const manifest = readJson(manifestPath);
    manifest.images ||= {};
    manifest.videos ||= {};
    const list = (dir, pattern) => (fs.existsSync(path.join(lessonDir, dir)) ? fs.readdirSync(path.join(lessonDir, dir)).filter((f) => pattern.test(f)) : []);
    const images = list("diagrams", /\.(svg|png|jpe?g|webp|gif)$/i);
    const videos = list("videos", /\.(mp4|webm)$/i);
    // Images and videos share one key space (courses/<course>/<lesson>/<name>): fail before any upload.
    for (const [image, video] of duplicateNames(images, videos)) throw new Error(`${lesson}: diagrams/${image} and videos/${video} share a name`);
    for (const [dir, group, kind, files] of [["diagrams", "images", "image", images], ["videos", "videos", "video", videos]]) {
        for (const file of files) {
            const { name, ext } = path.parse(file);
            const full = path.join(lessonDir, dir, file);
            const before = manifest[group][name];
            const after = await sync({
                label: `${lesson}/${dir}/${file}`,
                entry: before,
                key: mediaKey({ course, lesson, name }),
                size: fs.statSync(full).size,
                read: () => fs.readFileSync(full),
                filename: file,
                mime: MIME[ext.toLowerCase()],
                kind,
            });
            if (after !== before) {
                manifest[group][name] = after;
                // Written per file, so a later failure keeps the record of what already uploaded.
                writeJson(manifestPath, manifest);
                console.log(`wrote ${rel(manifestPath)}`);
            }
        }
    }
}

/** Edit the text, not a re-serialised object, so course.json keeps its hand-written layout. */
function writeProductionCover(coursePath, url, checksum) {
    let text = fs.readFileSync(coursePath, "utf8");
    const course = JSON.parse(text);
    text = /^  "image": (".*"|null),$/m.test(text)
        ? text.replace(/^  "image": (".*"|null),$/m, `  "image": ${JSON.stringify(url)},`)
        : text.replace(/^(  "publicId": .*,)$/m, `$1\n  "image": ${JSON.stringify(url)},`);
    const checksumLine = `  "imageChecksum": ${JSON.stringify(checksum)},`;
    text = /^  "imageChecksum": ".*",$/m.test(text)
        ? text.replace(/^  "imageChecksum": ".*",$/m, checksumLine)
        : text.replace(/^(  "image": .*,)$/m, `$1
${checksumLine}`);
    if (course.existing) {
        const update = JSON.stringify({ ...(course.update || {}), image: url }).replace(/":/g, '": ').replace(/,"/g, ', "');
        text = /^  "update": .*,$/m.test(text)
            ? text.replace(/^  "update": .*,$/m, `  "update": ${update.replace(/^\{/, "{ ").replace(/\}$/, " }")},`)
            : text.replace(/^(  "existing": true,)$/m, `$1\n  "update": ${update},`);
    }
    if (JSON.parse(text).image !== url || JSON.parse(text).imageChecksum !== checksum) throw new Error("could not write image to course.json");
    fs.writeFileSync(coursePath, text);
}

async function uploadCover(courseDir) {
    const svgPath = path.join(courseDir, "cover.svg");
    if (!fs.existsSync(svgPath)) return;
    const course = path.basename(courseDir);
    // Rendering here, not at the CDN, keeps the system fonts the design was checked with.
    const sharp = require("sharp");
    const buffer = await sharp(svgPath).png().toBuffer();
    const { width, height } = await sharp(buffer).metadata();
    if (width !== 1600 || height !== 900) throw new Error(`cover must be 1600x900, got ${width}x${height}`);

    const file = { label: `${course}/cover.svg`, key: mediaKey({ course, name: "cover" }), size: buffer.length, read: () => buffer, filename: "cover.png", mime: "image/png", kind: "image", cover: true };
    // Local: course.local.json {image, imageChecksum}. Production: course.json keeps the same two fields (hand-edited text).
    const manifestPath = path.join(courseDir, target.courseManifestName);
    const stored = readJson(manifestPath);
    const entry = stored.imageChecksum ? { checksum: stored.imageChecksum } : undefined;
    const result = await sync({ ...file, entry });
    if (result === entry) return;
    if (target.provider === "cloudinary") writeProductionCover(manifestPath, result.url, result.checksum);
    else writeJson(manifestPath, { ...stored, image: result.url, imageChecksum: result.checksum });
    console.log(`wrote ${rel(manifestPath)}`);
}

if (!args[0] || args[0].startsWith("--") || !fs.existsSync(args[0])) throw new Error("usage: upload-media.mjs <course folder | lesson folder> [--env <file>] [--dry-run]");
const dir = path.resolve(args[0]);
console.log(`target: ${target.provider}${dryRun ? " (dry run)" : ""}`);
if (fs.existsSync(path.join(dir, "course.json"))) {
    await uploadCover(dir);
    const course = readJson(path.join(dir, "course.json"));
    for (const lesson of (course.modules || []).flatMap((m) => m.lessons)) {
        const lessonDir = path.join(dir, lesson.folder || "");
        if (lesson.folder && fs.existsSync(lessonDir)) await uploadLesson(lessonDir);
    }
} else {
    await uploadLesson(dir);
}
