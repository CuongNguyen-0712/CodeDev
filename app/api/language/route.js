'use server'
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL)

export async function GET() {
    try {
        const res = await sql`  
            select *
            from language
        `
        return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ error: "Server is error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}   