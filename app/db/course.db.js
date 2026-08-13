import { sql } from "@/app/lib/db";

export const courseDb = {
    getCourseDetails: async (data) => {
        const { userId, courseId } = data;

        const conditions = []
        const params = []

        if (userId) {
            params.push(userId)
        }

        params.push(courseId)
        conditions.push(`c.id = (select id from public.course where public_id = $${params.length})`)

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
        FROM public.course c
        JOIN public.language lang
            ON lang.id = c.language_id
        JOIN public.category cat
            ON cat.id = c.category_id
        LEFT JOIN course.favorite f
            ON f.course_id = c.id
            AND f.user_id = (SELECT id FROM private.users WHERE public_id = $1)
        ${userId ? `LEFT JOIN course.register r ON r.course_id = c.id AND r.user_id = (SELECT id FROM private.users WHERE public_id = $1) AND r.is_deleted = false` : ''}
        ${whereSQL}
        LIMIT 1;
    `

        return await sql.query(query, params);
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
            conditions.push(`c.id < (select id from public.course where public_id = $${params.length})`);
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
                c.points,
                c.duration,
                l.name as language_name,
                l.logo as language_logo,
                l.color as language_color,
                cat.name as category_name,
                COALESCE(r.status, null) as is_registered
            FROM public.course c
            JOIN public.language l ON c.language_id = l.id
            JOIN public.category cat ON c.category_id = cat.id
            LEFT JOIN course.register r ON r.course_id = c.id 
                AND r.user_id = (SELECT id FROM private.users WHERE public_id = $1)
                AND r.is_deleted = false
            ${whereSQL}
            ${!search ? 'AND c.id not in (select course_id from course.register where user_id = (select id from private.users where public_id = $1) and is_deleted = false)' : ''}
            ORDER BY c.id DESC
            LIMIT 21;
        `;

        return await sql.query(query, params);
    },

    postRegister: async (data) => {
        const { userId, courseId } = data;

        const params = [];

        params.push(userId, courseId);

        const query = `
            SELECT register_course($${params.length - 1}, $${params.length})
        `;

        return await sql.query(query, params);
    },

    postWithdraw: async (data) => {
        const { userId, courseId } = data;

        const conditions = [];
        const params = [];

        params.push(userId);
        conditions.push(`user_id = (select id from private.users where public_id = $${params.length})`);

        params.push(courseId);
        conditions.push(`course_id = (select id from public.course where public_id = $${params.length})`);

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `      
            UPDATE course.register 
            SET is_deleted = true,
                deleted_at = now()
            ${whereSQL};
        `;

        return await sql.query(query, params);
    },

    getLearning: async (data) => {
        const { userId, lessonId } = data;

        const params = [];

        params.push(userId, lessonId);

        const query = `select * from learning_lesson($${params.length - 1}, $${params.length});`;

        return await sql.query(query, params);
    },

    postSubmitLesson: async (data) => {
        const { userId, courseId, lessonId } = data;

        const params = [];

        params.push(userId, courseId, lessonId);

        const query = `call submit_lesson($${params.length - 2}, $${params.length - 1}, $${params.length});`;

        return await sql.query(query, params);
    },

    postFavorite: async (data) => {
        const { userId, courseId } = data;

        const params = [];
        params.push(userId, courseId);

        const query = `
            INSERT INTO course.favorite (user_id, course_id)
            VALUES (
                (SELECT id FROM private.users WHERE public_id = $1),
                (SELECT id FROM public.course WHERE public_id = $2)
            )
            ON CONFLICT (user_id, course_id) DO NOTHING;
        `;

        return await sql.query(query, params);
    },

    getComments: async (data) => {
        const { userId, courseId, lastCreated } = data;

        const conditions = [];
        const params = [];

        if (userId) {
            params.push(userId);
        }

        params.push(courseId);
        conditions.push(`m.reference_id = (select id from public.course where public_id = $${params.length})`);

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
                ${userId ? `coalesce(v.voting, null) as vote,` : ''}
                m.created_at as created_at
            FROM public.comment m
            JOIN private.info i ON m.user_id = i.user_id
            JOIN private.users u on m.user_id = u.id
            ${userId ?
                `LEFT JOIN private.voting v on v.reference_id = m.id
                    AND v.user_id = (select id from private.users where public_id = $1)`
                :
                ''
            }
            ${whereSQL}
            ORDER BY m.created_at DESC
            LIMIT 21
        `

        return await sql.query(query, params);
    },

    postComment: async (data) => {
        const { userId, courseId, content } = data;

        const params = [];

        params.push(userId, courseId, content);

        const query = `
            INSERT INTO public.comment (user_id, reference_id, content)
            VALUES (
                (SELECT id FROM private.users WHERE public_id = $1),
                (SELECT id FROM public.course WHERE public_id = $2),
                $3
            )
        `;

        return await sql.query(query, params);
    },

    postVotingComment: async (data) => {
        const { userId, commentId, vote } = data;

        const params = [];

        params.push(userId, commentId, vote);

        const query = `select * from voting_comment($${params.length - 2}, $${params.length - 1}, $${params.length});`;

        return await sql.query(query, params);
    },

    deleteFavorite: async (data) => {
        const { userId, courseId } = data;

        const params = [];

        params.push(userId, courseId);

        const query = `
            DELETE FROM course.favorite
            WHERE user_id = (SELECT id FROM private.users WHERE public_id = $1)
            AND course_id = (SELECT id FROM public.course WHERE public_id = $2)
        `;

        return await sql.query(query, params);
    }
}