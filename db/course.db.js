import { sql } from "@/lib/db";

export const courseDb = {
    getCourseDetails: async (data) => {
        const { userId, courseId } = data;

        const conditions = []
        const params = []

        if (userId) {
            params.push(userId)
        }

        params.push(courseId)
        conditions.push(`c.id = (select id from catalog.course where public_id = $${params.length})`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
        SELECT
            c.*,
            lang.name  AS language_name,
            lang.logo  AS language_logo,
            lang.color AS language_color,
            cat.name   AS category_name,
            COALESCE(f.id, null) AS is_favorite,
            ${userId ? `COALESCE(r.status, null) AS status,` : ''}
            ${userId ? `COALESCE(r.progress, 0) AS progress,` : ''}
            (
                SELECT json_agg(
                    json_build_object(
                        'title', m.title,
                        'order_index', m.order_index,
                        'lessons',
                            (
                                SELECT json_agg(
                                    json_build_object(
                                        'title', lesson.title,
                                        'order_index', lesson.order_index,
                                        'content_type', lesson.content_type,
                                        'content_source', lesson.content_source
                                    )
                                    ORDER BY lesson.order_index
                                )
                                FROM course.lesson lesson
                                WHERE lesson.module_id = m.id
                                AND lesson.is_deleted = false
                            )
                    )
                    ORDER BY m.order_index
                )
                FROM course.module m
                WHERE m.course_id = c.id
                AND m.is_deleted = false
            ) AS modules
        FROM catalog.course c
        JOIN catalog.language lang
            ON lang.id = c.language_id
        JOIN catalog.category cat
            ON cat.id = c.category_id
        LEFT JOIN learning.favorite f
            ON f.course_id = c.id
            AND f.user_id = (SELECT id FROM identity.users WHERE public_id = $1)
        ${userId ? `LEFT JOIN learning.register r ON r.course_id = c.id AND r.user_id = (SELECT id FROM identity.users WHERE public_id = $1) AND r.is_deleted = false` : ''}
        ${whereSQL}
        LIMIT 1;
    `

        return await sql(query, params)
    },

    getCourseList: async (data) => {
        const { userId, search, lastId, prices, levels, ratings } = data;

        const conditions = [];
        const params = [];

        params.push(userId);

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

        if (levels.length > 0) {
            params.push(levels);
            conditions.push(`c.level = ANY($${params.length}::level_enum[])`);
        }

        if (ratings.length > 0) {
            const ratingArray = ratings.map(r => parseInt(r.trim(), 10)).filter(Number.isInteger);
            params.push(ratingArray);
            conditions.push(`c.rating = ANY($${params.length}::integer[])`);
        }

        if (lastId) {
            params.push(lastId);
            conditions.push(`c.id < (select id from catalog.course where public_id = $${params.length})`);
        }

        conditions.push(`c.is_hidden = false`);
        conditions.push(`c.is_deleted = false`);

        const whereSQL = conditions.length
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        const query = `
            SELECT 
                c.public_id as id,
                c.title,
                c.image,
                c.rating,
                c.modules,
                c.lessons,
                c.cost,
                c.level,
                c.duration,
                c.instructor,
                c.point_price,
                c.duration,
                l.name as language_name,
                l.logo as language_logo,
                l.color as language_color,
                cat.name as category_name,
                COALESCE(r.status, null) as is_registered
            FROM catalog.course c
            JOIN catalog.language l ON c.language_id = l.id
            JOIN catalog.category cat ON c.category_id = cat.id
            LEFT JOIN learning.register r ON r.course_id = c.id 
                AND r.user_id = (SELECT id FROM identity.users WHERE public_id = $1)
                AND r.is_deleted = false
            ${whereSQL}
            ${!search ? 'AND c.id not in (select course_id from learning.register where user_id = (select id from identity.users where public_id = $1) and is_deleted = false)' : ''}
            ORDER BY c.id DESC
            LIMIT 21;
        `;

        return await sql(query, params);
    },

    postRegister: async (data) => {
        const { userId, courseId } = data;

        const params = [];

        params.push(userId, courseId);

        const query = `
            SELECT * FROM register_course($${params.length - 1}, $${params.length})
        `;

        return await sql(query, params);
    },

    postWithdraw: async (data) => {
        const { userId, courseId } = data;

        const conditions = [];
        const params = [];

        params.push(userId);
        conditions.push(`user_id = (select id from identity.users where public_id = $${params.length})`);

        params.push(courseId);
        conditions.push(`course_id = (select id from catalog.course where public_id = $${params.length})`);

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `      
            UPDATE learning.register 
            SET is_deleted = true,
                deleted_at = now()
            ${whereSQL};
        `;

        return await sql(query, params);
    },

    getLearning: async (data) => {
        const { userId, lessonId } = data;

        const params = [];

        params.push(userId, lessonId);

        const query = `select * from learning_lesson($${params.length - 1}, $${params.length});`;

        return await sql(query, params);
    },

    getLessonStatus: async (data) => {
        const { userId, courseId, lessonId } = data;

        const query = `
            SELECT h.status
            FROM learning.history h
            WHERE h.user_id = (SELECT id FROM identity.users WHERE public_id = $1)
              AND h.course_id = (SELECT id FROM catalog.course WHERE public_id = $2)
              AND h.lesson_id = $3::bigint
            LIMIT 1;
        `;

        return await sql(query, [userId, courseId, lessonId]);
    },

    postSubmitLesson: async (data) => {
        const { userId, courseId, lessonId } = data;

        const params = [];

        params.push(userId, courseId, lessonId);

        const query = `select * from submit_lesson($${params.length - 2}, $${params.length - 1}, $${params.length}::bigint);`;

        return await sql(query, params);
    },

    postFavorite: async (data) => {
        const { userId, courseId } = data;

        const params = [];
        params.push(userId, courseId);

        const query = `
            INSERT INTO learning.favorite (user_id, course_id)
            SELECT
                u.id,
                c.id
            FROM identity.users u
            CROSS JOIN catalog.course c
            WHERE u.public_id = $1
            AND c.public_id = $2
            ON CONFLICT (user_id, course_id) DO NOTHING
            RETURNING *;
        `;

        return await sql(query, params);
    },

    getComments: async (data) => {
        const { userId, courseId, lastCreated } = data;

        const conditions = [];
        const params = [];

        if (userId) {
            params.push(userId);
        }

        params.push(courseId);
        conditions.push(`m.reference_id = (select id from catalog.course where public_id = $${params.length})`);

        if (lastCreated) {
            params.push(lastCreated);
            conditions.push(`m.created_at < $${params.length}`);
        }

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                u.public_id as user_id,
                u.username as username,
                i.image as avatar,
                m.public_id as id,
                m.content as comment,
                m.upvotes as upvotes,
                m.downvotes as downvotes,
                ${userId ? `coalesce(v.voting, null) as vote,` : 'null as vote,'}
                m.created_at as created_at
            FROM community.comment m
            JOIN profile.info i ON m.user_id = i.user_id
            JOIN identity.users u on m.user_id = u.id
            ${userId ?
                `LEFT JOIN community.voting v on v.reference_id = m.id
                    AND v.user_id = (select id from identity.users where public_id = $1)`
                :
                ''
            }
            ${whereSQL}
            ORDER BY m.created_at DESC
            LIMIT 21
        `

        return await sql(query, params);
    },

    postComment: async (data) => {
        const { userId, courseId, content } = data;

        const params = [];

        params.push(userId, courseId, content);

        const query = `
            WITH inserted AS (
                INSERT INTO community.comment (user_id, reference_id, content)
                VALUES (
                    (SELECT id FROM identity.users WHERE public_id = $1),
                    (SELECT id FROM catalog.course WHERE public_id = $2),
                    $3
                )
                RETURNING *
            )
            SELECT 
                u.public_id as user_id,
                u.username as username,
                i.image as avatar,
                m.public_id as id,
                m.content as comment,
                m.upvotes as upvotes,
                m.downvotes as downvotes,
                m.created_at as created_at
            FROM inserted m
            JOIN identity.users u ON m.user_id = u.id
            LEFT JOIN profile.info i ON m.user_id = i.user_id;
        `;

        return await sql(query, params);
    },

    postVotingComment: async (data) => {
        const { userId, commentId, vote } = data;

        const params = [];

        params.push(userId, commentId, vote);

        const query = `select * from voting_comment($${params.length - 2}, $${params.length - 1}, $${params.length});`;

        return await sql(query, params);
    },

    deleteFavorite: async (data) => {
        const { userId, courseId } = data;

        const params = [];

        params.push(userId, courseId);

        const query = `
            DELETE FROM learning.favorite
            WHERE user_id = (SELECT id FROM identity.users WHERE public_id = $1)
            AND course_id = (SELECT id FROM catalog.course WHERE public_id = $2)
            RETURNING *;
        `;

        return await sql(query, params);
    },
}