'use server'
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL)

export async function getOverview(data) {
    try {
        const res = await sql`
            select c.id as id, 
            c.image as image, 
            c.lesson as lesson, 
            r.status as status, 
            c.title as title, 
            c.subject as subject,
            l.id as language,
            l.logo as logo,
            l.color as color
            from public.course c
            join registercourse r on r.idcourse = c.id
            left join language l on c.language = l.id
            where r.idstudent = ${data}
        `;

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error saving feedback:", error);
        return new Response(
            JSON.stringify({ data: 'Something went wrong', message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function getInfo(data) {
    try {
        const res = await sql`
            select i.surname as surname, i.name as name, i.email as email, i.image as image, i.bio as bio, i.nickname as nickname, i.rank as rank, i.star as star, i.level as level, u.username as username
            from public.users u
            join infouser i on u.id = i.id
            where u.id = ${data}
            limit 1
        `;

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error saving feedback:", error);
        return new Response(
            JSON.stringify({ data: 'Something went wrong', message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function getProject(data) {
    try {
        const res = await sql`
            select i.*
            from joinproject j
            join project i on j.idproject = i.id
            join users u on j.idjoin = u.id 
        `;

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error saving feedback:", error);
        return new Response(
            JSON.stringify({ data: 'Something went wrong', message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function getCourse(data) {
    try {
        if (!data) {
            return new Response(
                JSON.stringify({ message: "You missing something, check again" }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        const res = await sql`
            select *
            from course
            where course.id not in
            (
            select c.id
            from registercourse r
            join course c on r.idcourse = c.id
            where r.idstudent = ${data}
            )
        `;

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            console.error("Error saving feedback:", error),
            JSON.stringify({ message: "Something went wrong, please try again" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function getMyCourse(data) {
    try {
        const res = await sql`
            select c.* , r.progress as progress, r.status as status
            from registercourse r
            join course c on r.idcourse = c.id
            where r.idstudent = ${data}
        `

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error saving feedback:", error);
        return new Response(
            JSON.stringify({ data: 'Something went wrong', message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function getMyProject(data) {
    try {
        if (!data) {
            return new Response(JSON.stringify({ message: "You missing something, check again" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }

        const res = await sql`
        select i.*
        from joinproject j
            join project i on j.idproject = i.id
            join users u on j.idjoin = u.id 
            where u.id = ${data}
        `;

        return new Response(JSON.stringify({ data: res, message: "Get data successfully" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ message: "Failed to load content, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}