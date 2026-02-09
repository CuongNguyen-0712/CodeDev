'use server'
import { sql } from '@/app/lib/db';

export async function getOverview(data) {
    if (!data) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const params = []
        const conditions = []

        params.push(data)
        conditions.push(`r.user_id = $${params.length}`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
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
            join course.register r on r.course_id = c.id
            left join language l on c.language = l.id
            ${whereSQL}
        `;

        const res = await sql.query(query, params);

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
    if (!data) {
        return new Response(JSON.stringify({ message: "You missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const params = []
        const conditions = []

        params.push(data)
        conditions.push(`i.user_id = $${params.length}`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            select i.surname as surname, i.name as name, i.email as email, i.image as image, i.bio as bio, i.nickname as nickname, i.rank as rank, i.star as star, i.level as level, u.username as username, i.phone as phone
            from private.users u
            join private.info i on u.id = i.user_id
            ${whereSQL}
            limit 1
        `;

        const res = await sql.query(query, params);

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

export async function getProject({
    id,
    search,
    limit = 20,
    offset = 0,
    method,
    status,
    difficulty,
}) {
    if (!id) {
        return new Response(
            JSON.stringify({ message: "Missing something, try again" }),
            { status: 400 }
        );
    }

    try {
        const conditions = [];
        const params = [];

        params.push(id);

        if (method) {
            const methods = method.split(',').map(m => m.trim())
            if (methods.length === 1) {
                params.push(method);
                conditions.push(`p.method = $${params.length}`);
            }
        }

        if (status) {
            const statuses = status.split(",").map(s => s.trim());
            params.push(statuses);
            conditions.push(`p.status = ANY($${params.length}::statusproject[])`);
        }

        if (difficulty) {
            const difficulties = difficulty.split(",").map(d => d.trim());
            params.push(difficulties);
            conditions.push(`p.difficulty = ANY($${params.length}::levelenum[])`);
        }

        if (search && search.trim()) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(p.name) LIKE $${params.length}`);
        }

        const whereSQL = conditions.length
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        params.push(limit, offset);

        const query = `
            SELECT p.*
            FROM public.project p
            LEFT JOIN project.register r
                ON r.project_id = p.id
                AND r.join_id = $1
            ${whereSQL}
            ORDER BY p.id ASC
            LIMIT $${params.length - 1}
            OFFSET $${params.length}
        `;

        const res = await sql.query(query, params);

        return new Response(
            JSON.stringify({
                data: res,
                message: "Get data successfully",
            }),
            { status: 200 }
        );
    } catch (err) {
        console.error("Error get project:", err);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
}

export async function getCourse({
    id,
    search,
    limit = 20,
    offset = 0,
    price,
    level,
    rating
}) {
    if (!id) {
        return new Response(
            JSON.stringify({ message: "Missing something, try again" }),
            { status: 400 }
        );
    }

    try {
        const conditions = [];
        const params = [];

        params.push(id);
        conditions.push(`
            c.id NOT IN (
                SELECT c2.id
                FROM course.register r
                JOIN public.course c2 ON r.course_id = c2.id
                WHERE r.user_id = $${params.length}
                AND r.status = ANY(ARRAY['Enrolled','In Progress','Completed']::status_course[])
            )
        `);

        if (search) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(c.title) LIKE $${params.length}`);
        }

        if (price) {
            const somePrice = price.split(',').map(s => s.trim())

            if (somePrice.length == 1) {
                const isFree = price === false || price === "false";
                conditions.push(isFree ? `c.cost = 0` : `c.cost <> 0`);
            }
        }

        if (level) {
            const levels = level.split(",").map(l => l.trim());
            params.push(levels);
            conditions.push(`c.level = ANY($${params.length}::levelenum[])`);
        }

        if (rating) {
            const ratings = rating
                .split(",")
                .map(r => parseInt(r.trim(), 10))
                .filter(Number.isInteger);

            if (ratings.length) {
                params.push(ratings);
                conditions.push(`c.rating = ANY($${params.length}::integer[])`);
            }
        }

        conditions.push(`c.is_hidden = false`);
        conditions.push(`c.is_deleted = false`);

        const whereSQL = conditions.length
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        params.push(limit, offset);

        const query = `
            SELECT c.*
            FROM public.course c
            ${whereSQL}
            ORDER BY c.id DESC
            LIMIT $${params.length - 1}
            OFFSET $${params.length}
        `;

        const res = await sql.query(query, params);

        return new Response(
            JSON.stringify({ data: res, message: "Get data successfully" }),
            { status: 200 }
        );
    } catch (err) {
        console.error(err);
        return new Response(
            JSON.stringify({ message: "Internal server error" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
}

export async function getMyCourse({ id, search, limit = 20, offset = 0, marked, status, level }) {
    if (!id) {
        return new Response(JSON.stringify({ message: "Missing something, try again" }), { status: 400 });
    }

    try {
        const conditions = [];
        const params = [];

        params.push(id);
        conditions.push(`r.user_id = $${params.length}`);

        if (marked) {
            const someMarked = marked.split(',').map(s => s.trim())

            if (someMarked.length == 1) {
                const isMarked = marked === true || marked === "true";
                params.push(isMarked);
                conditions.push(`r.is_marked = $${params.length}`);
            }
        }

        if (search) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(c.title) LIKE $${params.length}`);
        }

        if (status) {
            const statuses = status.split(',').map(s => s.trim());
            params.push(statuses);
            conditions.push(`
                r.status = ANY($${params.length}::status_course[])
            `);
        }

        if (level) {
            const levels = level.split(",").map(l => l.trim());
            params.push(levels);
            conditions.push(`c.level = ANY($${params.length}::levelenum[])`);
        }

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        params.push(limit, offset);

        const query = `
            SELECT 
                c.*, 
                r.progress AS progress,
                r.status AS status,
                r.is_marked AS is_marked
            FROM course.register r
            JOIN public.course c ON r.course_id = c.id
            ${whereSQL}
            ORDER BY r.last_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `;

        const res = await sql.query(query, params);

        return new Response(JSON.stringify({ data: res }), { status: 200 });
    } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ message: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

export async function getMyProject({
    id,
    search,
    limit = 20,
    offset = 0,
    status,
    method,
    difficulty,
}) {
    if (!id) {
        return new Response(
            JSON.stringify({ message: "Missing something, try again" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const conditions = [];
        const params = [];

        params.push(id);
        conditions.push(`r.join_id = $${params.length}`);

        if (search && search.trim()) {
            params.push(`%${search.toLowerCase()}%`);
            conditions.push(`LOWER(p.name) LIKE $${params.length}`);
        }

        if (method) {
            const methods = method.split(",").map(s => s.trim());
            params.push(methods);
            conditions.push(`p.method = ANY($${params.length}::methodproject[])`);
        }

        if (status) {
            const statuses = status.split(",").map(s => s.trim());
            params.push(statuses);
            conditions.push(
                `r.status = ANY($${params.length}::status_project_progress[])`
            );
        }

        if (difficulty) {
            const difficulties = difficulty.split(",").map(d => d.trim());
            params.push(difficulties);
            conditions.push(
                `p.difficulty = ANY($${params.length}::levelenum[])`
            );
        }

        const whereSQL = conditions.length
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        params.push(limit, offset);

        const query = `
            SELECT
                p.id           AS id,
                p.name         AS name,
                p.method       AS method,
                r.status AS status,
                p.description  AS description
            FROM project.register r
            JOIN public.project p
                ON r.project_id = p.id
            ${whereSQL}
            ORDER BY r.updated_at DESC
            LIMIT $${params.length - 1}
            OFFSET $${params.length}
        `;

        const res = await sql.query(query, params);

        return new Response(
            JSON.stringify({
                data: res,
                message: "Get data successfully",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("Error:", err);
        return new Response(
            JSON.stringify({ message: "Failed to load content, try again" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
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
                        inner join private.info i on i.user_id = f.friend_id 
                        inner join private.users u on u.id = i.user_id
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
        console.error(err);
        return new Response(JSON.stringify({ message: "Failed to load content, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

export async function getSocial({ id, search, offset = 0, limit = 20, filter }) {
    try {
        if (!id) {
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
                    join private.info i on i.user_id = u.id
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
        console.error(err);
        return new Response(JSON.stringify({ message: 'Internal server error' }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

export async function getContentCourse({ user_id, course_id }) {
    if (!course_id) {
        return new Response(JSON.stringify({ message: "Missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        const params = []

        params.push(user_id, course_id)

        const query = `select * from join_course($${params.length - 1}, $${params.length});`

        const res = await sql.query(query, params);

        return new Response(JSON.stringify({ data: res }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ message: 'Internal server error' }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}

export async function getContentLesson({ user_id, lesson_id, course_id }) {
    if (!(lesson_id || user_id || course_id)) {
        return new Response(JSON.stringify({ message: "Missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        const params = []

        params.push(user_id, course_id, lesson_id)

        const query = `select * from get_lesson($${params.length - 2}, $${params.length - 1}, $${params.length});`

        const res = await sql.query(query, params);

        return new Response(JSON.stringify({ data: res }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err)
        if (err.code === 'P2000') {
            return new Response(JSON.stringify({ message: err.message || 'Please complete the previous lesson' }), {
                status: 501,
                headers: { "Content-Type": "application/json" }
            })
        }

        return new Response(JSON.stringify({ message: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}

export async function getStateCourse({ course_id }) {
    if (!course_id) {
        return new Response(JSON.stringify({ message: "Missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        const conditions = []
        const params = []

        params.push(course_id)
        conditions.push(`id = $${params.length}`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT *
            FROM public.course
            ${whereSQL}
            LIMIT 1
        `

        const res = await sql.query(query, params);

        return new Response(JSON.stringify({ data: res[0] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ message: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}

export async function getLessonCourse({ course_id }) {
    if (!course_id) {
        return new Response(JSON.stringify({ message: "Missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        const conditions = []
        const params = []

        params.push(course_id)
        conditions.push(`m.course_id = $${params.length}`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                m.id as module_id,
                m.title as title,
                l.id as lesson_id,
                l.title as name,
                l.content_type as type
            FROM course.lesson l
            JOIN course.module m ON m.id = l.module_id
            ${whereSQL}
            ORDER BY m.order_index ASC, l.order_index ASC
        `

        const res = await sql.query(query, params)

        return new Response(JSON.stringify({ data: res }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ message: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}

export async function getCommentCourse({ course_id, offset = 0, limit = 20 }) {
    if (!(course_id)) {
        return new Response(JSON.stringify({ message: "Missing something, check again" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        })
    }

    try {
        const conditions = []
        const params = []

        params.push(course_id)
        conditions.push(`m.course_id = $${params.length}`)

        params.push(offset, limit)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                u.username as username,
                i.image as avatar,
                m.id as id,
                m.content as comment,
                m.upvotes as upvotes,
                m.downvotes as downvotes,
                m.created_at as created_at
            FROM public.comment m
            JOIN private.info i ON m.user_id = i.user_id
            JOIN private.users u on m.user_id = u.id
            ${whereSQL}
            ORDER BY m.created_at DESC
            OFFSET $${params.length - 1} LIMIT $${params.length}
        `

        const res = await sql.query(query, params);

        return new Response(JSON.stringify({ data: res }), { status: 200 });
    }
    catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ message: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
}