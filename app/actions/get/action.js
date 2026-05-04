'use server'
import { sql } from '@/app/lib/db';

import { client } from '@/app/lib/sanity';

export async function getOverview(data) {
    const params = []
    const conditions = []

    params.push(data)
    conditions.push(`r.user_id = $${params.length}`)

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
            select c.id as id, 
            c.image as image, 
            c.lessons as lesson, 
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

    return await sql.query(query, params);
}

export async function getInfo(data) {
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

    return await sql.query(query, params);
}

export async function getProject({ userId, search, limit, offset, methods, statuses, difficulties }) {
    const conditions = [];
    const params = [];

    params.push(userId);

    if (methods && methods.length > 0) {
        const methodsArray = methods.map(m => m.trim());
        if (methodsArray.length === 1) {
            params.push(methodsArray[0]);
            conditions.push(`p.method = $${params.length}`);
        }
    }

    if (statuses && statuses.length > 0) {
        const statusesArray = statuses.map(s => s.trim());
        params.push(statusesArray);
        conditions.push(`p.status = ANY($${params.length}::statusproject[])`);
    }

    if (difficulties && difficulties.length > 0) {
        const difficultiesArray = difficulties.map(d => d.trim());
        params.push(difficultiesArray);
        conditions.push(`p.difficulty = ANY($${params.length}::levelenum[])`);
    }

    if (search && search.trim()) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(`LOWER(p.name) LIKE $${params.length}`);
    }

    conditions.push(`p.id NOT IN (
            SELECT r.project_id
            FROM project.register r
            WHERE r.join_id = $1
            AND r.is_deleted = false
        )`);

    const whereSQL = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    params.push(limit, offset);

    const query = `
            SELECT 
            p.*
            FROM public.project p
            ${whereSQL}
            ORDER BY p.id ASC
            LIMIT $${params.length - 1}
            OFFSET $${params.length}
        `;

    return await sql.query(query, params);
}

export async function getCourse({ userId, search, limit, offset, prices, levels, ratings }) {
    const conditions = [];
    const params = [];

    params.push(userId);

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

    if (prices) {
        const priceArray = prices.map(p => p.trim());

        if (priceArray.length == 1) {
            const isFree = priceArray[0] === false || priceArray[0] === "false";
            conditions.push(isFree ? `c.cost = 0` : `c.cost <> 0`);
        }
    }

    if (levels && levels.length) {
        const levelArray = levels.map(l => l.trim());
        params.push(levelArray);
        conditions.push(`c.level = ANY($${params.length}::levelenum[])`);
    }

    if (ratings && ratings.length) {
        const ratingArray = ratings.map(r => parseInt(r.trim(), 10)).filter(Number.isInteger);
        params.push(ratingArray);
        conditions.push(`c.rating = ANY($${params.length}::integer[])`);
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

    return await sql.query(query, params);
}

export async function getMyCourse({ userId, search, limit, offset, markeds, statuses, levels }) {
    const conditions = [];
    const params = [];

    params.push(userId);
    conditions.push(`r.user_id = $${params.length}`);

    if (markeds && markeds.length > 0) {
        const markedArray = markeds.map(s => s.trim());

        if (markedArray.length == 1) {
            const isMarked = markeds === true || markeds === "true";
            params.push(isMarked);
            conditions.push(`r.is_marked = $${params.length}`);
        }
    }

    if (search) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(`LOWER(c.title) LIKE $${params.length}`);
    }

    if (statuses && statuses.length > 0) {
        const statusesArray = statuses.map(s => s.trim());
        params.push(statusesArray);
        conditions.push(`r.status = ANY($${params.length}::status_course[])`);
    }

    if (levels && levels.length > 0) {
        const levelsArray = levels.map(l => l.trim());
        params.push(levelsArray);
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

    return await sql.query(query, params);
}

export async function getMyProject({ userId, search, limit, offset, methods, statuses }) {
    const conditions = [];
    const params = [];

    params.push(userId);
    conditions.push(`r.join_id = $${params.length}`);

    if (search && search.trim()) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(`LOWER(p.name) LIKE $${params.length}`);
    }

    if (methods && methods.length > 0) {
        const methodsArray = methods.map(m => m.trim());
        params.push(methodsArray);
        conditions.push(`p.method = ANY($${params.length}::methodproject[])`);
    }

    if (statuses && statuses.length > 0) {
        const statusesArray = statuses.map(s => s.trim());
        params.push(statusesArray);
        conditions.push(
            `r.status = ANY($${params.length}::status_project_progress[])`
        );
    }

    conditions.push(`r.is_deleted = false`);

    const whereSQL = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    params.push(limit, offset);

    const query = `
            SELECT
                p.id AS id,
                p.name AS name,
                p.method AS method,
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

    return await sql.query(query, params);
}

export async function getMyFriends({ userId, search }) {
    const params = [];
    const conditions = [];

    params.push(userId);

    if (search && search.trim()) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(`LOWER(u.username) LIKE $${params.length}`);
    }

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
        SELECT
                u.id,
                u.username,
                i.image,
                i.nickname,
                i.level,
                i.rank,
                i.star,
                f.status
            FROM private.users u
            INNER JOIN private.info i ON i.user_id = u.id AND i.user_id != $1
            INNER JOIN private.friend f ON (
                (f.sender_id = $1 AND f.receiver_id = u.id)
                OR
                (f.receiver_id = $1 AND f.sender_id = u.id)
            )
            ${whereSQL}
        `;

    return await sql.query(query, params);
}


