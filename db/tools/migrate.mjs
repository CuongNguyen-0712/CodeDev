#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql in filename order and records each one in public.schema_migrations
 * (version, checksum, applied_at), so local and production can be brought to the same state.
 *
 * Usage:
 *   node db/tools/migrate.mjs                         # .env.local: list + apply pending
 *   node db/tools/migrate.mjs --dry-run               # only list what would run
 *   node db/tools/migrate.mjs --env .env.production --yes
 *   node db/tools/migrate.mjs --baseline 20261016_001 # mark migrations up to this version as
 *                                                     # already applied (databases migrated by hand)
 *   DATABASE_URL=... node db/tools/migrate.mjs --yes  # explicit target (e.g. a Neon test branch)
 *   node db/tools/migrate.mjs --lock-timeout 10000    # ms a statement may wait for a lock
 *   node db/tools/migrate.mjs --to 20261101_002       # stop after this version (staged rollouts)
 *
 * Each migration runs in one transaction together with its bookkeeping row: the file's own
 * outer BEGIN; / COMMIT; are replaced by the runner's. Non-local targets require --yes.
 * A session advisory lock prevents two runners from migrating the same database at once.
 * On a non-local database every migration runs with lock_timeout (default 5 s): a statement that
 * would queue behind live traffic (and block it in turn) fails and rolls back instead.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const dotenv = require("dotenv");
const { Client } = require("pg");

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const dryRun = args.includes("--dry-run");
const confirmed = args.includes("--yes");
const baseline = option("--baseline");
const envFile = option("--env");
const lockTimeoutArg = option("--lock-timeout");
const upTo = option("--to");

const explicitUrl = process.env.DATABASE_URL && !envFile ? process.env.DATABASE_URL : null;
if (!explicitUrl) {
    dotenv.config({ path: path.resolve(root, envFile || ".env.local"), quiet: true, override: true });
    // Shared values (.env) under the env file above, the order Next.js uses.
    dotenv.config({ path: path.resolve(root, ".env"), quiet: true });
}
// DDL goes over a direct connection when one is configured (Neon: no PgBouncer in between).
const url = explicitUrl || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

const MIGRATIONS_DIR = path.join(root, "db", "migrations");
const LOCK_KEY = 4207317; // arbitrary, constant: pg_advisory_lock key for this runner

const target = new URL(url);
const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname);
console.log(`target: ${target.hostname}${target.pathname}${isLocal ? " (local)" : ""}`);

const lockTimeoutMs = lockTimeoutArg != null ? Number(lockTimeoutArg) : isLocal ? 0 : 5000;
if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 0) {
    console.error("--lock-timeout must be a whole number of milliseconds (0 = wait forever)");
    process.exit(1);
}

const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{8}_\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
        return {
            file,
            version: file.slice(0, 12),
            name: file.slice(13, -4),
            sql,
            checksum: crypto.createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex"),
        };
    });

/** Replaces the file's outer transaction with the runner's so the bookkeeping row commits with it. */
function body(sql) {
    const begin = /^\s*BEGIN\s*;\s*$/im;
    const commit = /^\s*COMMIT\s*;\s*$/gim;
    const commits = [...sql.matchAll(commit)];
    if (!begin.test(sql) || commits.length === 0) return sql;
    const last = commits[commits.length - 1];
    const withoutCommit = sql.slice(0, last.index) + sql.slice(last.index + last[0].length);
    return withoutCommit.replace(begin, "");
}

const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });
await client.connect();

try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version    varchar(12) PRIMARY KEY,
            name       text NOT NULL,
            checksum   char(64) NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT now(),
            applied_by text
        )`);

    // timestamp -> timestamptz changes (20261101_004) reinterpret stored values in this zone, and
    // only skip the table rewrite when it is UTC.
    const { rows: [tz] } = await client.query("SHOW timezone");
    console.log(`session time zone: ${tz.TimeZone}${lockTimeoutMs ? `, lock_timeout ${lockTimeoutMs} ms` : ""}`);

    const applied = new Map((await client.query("SELECT version, checksum FROM public.schema_migrations")).rows.map((r) => [r.version, r.checksum]));

    for (const m of files) {
        if (applied.has(m.version) && applied.get(m.version) !== m.checksum) {
            console.warn(`warning: ${m.file} changed after it was applied (checksum differs)`);
        }
    }

    if (baseline) {
        const marked = files.filter((m) => m.version <= baseline && !applied.has(m.version));
        for (const m of marked) {
            console.log(`${dryRun ? "would mark" : "marked"} ${m.file} as applied (baseline)`);
            if (!dryRun) {
                await client.query(
                    "INSERT INTO public.schema_migrations (version, name, checksum, applied_by) VALUES ($1, $2, $3, $4)",
                    [m.version, m.name, m.checksum, `baseline:${os.userInfo().username}`]
                );
                applied.set(m.version, m.checksum);
            }
        }
        if (marked.length === 0) console.log("baseline: nothing to mark");
    }

    const pending = files.filter((m) => !applied.has(m.version) && !(dryRun && baseline && m.version <= baseline)
        && (!upTo || m.version <= upTo));
    if (pending.length === 0) {
        console.log("up to date");
    } else {
        console.log(`pending: ${pending.map((m) => m.file).join(", ")}`);
    }

    if (dryRun || pending.length === 0) {
        process.exitCode = 0;
    } else if (!isLocal && !confirmed) {
        console.error("refusing to migrate a non-local database without --yes");
        process.exitCode = 2;
    } else {
        for (const m of pending) {
            const started = Date.now();
            try {
                await client.query("BEGIN");
                if (lockTimeoutMs) await client.query(`SET LOCAL lock_timeout = ${lockTimeoutMs}`);
                await client.query(body(m.sql));
                await client.query(
                    "INSERT INTO public.schema_migrations (version, name, checksum, applied_by) VALUES ($1, $2, $3, $4)",
                    [m.version, m.name, m.checksum, os.userInfo().username]
                );
                await client.query("COMMIT");
                console.log(`applied ${m.file} (${Date.now() - started} ms)`);
            } catch (error) {
                await client.query("ROLLBACK").catch(() => { });
                console.error(`failed ${m.file}: ${error.message}`);
                if (error.code === "55P03") console.error("a lock was not granted in time: retry when traffic is low, or raise --lock-timeout");
                process.exitCode = 1;
                break;
            }
        }
    }
} finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => { });
    await client.end();
}
