import { sql, dbPool } from "@/app/lib/db";

import { hashRefreshToken, compareTokenHash, generateRefreshToken } from "@/app/utils/auth.util";
import { generateSonyflake } from "@/app/lib/sonyflake";

import { TOKEN } from "@/app/constants/auth";

const REFRESH_TOKEN_GRACE_MS = 10_000; // 10 seconds

export const userDb = {
    signUp: async (data) => {
        const { id, public_id, username, email, surname, name, password } = data;

        const params = [];

        params.push(id, public_id, username, email, surname, name, password);

        const query = `select public_id from sign_up($1, $2, $3, $4, $5, $6, $7);`;

        return await sql(query, params);
    },

    login: async (data) => {
        const { username } = data;

        const params = [];

        params.push(username);

        const query = `select * from log_in($1);`;

        return await sql(query, params);
    },

    logout: async (data) => {
        const { userId, sessionId } = data;

        const params = [];

        params.push(userId, sessionId);

        const query = `
            UPDATE private.sessions
            SET 
                is_revoked = TRUE,
                revoked_at = now()
            WHERE user_id = (SELECT id FROM private.users WHERE public_id = $${params.length - 1})
            AND id = $${params.length}
            RETURNING id;
        `;

        return await sql(query, params);
    },

    signUpWithProvider: async (data) => {
        const { id, public_id, username, email, image, accountProvider, providerAccountId } = data;

        const params = [];

        params.push(id, public_id, username, email, image, accountProvider, providerAccountId);

        const query = `SELECT * FROM auth_with_provider($1, $2, $3, $4, $5, $6, $7)`

        return await sql(query, params);
    },

    createSession: async (data) => {
        const { sessionId, tokenId, userId, refreshTokenHash, expiresAt } = data;

        const params = [];

        params.push(sessionId, tokenId, userId, refreshTokenHash, expiresAt);

        const query = `select * from create_session($1, $2, $3, $4, $5);`;

        return await sql(query, params);
    },

    refreshSession: async (data) => {
        const { sessionId, tokenId, userId, refreshToken } = data;

        const client = await dbPool.connect();

        try {
            await client.query("BEGIN");

            const result = await client.query(
                `
                SELECT
                    s.id AS session_id,
                    s.expires_at,
                    s.is_revoked,

                    r.id AS token_id,
                    r.refresh_token_hash,
                    r.rotated_to_token_id,
                    r.rotated_at

                FROM private.sessions s

                INNER JOIN private.refresh_tokens r
                    ON r.session_id = s.id

                INNER JOIN private.users u
                    ON u.id = s.user_id

                WHERE s.id = $1
                  AND u.public_id = $2
                  AND r.id = $3

                FOR UPDATE OF s, r
            `,
                [
                    sessionId,
                    userId,
                    tokenId,
                ]
            );

            if (result.rowCount === 0) {
                await client.query("ROLLBACK");

                return {
                    status: TOKEN.INVALID,
                };
            }

            const session = result.rows[0];

            if (session.is_revoked) {
                await client.query("ROLLBACK");

                return {
                    status: TOKEN.REVOKED,
                };
            }

            const expiresAt = new Date(session.expires_at).getTime();

            if (
                Number.isNaN(expiresAt) ||
                expiresAt <= Date.now()
            ) {
                await client.query("ROLLBACK");

                return {
                    status: TOKEN.EXPIRED,
                };
            }

            const refreshTokenHash = hashRefreshToken(refreshToken);

            const validToken = compareTokenHash(
                refreshTokenHash,
                session.refresh_token_hash
            );

            if (!validToken) {
                await client.query("ROLLBACK");

                return {
                    status: TOKEN.INVALID,
                };
            }

            if (session.rotated_to_token_id && session.rotated_at) {
                const rotatedAt = new Date(
                    session.rotated_at
                ).getTime();

                const elapsed = Date.now() - rotatedAt;

                if (elapsed >= 0 && elapsed <= REFRESH_TOKEN_GRACE_MS) {
                    await client.query("COMMIT");

                    return {
                        status: TOKEN.CONCURRENT,
                    };
                }

                await client.query("ROLLBACK");

                return {
                    status: TOKEN.REVOKED,
                };
            }

            const newTokenId = generateSonyflake();
            const newRefreshToken = generateRefreshToken();
            const newRefreshTokenHash = hashRefreshToken(newRefreshToken);

            await client.query(
                `
                UPDATE private.refresh_tokens
                SET
                    rotated_to_token_id = $1,
                    rotated_at = NOW()
                WHERE id = $2
            `,
                [
                    newTokenId,
                    session.token_id,
                ]
            );

            const insertResult = await client.query(
                `
                INSERT INTO private.refresh_tokens (
                    id,
                    session_id,
                    refresh_token_hash,
                    created_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    NOW()
                )
                RETURNING
                    id,
                    session_id
            `,
                [
                    newTokenId,
                    session.session_id,
                    newRefreshTokenHash,
                ]
            );

            if (insertResult.rowCount === 0) {
                await client.query("ROLLBACK");

                return {
                    status: TOKEN.FAILED,
                };
            }

            await client.query(
                `
                UPDATE private.sessions
                SET
                    updated_at = NOW()
                WHERE id = $1
            `,
                [session.session_id]
            );

            await client.query("COMMIT");

            const newToken = insertResult.rows[0];

            return {
                sessionId: newToken.session_id,
                tokenId: newToken.id,
                refreshToken: newRefreshToken,
                status: TOKEN.REFRESH,
            };
        } catch (error) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Refresh token rollback failed:",
                    rollbackError
                );
            }

            console.error(
                "Refresh session failed:",
                error
            );

            return {
                status: TOKEN.FAILED,
            };
        } finally {
            client.release();
        }
    },

    getPermissions: async (data) => {
        const { userId } = data;

        const params = [];

        params.push(userId);

        const query =
            `SELECT 
                distinct (p.resource || '.' || p.action) as permissions
            FROM private.permissions p
            JOIN private.role_permissions rp ON rp.permission_id = p.id 
            JOIN private.roles r ON rp.role_id = r.id
            JOIN private.user_roles ur ON r.id = ur.role_id
            JOIN private.users u ON u.id = ur.user_id
            WHERE u.public_id = $1`

        return await sql(query, params);
    },

    refreshToken: async (data) => {
        const { session_id, refresh_token } = data;
        const params = [];

        params.push(session_id, refresh_token);

        const query = `select * from refresh_token($1, $2);`;

        return await sql(query, params);
    },

    getMe: async (userId) => {
        const params = []
        const conditions = []

        params.push(userId)
        conditions.push(`i.user_id = (select id from private.users where public_id = $${params.length})`)

        const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            select 
                u.public_id as id,
                i.surname as surname,   
                i.name as name, 
                i.image as image, 
                i.bio as bio, 
                i.nickname as nickname, 
                i.rank as rank, 
                i.star as star, 
                i.level as level, 
                i.phone as phone,
                i.points as points,
                u.username as username, 
                u.email as email,
                u.email_verified as email_verified 
            from private.users u
            join private.info i on u.id = i.user_id
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
                    last_seen,
                    language_name,
                    language_logo,
                    language_color,
                    category_name
                FROM user_progress
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
                            'progress', progress
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
        conditions.push(`r.user_id = (select id from private.users where public_id = $${params.length})`)

        if (search) {
            params.push(`%${search}%`);
            conditions.push(`c.title ilike $${params.length}`);
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
                        AND c.public_id < ${idParam}
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
            from course.register r
            join public.course c on r.course_id = c.id
            left join course.favorite f on f.course_id = c.id and f.user_id = r.user_id
            join public.language l on c.language_id = l.id
            join public.category cat on c.category_id = cat.id
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
    }
}