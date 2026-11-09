#!/usr/bin/env node
/**
 * Deletes Cloudinary assets under codedev/ that are dev/test files or orphans. Dry run unless --apply.
 *
 * Usage:
 *   node scripts/cloudinary-cleanup.mjs --scope dev|orphans [--env .env.production] [--local-db] [--apply]
 *
 *   --scope dev      codedev/development/** and codedev/test/**
 *   --scope orphans  codedev/** not referenced by a content assets.json, a course cover, or a live
 *                    cloudinary row in storage.assets (DATABASE_URL of --env). Needs all three sources.
 *   --env <file>     Cloudinary credentials (and, for orphans, the production DATABASE_URL). Default .env.production.
 *   --local-db       with --scope dev --apply: soft-delete cloudinary rows in the LOCAL database (.env.local) and clear
 *                    profile avatars that point at them. Refuses a non-local database.
 *   --apply          delete for real after typing the cloud name on stdin. Deletion is permanent.
 * The report (every candidate, its reason and resource type) goes to the OS temp dir.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { coverPublicId, devAssets, findOrphans } from "../lib/media/cloudinaryOrphans.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const dotenv = require("dotenv");

const fail = (msg) => {
    console.error(msg);
    process.exit(1);
};
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const scope = opt("--scope");
const apply = args.includes("--apply");
const localDb = args.includes("--local-db");
if (!["dev", "orphans"].includes(scope)) fail("usage: cloudinary-cleanup.mjs --scope dev|orphans [--env <file>] [--local-db] [--apply]");
if (localDb && scope !== "dev") fail("--local-db only works with --scope dev");

const envPath = path.resolve(root, opt("--env") || ".env.production");
if (!fs.existsSync(envPath)) fail(`env file not found: ${envPath}`);
const env = {};
dotenv.config({ path: envPath, quiet: true, processEnv: env });
dotenv.config({ path: path.resolve(root, ".env"), quiet: true, processEnv: env });
const missing = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].filter((k) => !env[k]);
if (missing.length) fail(`missing in ${path.basename(envPath)}: ${missing.join(", ")}`);

const isLocalUrl = (url) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);

// Local DB target is checked before anything is listed or deleted.
let localUrl = null;
if (localDb) {
    const e = {};
    dotenv.config({ path: path.resolve(root, ".env.local"), quiet: true, processEnv: e });
    dotenv.config({ path: path.resolve(root, ".env"), quiet: true, processEnv: e });
    localUrl = e.DATABASE_URL_UNPOOLED || e.DATABASE_URL;
    if (!localUrl) fail("--local-db: DATABASE_URL is not set in .env.local");
    if (!isLocalUrl(localUrl)) fail("--local-db: refusing a non-local database");
}

// A source that cannot be read stays null; findOrphans then refuses.
function readManifests() {
    try {
        const ids = new Set();
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) walk(p);
                else if (e.name === "assets.json") {
                    const j = JSON.parse(fs.readFileSync(p, "utf8"));
                    for (const kind of [j.images, j.videos]) for (const v of Object.values(kind || {})) if (v?.publicId) ids.add(v.publicId);
                }
            }
        };
        walk(path.join(root, "content", "courses"));
        return ids;
    } catch (e) {
        console.error(`manifests: ${e.message}`);
        return null;
    }
}

function readCovers() {
    try {
        const ids = new Set();
        const dir = path.join(root, "content", "courses");
        for (const name of fs.readdirSync(dir)) {
            const file = path.join(dir, name, "course.json");
            if (!fs.existsSync(file)) continue;
            const c = JSON.parse(fs.readFileSync(file, "utf8"));
            for (const url of [c.image, c.update?.image]) {
                const id = coverPublicId(url);
                if (id) ids.add(id);
            }
        }
        return ids;
    } catch (e) {
        console.error(`covers: ${e.message}`);
        return null;
    }
}

async function readDbKeys() {
    const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
    if (!url) {
        console.error("dbKeys: DATABASE_URL is not set");
        return null;
    }
    const { Client } = require("pg");
    const client = new Client({ connectionString: url });
    try {
        await client.connect();
        const r = await client.query("SELECT object_key FROM storage.assets WHERE provider = 'cloudinary' AND deleted_at IS NULL");
        return new Set(r.rows.map((x) => x.object_key));
    } catch (e) {
        console.error(`dbKeys: ${e.message}`);
        return null;
    } finally {
        await client.end().catch(() => {});
    }
}

const referenced = scope === "orphans" ? { manifests: readManifests(), covers: readCovers(), dbKeys: await readDbKeys() } : null;
if (referenced) {
    try {
        findOrphans({ assets: [], referenced }); // guard: stop before any listing
    } catch (e) {
        fail(e.message);
    }
}

const { v2: cloudinary } = require("cloudinary");
cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });

const assets = [];
for (const resourceType of ["image", "video"]) {
    let cursor;
    do {
        const r = await cloudinary.api.resources({ type: "upload", prefix: "codedev/", resource_type: resourceType, max_results: 500, next_cursor: cursor });
        for (const x of r.resources) assets.push({ publicId: x.public_id, resourceType });
        cursor = r.next_cursor;
    } while (cursor);
}

let candidates;
if (scope === "dev") candidates = devAssets(assets).map((a) => ({ ...a, reason: "dev-folder" }));
else candidates = findOrphans({ assets, referenced }).orphans.map((a) => ({ ...a, reason: "unreferenced" }));
// Last line of defence, whatever the scope logic did.
candidates = candidates.filter((a) => a.publicId.startsWith("codedev/"));
if (scope === "dev") candidates = candidates.filter((a) => /^codedev\/(development|test)\//.test(a.publicId));

const report = path.join(os.tmpdir(), `cloudinary-cleanup-${scope}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(report, JSON.stringify({ scope, cloud: env.CLOUDINARY_CLOUD_NAME, listed: assets.length, candidates }, null, 2));
console.log(`listed ${assets.length}, ${candidates.length} candidates (${scope})\nreport: ${report}`);

if (!apply) {
    if (localDb) console.log("dry run: --local-db would soft-delete cloudinary rows in storage.assets and clear matching profile.info avatars");
    console.log("0 deleted (dry run)");
    process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin });
const answer = await new Promise((resolve) => {
    process.stdout.write(`Type the cloud name (${env.CLOUDINARY_CLOUD_NAME}) to delete ${candidates.length} assets permanently: `);
    rl.once("line", resolve);
    rl.once("close", () => resolve(""));
});
rl.close();
if (answer.trim() !== env.CLOUDINARY_CLOUD_NAME) fail("confirmation does not match; nothing deleted");

let deleted = 0;
for (const resourceType of ["image", "video"]) {
    const ids = candidates.filter((a) => a.resourceType === resourceType).map((a) => a.publicId);
    for (let i = 0; i < ids.length; i += 100) {
        await cloudinary.api.delete_resources(ids.slice(i, i + 100), { resource_type: resourceType, invalidate: true });
        deleted += Math.min(100, ids.length - i);
    }
}
console.log(`${deleted} deleted`);

if (localDb) {
    const { Client } = require("pg");
    const client = new Client({ connectionString: localUrl });
    await client.connect();
    try {
        await client.query("BEGIN");
        const r = await client.query("UPDATE storage.assets SET deleted_at = now() WHERE provider = 'cloudinary' AND deleted_at IS NULL RETURNING id");
        const ids = r.rows.map((x) => x.id);
        if (ids.length) await client.query("UPDATE profile.info SET image = NULL, avatar_asset_id = NULL WHERE avatar_asset_id = ANY($1)", [ids]);
        await client.query("COMMIT");
        console.log(`local db: ${ids.length} storage.assets rows soft-deleted`);
    } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        fail(`local db update failed: ${e.message}`);
    } finally {
        await client.end();
    }
}
