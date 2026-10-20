#!/usr/bin/env node
/**
 * Renders a course's cover.svg (1600x900, 16:9) to PNG and uploads it to Cloudinary, then writes
 * the delivery URL to course.json `image` (and `update.image` for an `existing` course, so the
 * seed applies it). Rendering here, not in Cloudinary, keeps the system fonts the design was
 * checked with.
 *
 * Public id is stable (codedev/courses/<course>/cover) and uploads overwrite, so re-running after
 * editing the SVG updates it in place (the URL carries the new version).
 *
 * Usage: node content/tools/upload-cover.mjs <course folder> [--env .env]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env";
require("dotenv").config({ path: path.join(root, envFile), quiet: true });
const { v2: cloudinary } = require("cloudinary");
const sharp = require("sharp");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

const courseDir = path.resolve(args[0]);
const courseSlug = path.basename(courseDir);
const svgPath = path.join(courseDir, "cover.svg");
const coursePath = path.join(courseDir, "course.json");

const png = await sharp(svgPath).png().toBuffer();
const { width, height } = await sharp(png).metadata();
if (width !== 1600 || height !== 900) throw new Error(`cover must be 1600x900, got ${width}x${height}`);

const result = await new Promise((resolve, reject) => {
    cloudinary.uploader
        .upload_stream(
            { folder: `codedev/courses/${courseSlug}`, public_id: "cover", overwrite: true, invalidate: true, resource_type: "image" },
            (error, res) => (error ? reject(error) : resolve(res))
        )
        .end(png);
});

// Browser picks WebP/AVIF; 1600 wide covers the largest 16:9 frame at 2x.
const url = cloudinary.url(result.public_id, {
    transformation: [{ width: 1600, crop: "limit" }, { fetch_format: "auto", quality: "auto" }],
    version: result.version,
}).split("?")[0]; // drop the SDK analytics query (?_a=...) so the stored URL is stable

// Edit the text, not a re-serialised object, so course.json keeps its hand-written layout.
let text = fs.readFileSync(coursePath, "utf8");
const course = JSON.parse(text);
text = /^  "image": (".*"|null),$/m.test(text)
    ? text.replace(/^  "image": (".*"|null),$/m, `  "image": ${JSON.stringify(url)},`)
    : text.replace(/^(  "publicId": .*,)$/m, `$1\n  "image": ${JSON.stringify(url)},`);
if (course.existing) {
    const update = JSON.stringify({ ...(course.update || {}), image: url }).replace(/":/g, '": ').replace(/,"/g, ', "');
    text = /^  "update": .*,$/m.test(text)
        ? text.replace(/^  "update": .*,$/m, `  "update": ${update.replace(/^\{/, "{ ").replace(/\}$/, " }")},`)
        : text.replace(/^(  "existing": true,)$/m, `$1\n  "update": ${update},`);
}
if (JSON.parse(text).image !== url) throw new Error("could not write image to course.json");
fs.writeFileSync(coursePath, text);
console.log(`uploaded ${path.relative(root, svgPath)} -> ${url}`);
