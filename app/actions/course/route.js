'use server'
import { revalidatePath } from "next/cache";
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL)
export async function POST(req) {
    try {
        const { idCourse, idStudent } = await req.json()

        await sql`
        insert into registercourse (idcourse, idstudent) values (${idCourse}, ${idStudent})
        `
        revalidatePath('/home/course')

        return new Response(
            JSON.stringify({ message: "Register course successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error saving feedback:", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}