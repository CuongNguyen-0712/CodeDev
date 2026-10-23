import { sql } from "@/lib/db";
import { withTransaction } from "@/lib/dbTransaction";
import { escapeLike } from "@/lib/listFilters";

// Sessions and refresh tokens live in db/session.db.js.

export const userDb = {
    signUp: async (data) => {
        const { id, public_id, username, email, surname, name, password } = data;

        const params = [];

        params.push(id, public_id, username, email, surname, name, password);

        const query = `select * from sign_up($1, $2, $3, $4, $5, $6, $7);`;

        return await sql(query, params);
    },

    login: async (data) => {
        const { username } = data;

        const params = [];

        params.push(username);

        const query = `select * from log_in($1);`;

        return await sql(query, params);
    },

    // Returns the decision in `result` ('login' | 'created' | 'linked' | 'link_required' | 'blocked').
    signInWithProvider: async (data) => {
        const { id, public_id, username, email, image, accountProvider, providerAccountId, surname, name } = data;

        const params = [];

        params.push(id, public_id, username, email, image, accountProvider, providerAccountId, surname, name);

        const query = `SELECT * FROM sign_in_with_provider($1, $2, $3, $4, $5, $6, $7, $8, $9)`

        return await sql(query, params);
    },

    isEmailVerified: async ({ userId }) => {
        const res = await sql(`SELECT email_verified FROM identity.users WHERE public_id = $1;`, [userId]);
        return res.rows[0]?.email_verified === true;
    },

    // Throws SQLSTATE CD409 when the provider account belongs to another user.
    linkProviderAccount: async ({ userId, provider, providerAccountId, providerEmail }) => {
        return await sql(
            `SELECT link_provider_account($1, $2, $3, $4)`,
            [userId, provider, providerAccountId, providerEmail]
        );
    },

    /** Sign-in methods for Settings: password (only when a hash exists) and linked providers. */
    listSignInMethods: async ({ userId }) => {
        const res = await sql(
            `SELECT a.provider::text AS provider, a.provider_email, a.created_at, a.password_hash IS NOT NULL AS has_password
             FROM identity.accounts a
             JOIN identity.users u ON u.id = a.user_id
             WHERE u.public_id = $1
             ORDER BY a.created_at;`,
            [userId]
        );
        return res.rows;
    },

    /**
     * Removes a linked GitHub / Google account unless it is the last way to sign in (the user row
     * is locked so two concurrent removals cannot both pass the check).
     * @returns {Promise<"removed" | "not_linked" | "last_method">}
     */
    unlinkProvider: async ({ userId, provider }) => {
        return withTransaction(async (client) => {
            const userRes = await client.query(`SELECT id FROM identity.users WHERE public_id = $1 FOR UPDATE;`, [userId]);
            const id = userRes.rows[0]?.id;
            if (!id) return "not_linked";

            const res = await client.query(
                `SELECT provider::text AS provider, password_hash IS NOT NULL AS has_password
                 FROM identity.accounts WHERE user_id = $1;`,
                [id]
            );
            if (!res.rows.some((a) => a.provider === provider)) return "not_linked";
            const others = res.rows.filter((a) => a.provider !== provider && (a.provider !== "credentials" || a.has_password));
            if (others.length === 0) return "last_method";

            await client.query(`DELETE FROM identity.accounts WHERE user_id = $1 AND provider = $2::provider_enum;`, [id, provider]);
            return "removed";
        });
    },

    /** Address and first name for account notices; null for a missing or inactive user. */
    getMailRecipient: async ({ userId }) => {
        const res = await sql(
            `SELECT u.email, i.name
             FROM identity.users u
             LEFT JOIN profile.info i ON i.user_id = u.id
             WHERE u.public_id = $1 AND u.status = 'active';`,
            [userId]
        );
        return res.rows[0] || null;
    },

    getPermissions: async (data) => {
        const { userId } = data;

        const params = [];

        params.push(userId);

        const query =
            `SELECT 
                distinct (p.resource || '.' || p.action) as permissions
            FROM identity.permissions p
            JOIN identity.role_permissions rp ON rp.permission_id = p.id 
            JOIN identity.roles r ON rp.role_id = r.id
            JOIN identity.user_roles ur ON r.id = ur.role_id
            JOIN identity.users u ON u.id = ur.user_id
            WHERE u.public_id = $1 OR u.id::text = $1`

        return await sql(query, params);
    },

    getMe: async (userId) => {
        const params = []
        const conditions = []

        params.push(userId)
        conditions.push(`i.user_id = (select id from identity.users where public_id = $${params.length})`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            select 
                u.public_id as id,
                i.surname as surname,   
                i.name as name, 
                i.image as image, 
                i.bio as bio, 
                i.nickname as nickname,
                i.phone as phone,
                i.points as points,
                i.exp as exp,
                i.exp_level as level,
                lvl.title as "levelTitle",
                lvl.min_exp as "levelMinExp",
                nxt.min_exp as "nextLevelMinExp",
                u.username as username,
                u.email as email,
                u.email_verified as email_verified
            from identity.users u
            join profile.info i on u.id = i.user_id
            left join profile.exp_level lvl on lvl.level = i.exp_level
            left join profile.exp_level nxt on nxt.level = i.exp_level + 1 and nxt.is_active
            ${whereSQL}
            limit 1
        `;

        return await sql(query, params);
    },

    getOverview: async (userId) => {
        const params = []

        params.push(userId)

        const query = `
            WITH base AS (
                SELECT
                    id,
                    title,
                    status,
                    progress,
                    lessons as total,
                    last_seen,
                    language_name,
                    language_logo,
                    language_color,
                    category_name
                FROM learning.user_progress
                WHERE user_id = $${params.length}
                AND c_deleted = false
                AND r_deleted = false
            ),

            ranked AS (
                SELECT
                    *,
                    ROW_NUMBER() OVER (
                        PARTITION BY status
                        ORDER BY last_seen DESC NULLS LAST
                    ) AS rn
                FROM base
            ),

            summary AS (
                SELECT
                    s.status,
                    COUNT(b.id) AS total
                FROM unnest(
                    enum_range(NULL::status_course_enum)
                ) AS s(status)
                LEFT JOIN base b
                    ON b.status = s.status
                GROUP BY s.status
            ),

            languages AS (
                SELECT
                    language_name AS name,
                    language_color AS color,
                    language_logo AS logo,
                    COUNT(*) AS total,
                    ROUND(
                        COUNT(*) * 100.0
                        / SUM(COUNT(*)) OVER (),
                        2
                    ) AS percentage
                FROM base
                WHERE status IN ('in_progress', 'completed')
                GROUP BY language_name, language_color, language_logo
                ORDER BY total DESC
            ),

            courses AS (
                SELECT
                    status,
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'id', id,
                            'title', title,
                            'language_name', language_name,
                            'language_logo', language_logo,
                            'language_color', language_color,
                            'category_name', category_name,
                            'progress', progress,
                            'total', total
                        )
                        ORDER BY rn
                    ) FILTER (WHERE rn <= 10) AS courses
                FROM ranked
                GROUP BY status
            )

            SELECT JSONB_BUILD_OBJECT(

                'summary',
                JSONB_BUILD_OBJECT(
                    'total',
                    (
                        SELECT COUNT(*)
                        FROM base
                    ),

                    'by_status',
                    (
                        SELECT JSONB_OBJECT_AGG(
                            status,
                            total
                            ORDER BY status
                        )
                        FROM summary
                    )
                ),

                'languages',
                COALESCE(
                    (
                        SELECT JSONB_AGG(
                            JSONB_BUILD_OBJECT(
                                'name', name,
                                'total', total,
                                'color', color,
                                'logo', logo,
                                'percentage', percentage
                            )
                            ORDER BY total DESC
                        )
                        FROM languages
                    ),
                    '[]'::jsonb
                ),

                'courses',
                COALESCE(
                    (
                        SELECT JSONB_OBJECT_AGG(
                            status,
                            courses
                        )
                        FROM courses
                    ),
                    '{}'::jsonb
                )

            ) AS data;
        `
        return await sql(query, params);
    },

    getCourseProgress: async (data) => {
        const { userId, search, levels, statuses, nextCursor } = data;
        const params = []
        const conditions = []

        params.push(userId)
        conditions.push(`r.user_id = (select id from identity.users where public_id = $${params.length})`)

        if (search) {
            params.push(`%${escapeLike(search)}%`);
            conditions.push(`c.title ilike $${params.length} escape '\\'`);
        }

        if (levels.length > 0) {
            params.push(levels);
            conditions.push(`c.level = any($${params.length}::level_enum[])`);
        }

        if (statuses.length > 0) {
            params.push(statuses);
            conditions.push(`r.status = any($${params.length}::status_course_enum[])`);
        }

        if (nextCursor) {
            const { sortTime, id } = nextCursor;

            params.push(sortTime);
            const sortTimeParam = `$${params.length}`;

            params.push(id);
            const idParam = `$${params.length}`;

            conditions.push(`
                (
                    COALESCE(r.last_seen, r.created_at) < ${sortTimeParam}

                    OR (
                        COALESCE(r.last_seen, r.created_at) = ${sortTimeParam}
                        AND r.course_id < ${idParam}
                    )
                )
            `);
        }

        conditions.push(`c.is_deleted = false`);
        conditions.push(`r.is_deleted = false`);

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            select 
                c.public_id as id,
                c.title,
                c.lessons,
                c.level,
                c.concept,
                l.name as language_name,
                l.logo as language_logo,
                l.color as language_color,
                cat.name as category_name,
                r.progress,
                r.status,
                r.course_id,
                COALESCE(r.last_seen, r.created_at) as sort_time,
                COALESCE(f.id, null) as is_favorite
            from learning.register r
            join catalog.course c on r.course_id = c.id
            left join learning.favorite f on f.course_id = c.id and f.user_id = r.user_id
            join catalog.language l on c.language_id = l.id
            join catalog.category cat on c.category_id = cat.id
            ${whereSQL}
            ORDER BY
                sort_time DESC,
                r.course_id DESC
            limit 21
        `;

        return await sql(query, params);
    },

    getLearningProgress: async (data) => {
        const { userId, courseId } = data;

        const params = []

        params.push(userId, courseId)
        const query = `select * from learning_progress($${params.length - 1}, $${params.length});`;

        return await sql(query, params);
    },

    updateProfile: async ({ userId, nickname = null, surname = null, phone = null, name = null, email = null, image = null, bio = null }) => {
        const params = [];
        const conditions = [];

        params.push(userId);
        conditions.push(`user_id = (select id from identity.users where public_id = $${params.length})`);

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const setQuery = [];

        if (surname !== null) {
            params.push(surname);
            setQuery.push(`surname = case when $${params.length} is distinct from surname then $${params.length} else surname end`);
        }

        if (phone !== null) {
            params.push(phone);
            setQuery.push(`phone = case when $${params.length} is distinct from phone then $${params.length} else phone end`);
        }

        if (nickname !== null) {
            params.push(nickname);
            setQuery.push(`nickname = case when $${params.length} is distinct from nickname then $${params.length} else nickname end`);
        }

        if (name !== null) {
            params.push(name);
            setQuery.push(`name = case when $${params.length} is distinct from name then $${params.length} else name end`);
        }

        // email lives in identity.users, not profile.info: update it in a data-modifying CTE.
        let emailCTE = '';
        if (email !== null) {
            params.push(email);
            emailCTE = `
            WITH updated_user AS (
                UPDATE identity.users
                SET email = $${params.length}, email_verified = false, updated_at = now()
                WHERE public_id = $1 AND email IS DISTINCT FROM $${params.length}
                RETURNING id
            )`;
        }

        if (image !== null) {
            params.push(image);
            setQuery.push(`image = case when $${params.length} is distinct from image then $${params.length} else image end`);
        }

        if (bio !== null) {
            params.push(bio);
            setQuery.push(`bio = case when $${params.length} is distinct from bio then $${params.length} else bio end`);
        }

        setQuery.push(`updated_at = now()`);

        const query = `${emailCTE}
            UPDATE profile.info
            SET ${setQuery.join(', ')}
            ${whereSQL}
            RETURNING id;
        `;

        return await sql(query, params);
    },

    getFriends: async ({ userId, search }) => {
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
                i.exp_level AS level,
                lvl.title AS "levelTitle",
                f.status
            FROM identity.users u
            INNER JOIN profile.info i ON i.user_id = u.id AND i.user_id != (select id from identity.users where public_id = $1)
            LEFT JOIN profile.exp_level lvl ON lvl.level = i.exp_level
            INNER JOIN community.friend f ON (
                (f.sender_id = (select id from identity.users where public_id = $1) AND f.receiver_id = u.id)
                OR
                (f.receiver_id = (select id from identity.users where public_id = $1) AND f.sender_id = u.id)
            )
            ${whereSQL}
        `;

        return await sql(query, params);
    }
}