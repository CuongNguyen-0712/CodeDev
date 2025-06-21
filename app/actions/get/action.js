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
            join course.register r on r.courseid = c.id
            left join language l on c.language = l.id
            where r.userid = ${data}
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
            select i.surname as surname, i.name as name, i.email as email, i.image as image, i.bio as bio, i.nickname as nickname, i.rank as rank, i.star as star, i.level as level, u.username as username, i.phone as phone
            from private.users u
            join private.info i on u.id = i.id
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
    if (!data) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        )
    }

    try {
        const res = await sql`
            select p.*
            from public.project p
            where p.id not in (
                select projectid
                from project.register
                where userid = ${data}
            )
        `;

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ message: "Something went wrong, please try again" }),
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
            from public.course
            where course.id not in
            (
            select c.id
            from course.register r
            join public.course c on r.courseid = c.id
            where r.userid = ${data}
            )
        `;

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            console.error("Error:", error),
            JSON.stringify({ message: "Something went wrong, please try again" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function getMyCourse(data) {
    if (!data) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        )
    }

    try {
        const res = await sql`
            select c.* , r.progress as progress, r.status as status
            from course.register r
            join public.course c on r.courseid = c.id
            where r.userid = ${data} and r.hidestatus = false
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
            select  p.id as id,
                    p.name as name, 
                    p.method as method, 
                    r.statusprogress as status,
                    p.description as description
            from project.register r
            join public.project p on r.projectid = p.id
            where r.userid = ${data} and r.hidestatus = false
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