import {
    neon,
    Pool as NeonPool,
} from "@neondatabase/serverless";

import { Pool as PgPool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
}

const isProd = process.env.NODE_ENV === "production";

const devPool = new PgPool({
    connectionString: DATABASE_URL,
    max: 10,
});

const neonSql = neon(DATABASE_URL);

const prodPool = new NeonPool({
    connectionString: DATABASE_URL,
    max: 10,
});

export async function sql(text, params = []) {
    if (isProd) {
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

    return devPool.query(text, params);
}

export const dbPool = isProd
    ? prodPool
    : devPool;