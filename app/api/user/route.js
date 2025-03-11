'use server'

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL)
export async function GET() {
    try {
        const res = await sql`
            select i.*, u.username as username
            from users u
            join infouser i on u.id = i.id
        `;

        return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ heading: 'Server is error', content: 'Failed to load content, please try again!' }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}