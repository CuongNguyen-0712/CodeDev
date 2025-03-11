"use server";
import { revalidatePath } from "next/cache";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export async function DELETE(req) {
    try {
        const body = await req.json()
        const { idCourse, idStudent } = body

        await sql`
        DELETE FROM registercourse WHERE idcourse = ${idCourse} AND idstudent = ${idStudent}
        `;

        revalidatePath("/home");

        return new Response(
            JSON.stringify({ message: "Delete course successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error deleting course:", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
