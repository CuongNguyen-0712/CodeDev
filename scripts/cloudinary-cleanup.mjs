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
 *   --env <file>     Cloudinary credentials. Default .env.production. For orphans it is mandatory, must set APP_ENV=production
 *                    and supplies the remote DATABASE_URL and Sanity settings (never read from .env). --allow-empty-db accepts an empty storage.assets.
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
import { SOURCES, findOrphans, checkOrphansEnv, checkOrphansPreconditions, devAssets } from "../lib/media/cloudinaryOrphans.mjs";
import { readCovers, readDbRefs, readManifests, readSanityRefs } from "../lib/media/cloudinaryReferences.mjs";

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

// --scope orphans: the --env file must be the production one; DB and Sanity values come from it alone (never .env).
const allowEmptyDb = args.includes("--allow-empty-db");
let referenced = null;
let counts = null;
if (scope === "orphans") {
    if (!opt("--env")) fail("--scope orphans requires --env <production env file>");
    const envValues = dotenv.parse(fs.readFileSync(envPath));
    let dbUrl;
    try {
        dbUrl = checkOrphansEnv(envValues);
    } catch (e) {
        fail(e.message);
    }
    // A source that cannot be read stays null; the check below then refuses.
    const db = await readDbRefs(dbUrl);
    referenced = { manifests: readManifests(root), covers: readCovers(root), ...db, sanity: await readSanityRefs(envValues) };
    try {
        checkOrphansPreconditions({ envValues, referenced, allowEmptyDb });
    } catch (e) {
        fail(e.message);
    }
    counts = Object.fromEntries(SOURCES.map((n) => [n, referenced[n].size]));
    console.log("reference sources: " + SOURCES.map((n) => n + "=" + counts[n]).join(", "));
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
fs.writeFileSync(report, JSON.stringify({ scope, cloud: env.CLOUDINARY_CLOUD_NAME, listed: assets.length, ...(counts && { referenceCounts: counts }), candidates }, null, 2));
console.log(`listed ${assets.length}, ${candidates.length} candidates (${scope})\nreport: ${report}`);

if (!apply) {
    if (localDb) console.log("dry run: --local-db would soft-delete cloudinary rows in storage.assets and clear matching profile.info avatars");
    console.log("0 deleted (dry run)");
    process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin });
const answer = await new Promise((resolve) => {
    process.stdout.write(`Type the cloud name to delete ${candidates.length} assets permanently: `);
    rl.once("line", resolve);
    rl.once("close", () => resolve(""));
});
rl.close();
if (answer.trim() !== env.CLOUDINARY_CLOUD_NAME) fail("confirmation does not match; nothing deleted");

let deleted = 0;
const deletes = [];
for (const resourceType of ["image", "video"]) {
    const ids = candidates.filter((a) => a.resourceType === resourceType).map((a) => a.publicId);
    for (let i = 0; i < ids.length; i += 100) {
        const r = await cloudinary.api.delete_resources(ids.slice(i, i + 100), { resource_type: resourceType, invalidate: true });
        const states = Object.values(r.deleted || {});
        const n = states.filter((x) => x === "deleted").length;
        deletes.push({ resourceType, batch: i / 100, requested: Math.min(100, ids.length - i), deleted: n, not_found: states.filter((x) => x === "not_found").length, partial: !!r.partial });
        deleted += n;
    }
}
fs.writeFileSync(report, JSON.stringify({ scope, cloud: env.CLOUDINARY_CLOUD_NAME, listed: assets.length, ...(counts && { referenceCounts: counts }), candidates, deletes }, null, 2));
console.log(`${deleted} deleted of ${candidates.length} (details in report)`);

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
