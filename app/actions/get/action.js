'use server'
import { sql } from '@/app/lib/db';

import { client } from '@/app/lib/sanity';


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
                i.id as id,
                u.username,
                i.image,
                i.nickname,
                i.level,
                i.rank,
                i.star,
                f.status
            FROM private.users u
            INNER JOIN private.info i ON i.user_id = u.id AND i.user_id != (select id from private.users where public_id = $1)
            INNER JOIN private.friend f ON (
                (f.sender_id = (select id from private.users where public_id = $1) AND f.receiver_id = u.id)
                OR
                (f.receiver_id = (select id from private.users where public_id = $1) AND f.sender_id = u.id)
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
                t3.image_url AS team_image,
                u2.username AS host_name,
                (u2.id = $1) AS is_host,
                STRING_AGG(u1.username, ',') AS members
            FROM public.team t1
            JOIN public.team t2 ON t1.id = t2.id
            JOIN private.users u1 ON t2.host_id = u1.id
            JOIN public.team t3 ON t3.id = t1.id
            JOIN private.users u2 ON u2.id = t3.host_id
            ${whereSQL}    
            GROUP BY t1.id, t3.name, t3.size, t3.image_url, u2.username, u2.id
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
                u.public_id as user_id,
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
                AND v.user_id = (select id from private.users where public_id = $${params.length - 2})
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

export async function getRoadmap({ roadmapId }) {
    const params = []
    const condtions = []


    if (roadmapId) {
        params.push(roadmapId)
        condtions.push(`r.id = $${params.length}`)
    }

    const whereSQL = condtions.length > 0 ? `WHERE ${condtions.join(' AND ')}` : '';

    const query = `
        SELECT
            r.public_id as id,
            r.title as title,
            r.description as description,
            COUNT(n.id) nodes
        FROM public.roadmaps r
        JOIN roadmap.nodes n ON n.roadmap_id = r.id
        GROUP BY r.id
        ${whereSQL}
    `

    return await sql.query(query, params);
}

export async function getRoadmapNodes({ userId, roadmapId }) {
    const params = []
    const conditions = []

    params.push(userId, roadmapId)
    conditions.push(`n.roadmap_id = (select id from public.roadmaps where public_id = $${params.length})`)

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
        SELECT 
            n.id,
            n.title,
            n.description,
            n.order_index,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', c.public_id,
                        'title', c.title,
                        'image', c.image,
                        'rating', c.rating,
                        'lessons', c.lessons,
                        'progress', COALESCE(r.progress, 0),
                        'cost', c.cost,
                        'logo', l.logo,
                        'color', l.color,
                        'language', l.name,
                        'category', cat.name,
                        'reward', c.reward,
                        'priority', nc.priority
                    ) ORDER BY nc.priority ASC
                ) FILTER (WHERE c.id IS NOT NULL),
                '[]'
            ) AS courses
        FROM roadmap.nodes n
        LEFT JOIN roadmap.node_course nc ON nc.node_id = n.id
        LEFT JOIN public.course c ON c.id = nc.course_id
        LEFT JOIN public.language l ON c.language_id = l.id
        LEFT JOIN public.category cat ON c.category_id = cat.id
        LEFT JOIN course.register r ON r.course_id = c.id AND r.user_id = (select id from private.users where public_id = $1) AND r.is_deleted = false
        ${whereSQL}
        GROUP BY n.id, n.title, n.description, n.order_index
        ORDER BY n.order_index ASC
    `

    return await sql.query(query, params);
}