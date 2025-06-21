'use server'
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function postFeedback(data) {
    const { title, feedback, email, sender } = data;

    if (!title || !feedback || !email || !sender) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        await sql`INSERT INTO public.feedback (sender, title, feedback, email) VALUES (${sender} ,${title}, ${feedback}, ${email})`;

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

export async function postRegisterCourse(data) {
    const { userId, courseId } = data

    if (!userId || !courseId) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        await sql`INSERT INTO course.register (userid, courseid) VALUES (${userId}, ${courseId})`;

        return new Response(
            JSON.stringify({ message: "Register course successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error register course:", error);
        return new Response(
            JSON.stringify({ message: "Somthing went wrong" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function postRegisterProject(data) {
    const { userId, projectId } = data

    if (!userId || !projectId) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        await sql`INSERT INTO project.register (userid, projectid) VALUES (${userId}, ${projectId})`;

        return new Response(
            JSON.stringify({ message: "Register project successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error register project:", error);
        return new Response(
            JSON.stringify({ message: "Somthing went wrong" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    }
}