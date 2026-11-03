import {
    neon,
    Pool as NeonPool,
    defaults as neonDefaults,
    types as neonTypes,
} from "@neondatabase/serverless";

import pg, { Pool as PgPool } from "pg";

import { isDeployedEnv, isLocalUrl } from "@/lib/appEnv.mjs";

/**
 * Driver follows the database, not NODE_ENV: Neon hosts use the serverless driver (HTTP for
 * single queries, WebSocket pool for transactions), any other PostgreSQL uses `pg`. So a
 * production build against a self-hosted / docker PostgreSQL and a development run against a
 * Neon branch both work. DB_DRIVER=neon|pg overrides the detection.
 */
function resolveDriver(url) {
    const explicit = String(process.env.DB_DRIVER || "").trim().toLowerCase();
    if (explicit === "neon" || explicit === "pg") return explicit;
    try {
        return new URL(url).hostname.endsWith(".neon.tech") ? "neon" : "pg";
    } catch {
        return "pg";
    }
}

const envInt = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

/**
 * Pool limits. On serverless each instance has its own pool: keep DB_POOL_MAX small there and
 * point DATABASE_URL at the Neon `-pooler` host. The timeouts stop a stuck query or an abandoned
 * transaction from holding a connection (and its locks). Single queries over Neon HTTP do not use
 * the pool: set statement_timeout on the database role for those.
 */
const poolOptions = () => ({
    // Vercel runs many short-lived instances, each with its own pool.
    max: envInt("DB_POOL_MAX", process.env.VERCEL ? 3 : 10),
    connectionTimeoutMillis: envInt("DB_CONNECT_TIMEOUT_MS", 10_000),
    idleTimeoutMillis: 30_000,
    statement_timeout: envInt("DB_STATEMENT_TIMEOUT_MS", 30_000),
    idle_in_transaction_session_timeout: envInt("DB_IDLE_IN_TX_TIMEOUT_MS", 15_000),
});

/**
 * Many columns are `timestamp without time zone` filled by now(). They hold UTC: sessions run in UTC
 * (Neon's default; the pg pool sets it below), naive values are read back as UTC, and JS Dates are
 * sent as UTC. Otherwise a server whose clock zone differs from the database session's reads them
 * hours off (comments showed "15h ago" right after posting with Node in Bangkok and PostgreSQL in
 * Los Angeles).
 */
const TIMESTAMP_WITHOUT_TZ = 1114;
export const parseUtcTimestamp = (value) => (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value) ? new Date(`${value.replace(" ", "T")}Z`) : value);
for (const types of [pg.types, neonTypes]) types.setTypeParser(TIMESTAMP_WITHOUT_TZ, parseUtcTimestamp);
pg.defaults.parseInputDatesAsUTC = true;
neonDefaults.parseInputDatesAsUTC = true;

// Created on first use, not at import: `next build` imports route modules to collect page data
// and must not need DATABASE_URL (the Docker build has no .env* files and no secrets).
let state = null;

function db() {
    if (state) return state;

    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
        throw new Error("DATABASE_URL is not defined");
    }

    const driver = resolveDriver(DATABASE_URL);

    if (isDeployedEnv() && isLocalUrl(DATABASE_URL)) {
        // Allowed (compose can run PostgreSQL next to the app), but usually a leaked dev .env.
        console.warn("[db] production is connected to a local PostgreSQL instance");
    }

    state = {
        driver,
        pool: driver === "neon"
            ? new NeonPool({ connectionString: DATABASE_URL, ...poolOptions() })
            : new PgPool({ connectionString: DATABASE_URL, ...poolOptions(), options: "-c TimeZone=UTC" }),
        neonSql: driver === "neon" ? neon(DATABASE_URL) : null,
    };
    return state;
}

export const dbDriver = () => db().driver;

export async function sql(text, params = []) {
    const { neonSql, pool } = db();

    if (neonSql) {
        try {
            const result = await neonSql.query(text, params);

            return {
                rows: result,
                rowCount: result.length,
            };
        } catch (error) {
            console.error("Neon query failed:", {
                message: error instanceof Error ? error.message : error,
                cause: error instanceof Error ? error.cause : undefined,
            });

            throw error;
        }
    }

    return pool.query(text, params);
}

// Same surface the callers use (`dbPool.connect()` for transactions), resolved lazily.
export const dbPool = {
    connect: (...args) => db().pool.connect(...args),
    query: (...args) => db().pool.query(...args),
    end: (...args) => (state ? state.pool.end(...args) : Promise.resolve()),
};
