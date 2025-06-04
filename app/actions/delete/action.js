'use server'
import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";

const sql = neon(process.env.DATABASE_URL);

export async function deleteMyCourse(data) {
    try {
        if (!data) {
            return new Response(
                JSON.stringify({ message: "You missing something, check again" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const { idCourse, idStudent } = data

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