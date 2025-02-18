'use server'
import { neon } from '@neondatabase/serverless';

const sql = neon(`${process.env.DATABASE_URL}`);
export async function POST(req) {
    try {
        const data = await req.json();
        const sender = 'CuongNguyen'
        const { title, feedback, email } = data;

        await sql`INSERT INTO feedback (sender, title, feedback, email) VALUES (${sender} ,${title}, ${feedback}, ${email})`;

        return new Response(
            JSON.stringify({ message: "Feedback saved successfully" }),
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
