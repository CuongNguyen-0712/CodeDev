'use server'
import { sql } from '@/app/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function postFeedback(data) {
    const { title, feedback, sender } = data;

    if (!title || !feedback || !sender) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        await sql`INSERT INTO public.feedback (sender, title, feedback) VALUES (${sender} ,${title}, ${feedback})`;

        return new Response(
            JSON.stringify({ message: "Feedback saved successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "applicationContent-Type": "/json" } }
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
        await sql`select register_course(${userId}, ${courseId})`;

        return new Response(
            JSON.stringify({ message: 'Register course successfully: ' }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        w
        console.error("Error register course: ", error);
        return new Response(
            JSON.stringify({ message: error.message || "Somthing went wrong" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
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
            JSON.stringify({ message: "Register project successfully: " }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error register project: ", error);
        return new Response(
            JSON.stringify({ message: "Somthing went wrong" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function postCreateTeam(data) {
    const { userId, name, size } = data;
    const teamId = uuidv4();

    if (!name || !size || !userId) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        await sql`select create_team(${teamId}, ${name}, ${size}, ${userId})`;

        return new Response(
            JSON.stringify({ message: "Create team successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error create team:", error);
        return new Response(
            JSON.stringify({ message: "Somthing went wrong" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}