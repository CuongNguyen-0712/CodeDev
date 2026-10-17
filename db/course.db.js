import { sql } from "@/lib/db";
import { escapeLike } from "@/lib/listFilters";

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

    /**
     * Catalog page. Every filter arrives validated by lib/listFilters (enum values, integer ids),
     * so the casts below never see user-controlled strings. Keyset pagination on c.id.
     */
    getCourseList: async (data) => {
        const {
            userId = null,
            search = "",
            levels = [],
            price = null,
            minRating = null,
            languageIds = [],
            categoryIds = [],
            lastId = null,
            limit = 20,
            hideEnrolled = false,
        } = data;

        const params = [userId];
        const conditions = [`c.is_hidden = false`, `c.is_deleted = false`];

        if (search) {
            params.push(`%${escapeLike(search)}%`);
            conditions.push(`(c.title ILIKE $${params.length} ESCAPE '\\' OR c.instructor ILIKE $${params.length} ESCAPE '\\')`);
        }

        if (levels.length > 0) {
            params.push(levels);
            conditions.push(`c.level = ANY($${params.length}::level_enum[])`);
        }

        if (price === "free") conditions.push(`c.cost = 0`);
        if (price === "paid") conditions.push(`c.cost > 0`);

        if (minRating) {
            params.push(minRating);
            conditions.push(`c.rating >= $${params.length}::int`);
        }

        if (languageIds.length > 0) {
            params.push(languageIds);
            conditions.push(`c.language_id = ANY($${params.length}::int[])`);
        }

        if (categoryIds.length > 0) {
            params.push(categoryIds);
            conditions.push(`c.category_id = ANY($${params.length}::int[])`);
        }

        if (lastId) {
            params.push(lastId);
            conditions.push(`c.id < (SELECT id FROM catalog.course WHERE public_id = $${params.length})`);
        }

        if (hideEnrolled && userId) {
            conditions.push(`NOT EXISTS (
                SELECT 1 FROM learning.register er
                WHERE er.course_id = c.id AND er.user_id = (SELECT id FROM me) AND er.is_deleted = false
            )`);
        }

        params.push(Number(limit) + 1);
        const limitParam = `$${params.length}`;

        const query = `
            WITH me AS (SELECT id FROM identity.users WHERE public_id = $1)
            SELECT
                c.public_id AS id,
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
                l.id AS language_id,
                l.name AS language_name,
                l.logo AS language_logo,
                l.color AS language_color,
                cat.id AS category_id,
                cat.name AS category_name,
                r.status AS is_registered
            FROM catalog.course c
            JOIN catalog.language l ON c.language_id = l.id
            JOIN catalog.category cat ON c.category_id = cat.id
            LEFT JOIN learning.register r ON r.course_id = c.id
                AND r.user_id = (SELECT id FROM me)
                AND r.is_deleted = false
            WHERE ${conditions.join(" AND ")}
            ORDER BY c.id DESC
            LIMIT ${limitParam};
        `;

        return await sql(query, params);
    },

    /** Languages and categories that have at least one visible course (filter options). */
    getCourseFilterOptions: async () => {
        const query = `
            SELECT 'language' AS kind, l.id, l.name, COUNT(*)::int AS courses
            FROM catalog.course c
            JOIN catalog.language l ON l.id = c.language_id
            WHERE c.is_hidden = false AND c.is_deleted = false
            GROUP BY l.id, l.name
            UNION ALL
            SELECT 'category' AS kind, cat.id, cat.name, COUNT(*)::int AS courses
            FROM catalog.course c
            JOIN catalog.category cat ON cat.id = c.category_id
            WHERE c.is_hidden = false AND c.is_deleted = false
            GROUP BY cat.id, cat.name
            ORDER BY kind, courses DESC, name;
        `;

        return await sql(query);
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

    // Records that the learner opened a lesson (resume point) and touched the course.
    // Locked lessons are ignored.
    touchLesson: async ({ userId, courseId, lessonId }) => {
        const query = `
            WITH u AS (SELECT id FROM identity.users WHERE public_id = $1),
                 c AS (SELECT id FROM catalog.course WHERE public_id = $2),
                 lesson AS (
                     UPDATE learning.history h
                     SET last_seen = now()
                     WHERE h.user_id = (SELECT id FROM u)
                       AND h.course_id = (SELECT id FROM c)
                       AND h.lesson_id = $3::bigint
                       AND h.status <> 'enrolled'
                     RETURNING h.lesson_id
                 ),
                 course AS (
                     UPDATE learning.register r
                     SET last_seen = now()
                     WHERE r.user_id = (SELECT id FROM u)
                       AND r.course_id = (SELECT id FROM c)
                       AND r.is_deleted = false
                       AND EXISTS (SELECT 1 FROM lesson)
                     RETURNING r.course_id
                 )
            SELECT (SELECT COUNT(*) FROM lesson)::int AS lessons, (SELECT COUNT(*) FROM course)::int AS courses;
        `;

        return await sql(query, [userId, courseId, lessonId]);
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