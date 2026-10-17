#!/usr/bin/env node
/**
 * Writes <lesson>/lesson.sanity.json to Sanity as a DRAFT (drafts.<_id>), replacing any
 * previous draft. Publish it afterwards in the Studio (/studio) or with the Sanity MCP.
 *
 * Usage: node content/tools/push-lesson.mjs <lesson folder> [--env .env.local]
 * Needs NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET and a write-capable SANITY_API_TOKEN.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
require("dotenv").config({ path: path.join(root, envFile), quiet: true });

const { createClient } = require("@sanity/client");

const docPath = path.join(path.resolve(args[0]), "lesson.sanity.json");
// Generated and git-ignored: build it first.
if (!fs.existsSync(docPath)) throw new Error(`${docPath} is missing - run content/tools/build-lesson.mjs ${args[0]} first`);
const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));
if (!doc._id || doc._type !== "lesson") throw new Error("lesson.sanity.json needs _id and _type: 'lesson'");

const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-01-01",
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
});

const draft = { ...doc, _id: `drafts.${doc._id}` };
const result = await client.createOrReplace(draft);
console.log(`draft written: ${result._id} (rev ${result._rev}) in ${client.config().projectId}/${client.config().dataset}`);
