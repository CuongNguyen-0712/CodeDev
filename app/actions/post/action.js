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
        const params = []

        params.push(sender, title, feedback)

        const query = `INSERT INTO public.feedback (sender, title, feedback) VALUES ($${params.length - 2}, $${params.length - 1}, $${params.length})`;

        await sql.query(query, params);

        return new Response(
            JSON.stringify({ message: "Feedback saved successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
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
        const params = []

        params.push(userId, courseId)

        const query = `select register_course($${params.length - 1}, $${params.length})`;

        await sql.query(query, params);

        return new Response(
            JSON.stringify({ message: 'Register course successfully: ' }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error register course: ", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
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
        const params = []

        params.push(userId, projectId)

        const query = `
            INSERT INTO project.register (join_id, project_id) 
            VALUES ($${params.length - 1}, $${params.length}) 
            ON CONFLICT (join_id, project_id)
            DO UPDATE SET is_deleted = false
        `;

        await sql.query(query, params);

        return new Response(
            JSON.stringify({ message: "Register project successfully: " }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error register project: ", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
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
        const params = []

        params.push(teamId, name, size, userId)

        const query = `select create_team($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length})`;

        await sql.query(query, params);

        return new Response(
            JSON.stringify({ message: "Create team successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error create team:", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function postCommentCourse(data) {
    const { userId, courseId, comment } = data

    if (!(userId || courseId)) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    if (!comment || comment.trim().length === 0) {
        return new Response(
            JSON.stringify({ message: "Your comment is empty" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const params = []

        params.push(userId, courseId, comment)

        const query = `INSERT INTO course.comment (user_id, id, content) VALUES ($${params.length - 2}, $${params.length - 1}, $${params.length})`;

        await sql.query(query, params);

        return new Response(
            JSON.stringify({ message: "Thanks for your comment !" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error post comment:", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}