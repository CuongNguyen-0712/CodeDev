'use server'
import { sql } from "@vercel/postgres";

export async function GET() {
    try {
        const res = await sql`SELECT * FROM content`;
        const data = res.rows;

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Failed to load content: ", error);
        return new Response(JSON.stringify(), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
