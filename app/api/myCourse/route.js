'use server'
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL)

export async function GET() {
    try {
        const res = await sql`
            select c.* , r.progress as progress, r.status as status
            from registercourse r
            join course c on r.idcourse = c.id
            join users u on r.idstudent = u.id
        `
        return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        })
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify("Server is error"), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}   