import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export async function updateInfo(data) {
    const { userId, nickname, surname, name, email, image, bio } = data

    if (!userId || !surname || !name || !email || !image) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const result = await sql`
        update private.info
        set 
        nickname = case when ${nickname} is distinct from nickname then ${nickname} else nickname end,
        surname = case when ${surname} is distinct from surname then ${surname} else surname end,
        name = case when ${name} is distinct from name then ${name} else name end,
        email = case when ${email} is distinct from email then ${email} else email end,
        image = case when ${image} is distinct from image then ${image} else image end,
        bio = case when ${bio} is distinct from bio then ${bio} else bio end,
        update_at = now()
        where user_id = ${userId}
        `

        if (result.count === 0) {
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

export async function updateHideStatusCourse(data) {
    const { userId, courseId, hide } = data;

    if (!userId || !courseId) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        await sql`
        update course.register
        set hidestatus = ${hide}
        where userid = ${userId} and courseid = ${courseId}
        `;

        return new Response(JSON.stringify({ message: "Action successfully" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        return new Response(JSON.stringify({ message: err.message || "Something went wrong, try again" }), {
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
        await sql`
        update project.register
        set hidestatus = ${hide}
        where userid = ${userId} and projectid = ${projectId}
        `

        return new Response(JSON.stringify({ message: "Action successfully" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        return new Response(JSON.stringify({ message: err.message || "Something went wrong, try again" }), {
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
        await sql`select update_lesson(${user_id}, ${course_id}, ${lesson_id});`;

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