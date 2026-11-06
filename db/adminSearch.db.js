import { sql } from "@/lib/db";
import { escapeLike } from "@/db/adminAudit.db";

/**
 * Ctrl / Cmd + K search (services/adminSearch.service.js), at most `limit` rows per group.
 * `q` is already trimmed and cut to 100 characters; LIKE wildcards in it are escaped here.
 */
const contains = (q) => `%${escapeLike(q)}%`;

export const adminSearchDb = {
    // Matching a masked email would reveal it one character at a time: emails only with user.pii.
    users: async ({ q, matchEmail, limit = 5 }) => (await sql(
        `SELECT u.public_id AS id, u.username, u.email
         FROM identity.users u
         WHERE u.public_id = $1 OR u.username ILIKE $2 ESCAPE '\\'${matchEmail ? " OR u.email ILIKE $2 ESCAPE '\\'" : ""}
         ORDER BY (u.public_id = $1) DESC, (lower(u.username) = lower($1)) DESC, u.id DESC
         LIMIT $3`,
        [q, contains(q), limit]
    )).rows,

    courses: async ({ q, limit = 5 }) => (await sql(
        `SELECT c.public_id AS id, c.title, c.publish_status
         FROM catalog.course c
         WHERE c.is_deleted IS NOT TRUE AND (c.title ILIKE $1 ESCAPE '\\' OR c.public_id ILIKE $1 ESCAPE '\\')
         ORDER BY (c.public_id = $2) DESC, c.title
         LIMIT $3`,
        [contains(q), q, limit]
    )).rows,

    challenges: async ({ q, limit = 5 }) => (await sql(
        `SELECT ch.public_id AS id, ch.title, c.public_id AS course_id, c.title AS course_title
         FROM challenge.challenges ch
         JOIN catalog.course c ON c.id = ch.course_id
         WHERE ch.is_deleted IS NOT TRUE AND (ch.public_id = $2 OR ch.title ILIKE $1 ESCAPE '\\')
         ORDER BY (ch.public_id = $2) DESC, ch.title
         LIMIT $3`,
        [contains(q), q, limit]
    )).rows,

    orders: async ({ q, limit = 5 }) => (await sql(
        `SELECT o.public_id AS id, o.status::text AS status, o.created_at, u.username
         FROM commerce.orders o
         JOIN identity.users u ON u.id = o.user_id
         WHERE o.public_id = $1 OR u.username ILIKE $2 ESCAPE '\\'
         ORDER BY (o.public_id = $1) DESC, o.id DESC
         LIMIT $3`,
        [q, contains(q), limit]
    )).rows,

    // Exact id, or (8+ characters) an id ending in q, as copied from a log line or a support ticket.
    // shortcut: a suffix match scans code_runs newest first; add an index on reverse(public_id) once that table is large.
    runs: async ({ q, limit = 5 }) => (await sql(
        `SELECT cr.public_id AS id, cr.status, cr.queued_at, u.username, ch.title AS challenge_title
         FROM challenge.code_runs cr
         JOIN identity.users u ON u.id = cr.user_id
         JOIN challenge.challenges ch ON ch.id = cr.challenge_id
         WHERE cr.public_id = $1${q.length >= 8 ? " OR cr.public_id LIKE $2 ESCAPE '\\'" : ""}
         ORDER BY (cr.public_id = $1) DESC, cr.id DESC
         LIMIT $${q.length >= 8 ? 3 : 2}`,
        q.length >= 8 ? [q, `%${escapeLike(q)}`, limit] : [q, limit]
    )).rows,
};
