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
});


export async function sql(text, params = []) {
    if (isProd) {
        const result = await neonSql.query(text, params);
        return {
            rows: result,
            rowCount: result.length,
        };
    }

    const result = await devPool.query(text, params);

    return result;
}


export const dbPool = isProd
    ? prodPool
    : devPool;