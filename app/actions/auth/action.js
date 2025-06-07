'use server'
import { neon } from "@neondatabase/serverless";
import { createSession } from "@/app/lib/session";

const sql = neon(process.env.DATABASE_URL);

export async function signIn(data) {
    try {
        const { name, pass } = data

        if (!name || !pass) {
            return new Response(JSON.stringify({ success: false, message: "Missing credentials" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            )
        }

        const res = await sql`select id from users where username = ${name} and password = ${pass} limit 1`

        if (res.length === 0) {
            return new Response(
                JSON.stringify({ success: false }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            )
        }

        const userId = await res[0]?.id
        await createSession(userId)

        return new Response(
            JSON.stringify({ success: true }),
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