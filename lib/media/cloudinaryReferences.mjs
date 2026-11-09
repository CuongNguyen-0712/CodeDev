// Readers for the places that reference Cloudinary assets. Each returns a Set, or null when it could not be read
// (findOrphans then refuses). Only the repo (no network) except readDbRefs / readSanityRefs.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { coverPublicId } from "./cloudinaryOrphans.mjs";

const coursesDir = (root) => path.join(root, "content", "courses");
const warn = (name, e) => console.error(`${name}: ${e.message}`);

export function readManifests(root) {
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
        walk(coursesDir(root));
        return ids;
    } catch (e) {
        warn("manifests", e);
        return null;
    }
}

export function readCovers(root) {
    try {
        const ids = new Set();
        for (const name of fs.readdirSync(coursesDir(root))) {
            const file = path.join(coursesDir(root), name, "course.json");
            if (!fs.existsSync(file)) continue;
            const c = JSON.parse(fs.readFileSync(file, "utf8"));
            for (const url of [c.image, c.update?.image]) {
                const id = coverPublicId(url);
                if (id) ids.add(id);
            }
        }
        return ids;
    } catch (e) {
        warn("covers", e);
        return null;
    }
}

// One connection, two sources. Either is null when its query failed.
export async function readDbRefs(url) {
    const out = { dbKeys: null, dbCovers: null };
    const { Client } = createRequire(import.meta.url)("pg");
    const client = new Client({ connectionString: url });
    try {
        await client.connect();
    } catch (e) {
        warn("db", e);
        return out;
    }
    try {
        const k = await client.query("SELECT object_key FROM storage.assets WHERE provider = 'cloudinary' AND deleted_at IS NULL");
        out.dbKeys = new Set(k.rows.map((x) => x.object_key).filter(Boolean));
    } catch (e) {
        warn("dbKeys", e);
    }
    try {
        const c = await client.query("SELECT image FROM catalog.course WHERE image IS NOT NULL");
        out.dbCovers = new Set(c.rows.map((x) => coverPublicId(x.image)).filter(Boolean));
    } catch (e) {
        warn("dbCovers", e);
    }
    await client.end().catch(() => {});
    return out;
}

// Cloudinary URLs in cloudinaryImage / video blocks of every lesson (drafts too when a token is present).
export async function readSanityRefs(vals) {
    try {
        const projectId = vals.NEXT_PUBLIC_SANITY_PROJECT_ID;
        const dataset = vals.NEXT_PUBLIC_SANITY_DATASET;
        if (!projectId || !dataset) throw new Error("NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET missing");
        const { createClient } = createRequire(import.meta.url)("@sanity/client");
        const token = vals.SANITY_READ_TOKEN || undefined;
        const client = createClient({
            projectId,
            dataset,
            apiVersion: vals.NEXT_PUBLIC_SANITY_API_VERSION || "2025-01-01",
            token,
            useCdn: false,
            perspective: token ? "raw" : "published",
        });
        const docs = await client.fetch('*[_type == "lesson"]');
        if (!Array.isArray(docs)) throw new Error("unexpected Sanity response");
        const ids = new Set();
        const walk = (n) => {
            if (Array.isArray(n)) return n.forEach(walk);
            if (!n || typeof n !== "object") return;
            if (n._type === "cloudinaryImage" || n._type === "video") {
                for (const u of [n.url, n.publicId]) {
                    const id = typeof u === "string" && u.startsWith("codedev/") ? u : coverPublicId(u);
                    if (id) ids.add(id);
                }
            }
            Object.values(n).forEach(walk);
        };
        walk(docs);
        return ids;
    } catch (e) {
        warn("sanity", e);
        return null;
    }
}
