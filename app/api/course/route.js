'use server'
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export async function GET() {
    try {
        const res = await sql`
            select *
            from course
            where course.id not in
            (
            select c.id
            from registercourse r
            join course c on r.idcourse = c.id
            join users u on r.idstudent = u.id
            )
        `;

        return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Failed to load content: ", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
