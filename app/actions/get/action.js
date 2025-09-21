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

        if (res.length === 0) {
            return new Response(
                JSON.stringify({ message: "User not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error get user information:", error);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function getProject({ id, search, limit, offset, method, status, difficulty }) {
    if (!id) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        )
    }

    try {
        const res = await (async () => {
            if (method) {
                return await sql`
                    select p.*
                        from public.project p
                        where p.id not in (
                            select projectid
                            from project.register
                            where userid = ${id}
                        )
                        and p.method = ${method}
                        and (${search}::text is null or lower(p.name) like '%' || lower(${search}) || '%')
                        and (${method}::text is null or p.method = ${method})
                        and (${status}::text is null or p.status = ${status})
                        and (${difficulty}::text is null or p.difficulty = ${difficulty})
                        order by p.id asc
                        limit ${limit}
                        offset ${offset}
                        `
            }
            else {
                return await sql`
                        (
                        select p.*
                        from public.project p
                        where p.id not in (
                            select projectid
                            from project.register
                            where userid = ${id}
                        )
                        and p.method = 'Self'
                        and (${search}::text is null or lower(p.name) like '%' || lower(${search}) || '%')
                        and (${status}::text is null or p.status = ${status})
                        and (${difficulty}::text is null or p.difficulty = ${difficulty})
                        order by p.id asc
                        limit ${limit}
                        offset ${offset}
                    )
                    union 
                    (
                        select p.*
                        from public.project p
                        where p.id not in (
                            select projectid
                            from project.register
                            where userid = ${id}
                        )
                        and p.method = 'Team'
                        and (${search}::text is null or lower(p.name) like '%' || lower(${search}) || '%')
                        and (${status}::text is null or p.status = ${status})
                        and (${difficulty}::text is null or p.difficulty = ${difficulty})
                        order by p.id asc
                        limit ${limit}
                        offset ${offset}
                    )
                    `
            }
        })()

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

export async function getCourse({ id, search, limit, offset, price, level, rating }) {
    try {
        if (!id) {
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
                where r.userid = ${id}
                )
            and (${search}::text is null or lower(course.title) like '%' || lower(${search}) || '%')
            and (${price}::text is null or case when ${price}  = false then cost = 'free' else cost != 'free' end)
            and (${level}::text is null or level = ${level})
            and (${rating}::text is null or rating = ${rating})
            order by course.id desc
            limit ${limit} offset ${offset}
            `

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" }
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ message: error.message || "Something went wrong, please try again" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
}

export async function getMyCourse({ id, search, limit, offset, hide }) {
    if (!id) {
        return new Response(
            JSON.stringify({ message: "You missing something, check again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        )
    }

    try {
        const res = await sql`
            select c.*, r.progress as progress, r.status as status
            from course.register r
            join public.course c on r.courseid = c.id
            where 
                r.userid = ${id} and 
                r.hidestatus = ${hide} and
                (${search}::text is null or lower(c.title) like '%' || lower(${search}::text) || '%')    
            order by r.courseid desc
            limit ${limit} offset ${offset}
        `;

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function getMyProject({ id, search, limit, offset, hide }) {
    try {
        if (!id) {
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
            where 
                r.userid = ${id} 
                and (${search}::text is null or lower(p.name) like '%' || lower(${search}) || '%' )
                and r.hidestatus = ${hide}
                order by p.id desc
            limit ${limit} offset ${offset}
        `

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

export async function getMySocial({ id, tab, search }) {
    if (!id) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        const res = await (async () => {
            switch (tab) {
                case 'friend':
                    return await sql`
                        select 
                            u.username as username, 
                            i.image as image,
                            i.nickname as nickname,
                            i.level as level,
                            i.rank as rank,
                            i.star as star
                        from social.friend f
                        inner join private.info i on i.id = f.friend_id 
                        inner join private.users u on u.id = i.id
                        where f.user_id = ${id}
                        and (${search}::text is null or lower(u.username) like '%' || lower(${search}) || '%') 
                    `;
                case 'team':
                    return await sql`
                        SELECT
                            t1.team_id as team_id,
                            t3.name as team_name,
                            t3.size as team_size,
                            t3.image as team_image,
                            u2.username as host_name,
                            (case when u2.id = ${id} then true else false end) as is_host,
                            string_agg(u1.username, ',') AS members
                        FROM social.team t1
                        JOIN social.team t2 ON t1.team_id = t2.team_id
                        JOIN private.users u1 ON t2.user_id = u1.id
                        join public.team t3 on t3.id = t1.team_id
                        join private.users u2 on u2.id = t3.host_id
                        WHERE t1.user_id = ${id}
                        AND (${search}::text is null or lower(t3.name) like '%' || lower(${search}) || '%')
                        AND exists (
                            select id
                            from public.team
                            where id = t1.team_id
                        )
                        GROUP BY t3.name, t3.size, u2.username, t3.image, u2.id, t1.team_id
                    `;
                default:
                    return []
            }
        })()

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

export async function getSocial({ id, search, offset, limit, filter }) {
    try {
        if (!id || !offset || !limit) {
            return new Response(JSON.stringify({ message: "You missing something, check again" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }

        const res = await (async () => {
            switch (filter) {
                case 'user':
                    return await sql`
                    select 
                        u.id as id,
                        u.username as username, 
                        i.image as image, 
                        i.nickname as nickname,
                        i.level as level,
                        i.rank as rank,
                        i.star as star
                    from private.users u
                    join private.info i on i.id = u.id
                    where u.id not in (
                    select friend_id
                    from social.friend
                    where user_id = ${id}
                    )
                    and u.id != ${id}
                    and u.lockstatus = false
                    and (${search}::text is null or lower(u.username) like '%' || lower(${search}::text) || '%')
                    limit ${limit} offset ${offset}
                `;
                case 'team':
                    return await sql`
                    select *
                    from public.team 
                    where id not in (
                        select team_id 
                        from social.team
                        where user_id = ${id}
                    )
                    and (${search}::text is null or lower(name) like '%' || lower(${search}::text) || '%')
                    limit ${limit} offset ${offset}
                    `
                default:
                    return new Response(JSON.stringify({ message: "Something is wrong, try again" }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    })
            }
        })()

        return new Response(JSON.stringify({ data: res, message: "Get data successfully" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ message: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

