'use server'
import { sql } from '@/app/lib/db';

export async function updateInfo({ userId, nickname = null, surname = null, phone = null, name = null, email = null, url = null, bio = null }) {
    const params = []
    const conditions = []

    params.push(userId)
    conditions.push(`user_id = $${params.length}`)

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const setQuery = [];

    if (surname !== null) {
        params.push(surname)
        setQuery.push(`surname = case when $${params.length} is distinct from surname then $${params.length} else surname end`)
    }

    if (phone !== null) {
        params.push(phone)
        setQuery.push(`phone = case when $${params.length} is distinct from phone then $${params.length} else phone end`)
    }

    if (nickname !== null) {
        params.push(nickname)
        setQuery.push(`nickname = case when $${params.length} is distinct from nickname then $${params.length} else nickname end`)
    }

    if (name !== null) {
        params.push(name)
        setQuery.push(`name = case when $${params.length} is distinct from name then $${params.length} else name end`)
    }

    if (email !== null) {
        params.push(email)
        setQuery.push(`email = case when $${params.length} is distinct from email then $${params.length} else email end`)
    }

    if (url !== null) {
        params.push(url)
        setQuery.push(`image = case when $${params.length} is distinct from image then $${params.length} else image end`)
    }

    if (bio !== null) {
        params.push(bio)
        setQuery.push(`bio = case when $${params.length} is distinct from bio then $${params.length} else bio end`)
    }

    const setSQL = setQuery.length > 0 ? `SET ${setQuery.join(', ')}` : '';

    const query = `
        update private.info
        ${setSQL},
        update_at = now()
        ${whereSQL}
        `

    return await sql.query(query, params);
}

export async function updateStatusCourse({ userId, courseId, is_marked }) {
    const params = []
    const conditions = []

    params.push(userId)
    conditions.push(`user_id = $${params.length}`)

    params.push(courseId)
    conditions.push(`course_id = $${params.length}`)

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    params.push(is_marked)

    const query = `
            update course.register
            set is_marked = $${params.length}
            ${whereSQL}
        `;

    return await sql.query(query, params);
}

export async function updateStatusProject({ userId, projectId, is_marked, is_deleted }) {
    let params = []
    let conditions = []

    params.push(userId)
    conditions.push(`userid = $${params.length}`)

    params.push(projectId)
    conditions.push(`projectid = $${params.length}`)

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    let setQuery = [];

    if (is_marked !== undefined) {
        params.push(is_marked);
        setQuery.push(`is_marked = $${params.length}`);
    }

    if (is_deleted !== undefined) {
        params.push(is_deleted);
        setQuery.push(`is_deleted = $${params.length}`);
    }

    const setSQL = setQuery.length > 0 ? `SET ${setQuery.join(', ')}` : '';

    const query = `
            update project.register
            ${setSQL}
            ${whereSQL}
        `

    return await sql.query(query, params);
}

export async function updateWithdrawCourse({ userId, courseId }) {
    let params = []

    params.push(userId, courseId)

    const query = `select withdraw_course($${params.length - 1}, $${params.length});`;

    return await sql.query(query, params);
}
export async function updateLesson({ userId, courseId, lessonId }) {
    let params = []

    params.push(userId, courseId, lessonId)

    const query = `select update_lesson($${params.length - 2}, $${params.length - 1}, $${params.length});`;

    return await sql.query(query, params);
}

export async function updateVotingComment({ userId, commentId, isVoted }) {
    const params = []

    params.push(commentId, userId, isVoted)

    const query = `
            INSERT INTO private.voting (id, user_id, voting)
            VALUES ($1, $2, $3)
            ON CONFLICT (id, user_id)
            DO UPDATE SET 
                voting = EXCLUDED.voting,
                updated_at = NOW();
        `;

    return await sql.query(query, params);
}

