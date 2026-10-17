#!/usr/bin/env node
/**
 * Uploads a lesson's diagrams/*.{svg,png,jpg,webp} to Cloudinary and records the delivery
 * URLs in <lesson>/assets.json (read when building the Sanity document).
 *
 * Public ids are stable (codedev/courses/<course>/<lesson>/<file name>) and uploads overwrite,
 * so re-running after editing a diagram updates it in place.
 *
 * Usage: node content/tools/upload-images.mjs <lesson folder> [--env .env]
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

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

const lessonDir = path.resolve(args[0]);
const lessonSlug = path.basename(lessonDir);
const courseSlug = path.basename(path.dirname(lessonDir));
const folder = `codedev/courses/${courseSlug}/${lessonSlug}`;
const diagramsDir = path.join(lessonDir, "diagrams");

const manifestPath = path.join(lessonDir, "assets.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
manifest.images = manifest.images || {};

for (const file of fs.readdirSync(diagramsDir).filter((f) => /\.(svg|png|jpe?g|webp)$/i.test(f))) {
    const name = path.parse(file).name;
    const result = await cloudinary.uploader.upload(path.join(diagramsDir, file), {
        folder,
        public_id: name,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
    });

    // SVG sources are rasterised to PNG at delivery; width is capped for the lesson column.
    const deliveryUrl = cloudinary.url(result.public_id, {
        format: "png",
        transformation: [{ width: 1600, crop: "limit" }, { quality: "auto" }],
        version: result.version,
    });

    manifest.images[name] = {
        publicId: result.public_id,
        url: deliveryUrl,
        width: result.width,
        height: result.height,
    };
    console.log(`uploaded ${file} -> ${deliveryUrl}`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${path.relative(root, manifestPath)}`);
