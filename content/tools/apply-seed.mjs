#!/usr/bin/env node
/**
 * Applies generated seed files (db/seeds/<course>.sql, db/seeds/roadmaps.sql) to a database.
 * Each seed is its own BEGIN ... COMMIT: an error rolls that file back and stops.
 *
 * Usage:
 *   node content/tools/apply-seed.mjs db/seeds/<course>.sql [more.sql ...]          # .env.local
 *   node content/tools/apply-seed.mjs db/seeds/<course>.sql --env .env.production --yes
 *   DATABASE_URL=... node content/tools/apply-seed.mjs db/seeds/<course>.sql --yes  # e.g. a Neon test branch
 * Non-local targets require --yes (same rule as db/tools/migrate.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const { Client } = require("pg");

const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : null;
const files = args.filter((a, i) => a.endsWith(".sql") && args[i - 1] !== "--env");
if (!files.length) throw new Error("usage: apply-seed.mjs <seed.sql> [...] [--env <file>] [--yes]");

const explicitUrl = process.env.DATABASE_URL && !envFile ? process.env.DATABASE_URL : null;
const env = {};
if (!explicitUrl) require("dotenv").config({ path: path.resolve(root, envFile || ".env.local"), quiet: true, processEnv: env });
const url = explicitUrl || env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const target = new URL(url);
const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname);
console.log(`target: ${target.hostname}${target.pathname}${isLocal ? " (local)" : ""}`);
if (!isLocal && !args.includes("--yes")) {
    console.error("refusing to write to a non-local database without --yes");
    process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
    for (const file of files) {
        await client.query(fs.readFileSync(path.resolve(file), "utf8"));
        console.log(`applied ${path.relative(root, path.resolve(file))}`);
    }
} finally {
    await client.end();
}
