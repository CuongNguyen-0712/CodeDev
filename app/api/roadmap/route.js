'use server'
import { sql } from "@vercel/postgres";

export async function GET() {
    const res = await sql`SELECT * FROM content`;
    const data = res.rows;
    return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    });
}
