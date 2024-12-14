'use server'

import { sql } from '@vercel/postgres'

export async function POST(req) {
    try {
        const data = await req.json();
        const { title, feedback, emotion } = data;

        await sql`INSERT INTO feedback (title, feedback, emotion) VALUES (${title}, ${feedback}, ${emotion})`;

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