export async function getMyTeams({ userId, search }) {
    const params = [];
    const conditions = [];

    params.push(userId);

    conditions.push(`t1.host_id = $${params.length}`);

    if (search && search.trim()) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(`LOWER(t3.name) LIKE $${params.length}`);
    }

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
            SELECT
                t1.id AS team_id,
                t3.name AS team_name,
                t3.size AS team_size,
                t3.image AS team_image,
                u2.username AS host_name,
                (u2.id = $1) AS is_host,
                STRING_AGG(u1.username, ',') AS members
            FROM public.team t1
            JOIN public.team t2 ON t1.id = t2.id
            JOIN private.users u1 ON t2.host_id = u1.id
            JOIN public.team t3 ON t3.id = t1.id
            JOIN private.users u2 ON u2.id = t3.host_id
            ${whereSQL}    
            GROUP BY t1.id, t3.name, t3.size, t3.image, u2.username, u2.id
        `;

    return await sql.query(query, params);
}

export async function getUsersSocial({ userId, search, limit, offset }) {
    const params = [];
    const conditions = [];

    params.push(userId);

    if (search && search.trim()) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(`LOWER(u.username) LIKE $${params.length}`);
    }

    params.push(limit, offset);

    conditions.push(`u.id != $1`);
    conditions.push(`u.status = 'Active'`);
    conditions.push(`f.sender_id IS NULL`);

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
        SELECT 
            u.id,
            u.username,
            i.image,
            i.nickname,
            i.level,
            i.rank,
            i.star
        FROM private.users u
        LEFT JOIN private.info i ON i.user_id = u.id
        LEFT JOIN private.friend f 
            ON (
                (f.sender_id = $1 AND f.receiver_id = u.id)
                OR 
                (f.receiver_id = $1 AND f.sender_id = u.id)
            )
        ${whereSQL}
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    return await sql.query(query, params);
}

export async function getTeamsSocial(userId, search, limit, offset) {
    const conditions = [];
    const params = [];

    params.push(userId);
    conditions.push(`t.id NOT IN (
        SELECT team_id
        FROM social.team
        WHERE user_id = $1
    )`);

    if (search && search.trim()) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(`LOWER(t.name) LIKE $${params.length}`);
    }

    params.push(limit, offset);

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
        SELECT t.*
        FROM public.team t
        LEFT JOIN social.team s
            ON s.team_id = t.id AND s.user_id = $1
        ${whereSQL}
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    return await sql.query(query, params);
}

export async function getContentCourse({ userId, courseId }) {
    const params = []

    params.push(userId, courseId)

    const query = `select * from join_course($${params.length - 1}, $${params.length});`

    return await sql.query(query, params);
}

export async function getContentLesson({ userId, lessonId, courseId }) {
    const params = []

    params.push(userId, courseId, lessonId)

    const query = `select * from get_lesson($${params.length - 2}, $${params.length - 1}, $${params.length});`

    return await sql.query(query, params);
}


export async function getStateCourse(data) {
    const conditions = []
    const params = []

    params.push(data)
    conditions.push(`id = $${params.length}`)

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
            SELECT *
            FROM public.course
            ${whereSQL}
            LIMIT 1
        `

    return await sql.query(query, params);
}

export async function getLessonCourse(data) {
    const conditions = []
    const params = []

    params.push(data)
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

    return await sql.query(query, params)
}

export async function getCommentCourse({ userId, courseId, offset, limit }) {
    const conditions = []
    const params = []

    params.push(courseId)
    conditions.push(`m.id = $${params.length}`)

    params.push(userId, offset, limit)

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
            SELECT 
                u.username as username,
                i.image as avatar,
                m.comment_id as id,
                m.content as comment,
                m.upvotes as upvotes,
                m.downvotes as downvotes,
				v.voting as voting,
                m.created_at as created_at
            FROM course.comment m
            JOIN private.info i ON m.user_id = i.user_id
            JOIN private.users u on m.user_id = u.id
			LEFT JOIN private.voting v on v.id = m.comment_id
                AND v.user_id = $${params.length - 2}
            ${whereSQL}
            ORDER BY m.created_at DESC
            OFFSET $${params.length - 1} LIMIT $${params.length}
        `

    return await sql.query(query, params);
}

export async function getLesson(data) {
    const query = `*[_type == "lesson" && _id == $id][0]{
            title,
            slug,
            description,
            content
        }`;

    return await client.fetch(query, { id: data });
}