#!/usr/bin/env node
/**
 * Writes lesson bodies to the local Payload CMS (cms/, docs/payload-cms.md), the fallback the app
 * reads in local development when Sanity has no document for a lesson. Nothing leaves this machine.
 * Reads <lesson>/lesson.payload.json (run build-lesson.mjs --target payload first) and creates or updates the
 * `lessons` document whose sourceId is the Sanity _id.
 *
 * Usage:
 *   node content/tools/push-lesson-payload.mjs <lesson folder> [<lesson folder> ...]
 *   --env <file>   env file with PAYLOAD_URL and PAYLOAD_API_KEY (default .env.local)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));

const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const folders = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--env");
require("dotenv").config({ path: path.join(root, envFile), quiet: true });
// Shared values (.env) under the env file above, the order Next.js uses.
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });

const { PAYLOAD_URL, PAYLOAD_API_KEY } = process.env;
if (!PAYLOAD_URL || !PAYLOAD_API_KEY) {
    console.error(`PAYLOAD_URL and PAYLOAD_API_KEY must be set in ${envFile} (see .env.example)`);
    process.exit(1);
}
const host = new URL(PAYLOAD_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error(`PAYLOAD_URL must point at the local CMS, not ${host}`);
    process.exit(1);
}
if (!folders.length) {
    console.error("usage: node content/tools/push-lesson-payload.mjs <lesson folder> [...]");
    process.exit(1);
}

const headers = { Authorization: `users API-Key ${PAYLOAD_API_KEY}`, "Content-Type": "application/json" };

async function api(method, pathname, body) {
    const response = await fetch(new URL(pathname, PAYLOAD_URL), { method, headers, body: body && JSON.stringify(body) });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${method} ${pathname}: ${response.status} ${JSON.stringify(json?.errors ?? json).slice(0, 300)}`);
    return json;
}

let failures = 0;
for (const folder of folders) {
    const file = path.resolve(folder, "lesson.payload.json");
    if (!fs.existsSync(file)) {
        console.error(`${folder}: no lesson.payload.json - run build-lesson.mjs --target payload first`);
        failures++;
        continue;
    }
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    const data = {
        sourceId: doc._id,
        title: doc.title,
        slug: doc.slug?.current ?? null,
        description: doc.description ?? null,
        estimatedTime: doc.estimatedTime ?? null,
        scenario: doc.scenario ?? null,
        environmentSetup: doc.environmentSetup ?? null,
        content: doc.content,
    };
    try {
        const query = `/api/lessons?where[sourceId][equals]=${encodeURIComponent(doc._id)}&limit=1&depth=0`;
        const existing = (await api("GET", query)).docs?.[0];
        if (existing) await api("PATCH", `/api/lessons/${existing.id}`, data);
        else await api("POST", "/api/lessons", data);
        console.log(`${existing ? "updated" : "created"} ${doc._id} (${doc.content.length} blocks)`);
    } catch (error) {
        console.error(`${doc._id}: ${error.message}`);
        failures++;
    }
}
process.exitCode = failures ? 1 : 0;
