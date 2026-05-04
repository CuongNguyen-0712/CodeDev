'use server'
import { sql } from '@/app/lib/db';

export async function postFeedback({ sender, title, feedback }) {
    const params = []

    params.push(sender, title, feedback)

    const query = `INSERT INTO public.feedback (sender, title, feedback) VALUES ($${params.length - 2}, $${params.length - 1}, $${params.length})`;

    return await sql.query(query, params);
}

export async function postRegisterCourse({ userId, courseId }) {
    const params = []

    params.push(userId, courseId)

    const query = `select register_course($${params.length - 1}, $${params.length})`;

    return await sql.query(query, params);
}

export async function postRegisterProject({ userId, projectId }) {
    const params = []

    params.push(userId, projectId)

    const query = `
            INSERT INTO project.register (join_id, project_id) 
            VALUES ($${params.length - 1}, $${params.length}) 
            ON CONFLICT (join_id, project_id)
            DO UPDATE SET is_deleted = false
        `;

    return await sql.query(query, params);
}

export async function postCreateTeam({ teamId, userId, name, size, description }) {
    const params = []

    params.push(teamId, userId, name, size, description)

    const query = `
            INSERT INTO public.team (id, host_id, name, size, description) 
            VALUES ($${params.length - 4}, $${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length})
        `;

    return await sql.query(query, params);
}

export async function postCommentCourse({ userId, courseId, comment }) {
    const params = []

    params.push(userId, courseId, comment)

    const query = `INSERT INTO course.comment (user_id, id, content) VALUES ($${params.length - 2}, $${params.length - 1}, $${params.length})`;

    return await sql.query(query, params);
}