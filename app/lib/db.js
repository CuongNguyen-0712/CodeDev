import { neon, Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
}

const isProd = process.env.NODE_ENV === "production";

const neonSql = neon(DATABASE_URL);

const devPool = new PgPool({
    connectionString: DATABASE_URL,
    max: 10,
});

const prodPool = new NeonPool({
    connectionString: DATABASE_URL,
});

export const sql = async (text, params = []) => {
    if (isProd) {
        return neonSql(text, params);
    }

    const result = await devPool.query(
        text,
        params
    );

    return result.rows;
};

export const dbPool = isProd
    ? prodPool
    : devPool;