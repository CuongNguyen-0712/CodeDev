import {
    neon,
    Pool as NeonPool,
} from "@neondatabase/serverless";

import { Pool as PgPool } from "pg";

import { appEnv, isLocalUrl } from "@/lib/appEnv.mjs";

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

    if (appEnv() === "production" && isLocalUrl(DATABASE_URL)) {
        // Allowed (compose can run PostgreSQL next to the app), but usually a leaked dev .env.
        console.warn("[db] production is connected to a local PostgreSQL instance");
    }

    state = {
        driver,
        pool: driver === "neon"
            ? new NeonPool({ connectionString: DATABASE_URL, max: 10 })
            : new PgPool({ connectionString: DATABASE_URL, max: 10 }),
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
