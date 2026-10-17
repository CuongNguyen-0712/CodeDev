import {
    neon,
    Pool as NeonPool,
} from "@neondatabase/serverless";

import { Pool as PgPool } from "pg";

import { appEnv, isLocalUrl } from "@/lib/appEnv.mjs";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
}

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

export const dbDriver = resolveDriver(DATABASE_URL);

if (appEnv() === "production" && isLocalUrl(DATABASE_URL)) {
    // Allowed (docker-compose can run PostgreSQL next to the app), but usually a leaked dev .env.
    console.warn("[db] production is connected to a local PostgreSQL instance");
}

const pool = dbDriver === "neon"
    ? new NeonPool({ connectionString: DATABASE_URL, max: 10 })
    : new PgPool({ connectionString: DATABASE_URL, max: 10 });

const neonSql = dbDriver === "neon" ? neon(DATABASE_URL) : null;

export async function sql(text, params = []) {
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

export const dbPool = pool;
