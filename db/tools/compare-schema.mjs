#!/usr/bin/env node
/**
 * Read-only drift check between two databases (default: local vs production):
 * applied migrations, tables / columns, functions, procedures, views, triggers, indexes,
 * constraints and enum types of the app schemas. Exit code 1 when they differ.
 *
 * Usage:
 *   node db/tools/compare-schema.mjs                               # .env.local vs .env.production
 *   node db/tools/compare-schema.mjs --left .env.local --right .env.production --verbose
 *
 * Definitions are compared after normalising what only the server version changes (PostgreSQL 16
 * and 18 print the same CHECK / partial index with different casts and parentheses). NOT NULL
 * entries that PostgreSQL 18 lists in pg_constraint are ignored; nullability is compared on the
 * columns instead.
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
const verbose = args.includes("--verbose");
const sides = { left: option("--left", ".env.local"), right: option("--right", ".env.production") };

export const SCHEMAS = ["public", "identity", "profile", "catalog", "course", "learning", "challenge", "roadmap", "community", "commerce", "storage"];

const normalise = (def) => String(def ?? "")
    .replace(/::(character varying|text|integer|bigint|numeric|boolean)(\[\])?/g, "")
    .replace(/[()\s]/g, "");

const QUERIES = {
    migrations: `SELECT version AS k, checksum AS v FROM public.schema_migrations`,
    columns: `SELECT table_schema || '.' || table_name || '.' || column_name AS k,
                     udt_name || CASE WHEN is_nullable = 'NO' THEN ' not null' ELSE '' END || COALESCE(' default ' || column_default, '') AS v
              FROM information_schema.columns WHERE table_schema = ANY($1)`,
    routines: `SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS k, pg_get_functiondef(p.oid) AS v
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = ANY($1) AND p.prokind IN ('f', 'p')
                 AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`,
    views: `SELECT schemaname || '.' || viewname AS k, pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass, true) AS v
            FROM pg_views WHERE schemaname = ANY($1)
            UNION ALL
            SELECT schemaname || '.' || matviewname, definition FROM pg_matviews WHERE schemaname = ANY($1)`,
    triggers: `SELECT n.nspname || '.' || c.relname || '.' || t.tgname AS k, pg_get_triggerdef(t.oid, true) AS v
               FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE NOT t.tgisinternal AND n.nspname = ANY($1)`,
    indexes: `SELECT schemaname || '.' || indexname AS k, indexdef AS v FROM pg_indexes WHERE schemaname = ANY($1)`,
    constraints: `SELECT n.nspname || '.' || cl.relname || '.' || c.conname AS k, pg_get_constraintdef(c.oid) AS v
                  FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace JOIN pg_class cl ON cl.oid = c.conrelid
                  WHERE n.nspname = ANY($1) AND c.contype <> 'n'`,
    enums: `SELECT n.nspname || '.' || t.typname AS k, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS v
            FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = ANY($1) GROUP BY 1`,
};

async function snapshot(envFile) {
    const env = {};
    dotenv.config({ path: path.resolve(root, envFile), processEnv: env, quiet: true });
    if (!env.DATABASE_URL) throw new Error(`${envFile}: DATABASE_URL is not set`);
    const client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 20000 });
    await client.connect();
    try {
        await client.query("BEGIN READ ONLY");
        const result = { host: new URL(env.DATABASE_URL).hostname, version: (await client.query("SHOW server_version")).rows[0].server_version };
        const hasMigrations = (await client.query("SELECT to_regclass('public.schema_migrations') AS t")).rows[0].t;
        for (const [name, sql] of Object.entries(QUERIES)) {
            if (name === "migrations" && !hasMigrations) {
                result[name] = new Map();
                continue;
            }
            const rows = (await client.query(sql, sql.includes("$1") ? [SCHEMAS] : [])).rows;
            result[name] = new Map(rows.map((r) => [r.k, r.v]));
        }
        return result;
    } finally {
        await client.query("ROLLBACK").catch(() => { });
        await client.end();
    }
}

const [left, right] = await Promise.all([snapshot(sides.left), snapshot(sides.right)]);
console.log(`left:  ${sides.left} (${left.host}, PostgreSQL ${left.version})`);
console.log(`right: ${sides.right} (${right.host}, PostgreSQL ${right.version})\n`);

let drift = 0;
for (const name of Object.keys(QUERIES)) {
    const L = left[name];
    const R = right[name];
    const onlyLeft = [...L.keys()].filter((k) => !R.has(k)).sort();
    const onlyRight = [...R.keys()].filter((k) => !L.has(k)).sort();
    const differ = [...L.keys()].filter((k) => R.has(k) && normalise(L.get(k)) !== normalise(R.get(k))).sort();
    const count = onlyLeft.length + onlyRight.length + differ.length;
    drift += count;

    console.log(`${count === 0 ? "ok  " : "DIFF"} ${name.padEnd(12)} left=${L.size} right=${R.size}`);
    for (const k of onlyLeft) console.log(`       only left:  ${k}`);
    for (const k of onlyRight) console.log(`       only right: ${k}`);
    for (const k of differ) {
        console.log(`       differs:    ${k}`);
        if (verbose) console.log(`         left:  ${L.get(k)}\n         right: ${R.get(k)}`);
    }
}

console.log(drift === 0 ? "\nin sync" : `\n${drift} difference(s)`);
process.exitCode = drift === 0 ? 0 : 1;
