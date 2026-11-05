#!/usr/bin/env node
/**
 * Read-only performance baseline of one database (docs/performance-plan.md, Phase 0): server
 * settings, the largest app tables (sequential vs index scans, dead rows), indexes that were
 * never used, and the most expensive statements from pg_stat_statements. Run it before and after a
 * deploy and compare; `--json` prints machine-readable output for that.
 *
 * Usage:
 *   node db/tools/baseline.mjs                         # .env.local
 *   node db/tools/baseline.mjs --env .env.production   # production (read-only transaction)
 *   node db/tools/baseline.mjs --env .env.production --json > baseline-before.json
 *
 * Statements need the extension, created once by the database owner:
 *   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
 * Counters accumulate since the last stats reset, so compare runs taken the same way.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const dotenv = require("dotenv");
const { Client } = require("pg");

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const asJson = args.includes("--json");
const limit = Number(option("--limit", 15)) || 15;

if (!process.env.DATABASE_URL || args.includes("--env")) {
    dotenv.config({ path: path.resolve(root, option("--env", ".env.local")), quiet: true, override: true });
    // Shared values (.env) under the env file above, the order Next.js uses.
    dotenv.config({ path: path.resolve(root, ".env"), quiet: true });
}
if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

// Same list as compare-schema.mjs (importing that script would run it).
const SCHEMAS = ["public", "identity", "profile", "catalog", "course", "learning", "challenge", "roadmap", "community", "commerce", "storage", "ops"];

const QUERIES = {
    server: `SELECT current_setting('server_version') AS version, current_setting('TimeZone') AS timezone,
                    pg_size_pretty(pg_database_size(current_database())) AS database_size,
                    (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS stats_reset`,
    tables: `SELECT s.schemaname || '.' || s.relname AS "table",
                    c.reltuples::bigint AS rows_estimate,
                    pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size,
                    s.seq_scan, s.seq_tup_read, COALESCE(s.idx_scan, 0) AS idx_scan, s.n_dead_tup
             FROM pg_stat_user_tables s JOIN pg_class c ON c.oid = s.relid
             WHERE s.schemaname = ANY($1)
             ORDER BY pg_total_relation_size(s.relid) DESC LIMIT $2`,
    unusedIndexes: `SELECT s.schemaname || '.' || s.indexrelname AS "index", s.relname AS "table",
                           pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
                    FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
                    WHERE s.schemaname = ANY($1) AND s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
                    ORDER BY pg_relation_size(s.indexrelid) DESC`,
    statements: `SELECT calls, round(total_exec_time::numeric, 1) AS total_ms, round(mean_exec_time::numeric, 2) AS mean_ms,
                        rows, left(regexp_replace(query, '\\s+', ' ', 'g'), 160) AS query
                 FROM pg_stat_statements
                 WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                 ORDER BY total_exec_time DESC LIMIT $1`,
};

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 20000 });
await client.connect();

const report = { target: new URL(process.env.DATABASE_URL).hostname, takenAt: new Date().toISOString() };
try {
    // Nothing here writes; the read-only transaction makes sure of it.
    await client.query("BEGIN READ ONLY");
    report.server = (await client.query(QUERIES.server)).rows[0];
    report.tables = (await client.query(QUERIES.tables, [SCHEMAS, limit])).rows;
    report.unusedIndexes = (await client.query(QUERIES.unusedIndexes, [SCHEMAS])).rows;

    const { rows: [ext] } = await client.query(`SELECT to_regclass('pg_stat_statements') IS NOT NULL AS installed`);
    report.statements = ext.installed
        ? (await client.query(QUERIES.statements, [limit])).rows
        : "pg_stat_statements is not installed: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;";
    await client.query("COMMIT");
} catch (error) {
    await client.query("ROLLBACK").catch(() => { });
    console.error(`baseline failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    await client.end();
}

if (process.exitCode !== 1) {
    if (asJson) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(`target: ${report.target}  taken: ${report.takenAt}`);
        console.table([report.server]);
        console.log(`\nLargest tables (seq_scan high on a big table = a missing index)`);
        console.table(report.tables);
        console.log(`\nIndexes never used since stats_reset (not unique, not primary key)`);
        if (report.unusedIndexes.length) console.table(report.unusedIndexes); else console.log("none");
        console.log(`\nTop statements by total time`);
        if (Array.isArray(report.statements)) console.table(report.statements); else console.log(report.statements);
    }
}
