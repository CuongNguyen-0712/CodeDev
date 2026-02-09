'use server'
import { sql } from '@/app/lib/db';

export async function updateInfo(data) {
    const { userId, nickname, surname, name, email, image, bio } = data

    if (!userId || !surname || !name || !email || !image) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        let params = []
        let conditions = []

        params.push(userId)
        conditions.push(`user_id = $${params.length}`)

        params.push(nickname, surname, name, email, image, bio)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        const query = `
        update private.info
        set 
        nickname = case when $${params.length - 5} is distinct from nickname then $${params.length - 5} else nickname end,
        surname = case when $${params.length - 4} is distinct from surname then $${params.length - 4} else surname end,
        name = case when $${params.length - 3} is distinct from name then $${params.length - 3} else name end,
        email = case when $${params.length - 2} is distinct from email then $${params.length - 2} else email end,
        image = case when $${params.length - 1} is distinct from image then $${params.length - 1} else image end,
        bio = case when $${params.length} is distinct from bio then $${params.length} else bio end,
        update_at = now()
        ${whereSQL}
        `

        const res = await sql.query(query, params);

        if (res.count === 0) {
            return new Response(JSON.stringify({ message: "Something went wrong, try again" }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ message: "Updated successfully" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ message: "Failed to load content, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

export async function updateMarkedCourse(data) {
    const { userId, courseId, marked } = data;

    if (!userId || !courseId) {
        return new Response(JSON.stringify({ message: "You missing something try again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        let params = []
        let conditions = []

        params.push(userId)
        conditions.push(`user_id = $${params.length}`)

        params.push(courseId)
        conditions.push(`course_id = $${params.length}`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        params.push(marked)

        const query = `
            update course.register
            set is_marked = $${params.length}
            ${whereSQL}
        `;

        await sql.query(query, params);

        return new Response({
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ message: "Something went wrong, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

export async function updateHideStatusProject(data) {
    const { userId, projectId, hide } = data;

    if (!userId || !projectId) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        let params = []
        let conditions = []

        params.push(userId)
        conditions.push(`userid = $${params.length}`)

        params.push(projectId)
        conditions.push(`projectid = $${params.length}`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        params.push(hide)

        const query = `
            update project.register
            set hidestatus = $${params.length}
            ${whereSQL}
        `

        await sql.query(query, params);

        return new Response(JSON.stringify({ message: "Action successfully" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ message: "Something went wrong, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

export async function updateWithdrawCourse(data) {
    const { user_id, course_id } = data;

    if (!(course_id || user_id)) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        let params = []

        params.push(user_id, course_id)

        const query = `select withdraw_course($${params.length - 1}, $${params.length});`;

        await sql.query(query, params);

        return new Response({
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ message: "Something went wrong, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
export async function updateLesson(data) {
    const { user_id, course_id, lesson_id } = data;

    if (!(lesson_id || course_id || user_id)) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        let params = []

        params.push(user_id, course_id, lesson_id)

        const query = `select update_lesson($${params.length - 2}, $${params.length - 1}, $${params.length});`;

        await sql.query(query, params);

        return new Response(JSON.stringify({ message: "Congratulations, learn next lesson" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ message: "Something went wrong, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

