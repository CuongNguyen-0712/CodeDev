'use server'
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export async function deleteMyCourse(data) {
    try {
        if (!data) {
            return new Response(
                JSON.stringify({ message: "You missing something, check again" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const { userId, courseId } = data

        await sql`      
        DELETE FROM course.register WHERE courseid = ${courseId} AND userid = ${userId};
        `;

        return new Response(
            JSON.stringify({ message: "Deleted successfully" }),
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

export async function deleteMyProject(data) {
    try {
        if (!data) {
            return new Response(
                JSON.stringify({ message: "You missing something, check again" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const { userId, projectId } = data

        await sql`      
        DELETE FROM project.register WHERE projectid = ${projectId} AND userid = ${userId};
        `;

        return new Response(
            JSON.stringify({ message: "Deleted successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error deleting project:", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}