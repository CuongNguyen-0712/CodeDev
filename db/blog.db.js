import { sql } from "@/lib/db";
import { BLOG_PUBLISH_EXP_RULE } from "@/lib/blog/rewards.mjs";

const AUTHOR = `JOIN identity.users u ON u.id = p.author_id LEFT JOIN profile.info i ON i.user_id = u.id`;
const PUBLIC_COLS = `p.public_id AS id, p.slug, p.title, p.excerpt, p.tags, p.published_at, p.like_count, p.comment_count, u.public_id AS author_id, u.username AS author_username, i.image AS author_image`;

/** SQL for community.post and post_asset; ids that leave this file are public ids. */
export const blogDb = {
    isTrusted: async (authorDbId, client = null) => (await (client ? client.query.bind(client) : sql)(
        `SELECT EXISTS (SELECT 1 FROM community.post WHERE author_id = $1 AND approved_at IS NOT NULL) AS trusted`, [authorDbId]
    )).rows[0].trusted,

    userByPublicId: async (client, publicId) => (await client.query(
        `SELECT id::text AS id FROM identity.users WHERE public_id = $1`, [publicId]
    )).rows[0] || null,

    lockOwn: async (client, { authorDbId, publicId }) => (await client.query(
        `SELECT id::text AS id, public_id, slug, status, appealed_at, published_at, deleted_at
         FROM community.post WHERE public_id = $1 AND author_id = $2 FOR UPDATE`, [publicId, authorDbId]
    )).rows[0] || null,

    insert: async (client, { publicId, authorDbId, slug, title, excerpt, body, tags, status }) => (await client.query(
        `INSERT INTO community.post (public_id, author_id, slug, title, excerpt, body_md, tags, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text, CASE WHEN $8::text = 'published' THEN now() END)
         RETURNING id::text AS id`,
        [publicId, authorDbId, slug, title, excerpt, body, tags, status]
    )).rows[0],

    update: async (client, { id, title, excerpt, body, tags, status, appeal, appealReason }) => client.query(
        `UPDATE community.post SET title = $2, excerpt = $3, body_md = $4, tags = $5, status = $6::text,
                published_at = CASE WHEN $6::text = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
                appealed_at = CASE WHEN $7::boolean THEN now() ELSE appealed_at END,
                appeal_reason = CASE WHEN $7::boolean THEN $8 ELSE appeal_reason END,
                updated_at = now()
         WHERE id = $1`,
        [id, title, excerpt, body, tags, status, appeal, appealReason]
    ),

    /** Links the author's own live blog assets whose delivery URL the post uses (replacing earlier links); returns the matched URLs. */
    replaceAssets: async (client, { postDbId, authorDbId, urls }) => {
        await client.query(`DELETE FROM community.post_asset WHERE post_id = $1`, [postDbId]);
        if (!urls.length) return [];
        const { rows } = await client.query(
            `WITH matched AS (
                 SELECT a.id, a.external_url FROM storage.assets a
                 WHERE a.owner_id = $2 AND a.purpose = 'blog' AND a.deleted_at IS NULL AND a.external_url = ANY($3)
             ), linked AS (
                 INSERT INTO community.post_asset (post_id, asset_id) SELECT $1, id FROM matched
             )
             SELECT DISTINCT external_url FROM matched`,
            [postDbId, authorDbId, urls]
        );
        return rows.map((row) => row.external_url);
    },

    softDelete: async (client, { id }) => client.query(`UPDATE community.post SET deleted_at = now(), updated_at = now() WHERE id = $1`, [id]),

    listMine: async (authorDbId) => (await sql(
        `SELECT public_id AS id, slug, title, status, reject_reason, hidden_reason, hidden_at, appealed_at, updated_at, like_count, comment_count
         FROM community.post WHERE author_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC`, [authorDbId]
    )).rows,

    getOwn: async (authorDbId, publicId) => (await sql(
        `SELECT public_id AS id, slug, title, tags, body_md AS body, status, reject_reason, hidden_reason, appealed_at
         FROM community.post WHERE public_id = $1 AND author_id = $2 AND deleted_at IS NULL`, [publicId, authorDbId]
    )).rows[0] || null,

    userDbId: async (publicId) => (await sql(`SELECT id::text AS id FROM identity.users WHERE public_id = $1`, [publicId])).rows[0]?.id ?? null,

    listPublished: async ({ tag, cursor, limit }) => (await sql(
        `SELECT ${PUBLIC_COLS}, p.body_md AS body, p.published_at::text AS cursor_at, p.public_id AS cursor_id
         FROM community.post p ${AUTHOR}
         WHERE p.status = 'published' AND p.deleted_at IS NULL
           AND ($1::text IS NULL OR p.tags @> ARRAY[$1]::text[])
           AND ($2::timestamptz IS NULL OR (p.published_at <= $2::timestamptz AND (p.published_at, p.public_id) < ($2::timestamptz, $3::text)))
         ORDER BY p.published_at DESC, p.public_id DESC LIMIT $4`,
        [tag, cursor?.createdAt ?? null, cursor?.id ?? null, limit]
    )).rows,

    /** Tags of live published posts, most used first; the name breaks a tie so the order is stable. */
    topTags: async ({ limit }) => (await sql(
        `SELECT t.tag, count(*)::int AS posts
         FROM community.post p CROSS JOIN LATERAL unnest(p.tags) AS t(tag)
         WHERE p.status = 'published' AND p.deleted_at IS NULL
         GROUP BY t.tag
         ORDER BY posts DESC, t.tag ASC LIMIT $1`, [limit]
    )).rows,

    getPublishedBySlug: async (slug) => (await sql(
        `SELECT ${PUBLIC_COLS}, p.body_md AS body, p.updated_at
         FROM community.post p ${AUTHOR}
         WHERE p.slug = $1 AND p.status = 'published' AND p.deleted_at IS NULL`, [slug]
    )).rows[0] || null,

    /** Locks a live published post so concurrent counter changes serialize. */
    lockLive: async (client, publicId) => (await client.query(
        `SELECT p.id::text AS id, p.author_id::text AS author_id, p.slug, p.title, u.public_id AS author_public_id
         FROM community.post p JOIN identity.users u ON u.id = p.author_id
         WHERE p.public_id = $1 AND p.status = 'published' AND p.deleted_at IS NULL FOR UPDATE OF p`, [publicId]
    )).rows[0] || null,

    insertLike: async (client, { postId, userId }) => (await client.query(
        `INSERT INTO community.post_like (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, userId]
    )).rowCount,

    deleteLike: async (client, { postId, userId }) => (await client.query(
        `DELETE FROM community.post_like WHERE post_id = $1 AND user_id = $2`, [postId, userId]
    )).rowCount,

    bumpLikes: async (client, { postId, delta }) => (await client.query(
        `UPDATE community.post SET like_count = GREATEST(like_count + $2::int, 0) WHERE id = $1 RETURNING like_count`, [postId, delta]
    )).rows[0].like_count,

    /** 1 when the report was stored, 0 when this user already reported the post (resolved or not). */
    insertReport: async (client, { postId, userId, reason }) => (await client.query(
        `INSERT INTO community.post_report (post_id, reporter_id, reason) VALUES ($1, $2, $3) ON CONFLICT (post_id, reporter_id) DO NOTHING`, [postId, userId, reason]
    )).rowCount,

    /** Closes the post's open reports; returns how many there were. */
    resolveReports: async (client, { postId }) => (await client.query(
        `UPDATE community.post_report SET resolved_at = now() WHERE post_id = $1 AND resolved_at IS NULL`, [postId]
    )).rowCount,

    insertComment: async (client, { publicId, postId, userId, body }) => (await client.query(
        `WITH c AS (INSERT INTO community.post_comment (public_id, post_id, user_id, body) VALUES ($1, $2, $3, $4) RETURNING created_at)
         SELECT c.created_at, u.username, i.image FROM c, identity.users u LEFT JOIN profile.info i ON i.user_id = u.id WHERE u.id = $3`,
        [publicId, postId, userId, body]
    )).rows[0],

    bumpComments: async (client, { postId, delta }) => client.query(
        `UPDATE community.post SET comment_count = GREATEST(comment_count + $2::int, 0) WHERE id = $1`, [postId, delta]
    ),

    /**
     * Locks one comment with its author's public id; deleted comments are not found.
     * The post is locked first, as every other path and the purge do, so they cannot deadlock (40P01).
     */
    lockComment: async (client, publicId) => {
        const post = (await client.query(
            `SELECT p.id FROM community.post p WHERE p.id = (SELECT post_id FROM community.post_comment WHERE public_id = $1) FOR UPDATE`, [publicId]
        )).rows[0];
        if (!post) return null;
        return (await client.query(
            `SELECT c.id::text AS id, c.post_id::text AS post_id, c.is_hidden, u.public_id AS author_public_id
             FROM community.post_comment c JOIN identity.users u ON u.id = c.user_id
             WHERE c.public_id = $1 AND NOT c.is_deleted FOR UPDATE OF c`, [publicId]
        )).rows[0] || null;
    },

    markCommentDeleted: async (client, { id }) => client.query(`UPDATE community.post_comment SET is_deleted = true, updated_at = now() WHERE id = $1`, [id]),

    setCommentHidden: async (client, { id, hidden, reason }) => (await client.query(
        `UPDATE community.post_comment SET is_hidden = $2, hidden_reason = $3, updated_at = now() WHERE id = $1 RETURNING updated_at`, [id, hidden, reason]
    )).rows[0].updated_at,

    /** Visible comments of a post, newest first. */
    listComments: async ({ postId, cursor, limit }) => (await sql(
        `SELECT c.public_id AS id, c.body, c.created_at, u.public_id AS author_id, u.username AS author_username, i.image AS author_image,
                c.created_at::text AS cursor_at, c.public_id AS cursor_id
         FROM community.post_comment c JOIN community.post p ON p.id = c.post_id
              JOIN identity.users u ON u.id = c.user_id LEFT JOIN profile.info i ON i.user_id = u.id
         WHERE p.public_id = $1 AND NOT c.is_deleted AND NOT c.is_hidden
           AND ($2::timestamptz IS NULL OR (c.created_at <= $2::timestamptz AND (c.created_at, c.public_id) < ($2::timestamptz, $3::text)))
         ORDER BY c.created_at DESC, c.public_id DESC LIMIT $4`,
        [postId, cursor?.createdAt ?? null, cursor?.id ?? null, limit]
    )).rows,

    /** Moderation list: every non-deleted comment, newest first, with its post. */
    listCommentsAdmin: async ({ cursor, limit }) => (await sql(
        `SELECT c.public_id AS id, c.body, c.created_at, c.is_hidden, u.public_id AS author_id, u.username AS author_username, i.image AS author_image,
                p.public_id AS post_id, p.slug AS post_slug, p.title AS post_title, p.status AS post_status,
                p.deleted_at IS NOT NULL AS post_deleted, c.created_at::text AS cursor_at, c.public_id AS cursor_id
         FROM community.post_comment c JOIN community.post p ON p.id = c.post_id
              JOIN identity.users u ON u.id = c.user_id LEFT JOIN profile.info i ON i.user_id = u.id
         WHERE NOT c.is_deleted
           AND ($1::timestamptz IS NULL OR (c.created_at <= $1::timestamptz AND (c.created_at, c.public_id) < ($1::timestamptz, $2::text)))
         ORDER BY c.created_at DESC, c.public_id DESC LIMIT $3`,
        [cursor?.createdAt ?? null, cursor?.id ?? null, limit]
    )).rows,

    /** Counters plus the viewer's flags; userDbId null (signed out) gives all false. Any report counts, dismissed ones too. */
    viewerState: async (publicId, userDbId) => (await sql(
        `SELECT p.like_count, p.comment_count,
                EXISTS (SELECT 1 FROM community.post_like l WHERE l.post_id = p.id AND l.user_id = $2::bigint) AS liked,
                EXISTS (SELECT 1 FROM community.post_report r WHERE r.post_id = p.id AND r.reporter_id = $2::bigint) AS reported,
                COALESCE(p.author_id = $2::bigint, false) AS own
         FROM community.post p WHERE p.public_id = $1 AND p.status = 'published' AND p.deleted_at IS NULL`, [publicId, userDbId]
    )).rows[0] || null,

    /** Live counters of the published posts among `publicIds`, and whether the viewer liked each; userDbId null gives liked false. */
    feedState: async (userDbId, publicIds) => (await sql(
        `SELECT p.public_id AS id, p.like_count, p.comment_count,
                EXISTS (SELECT 1 FROM community.post_like l WHERE l.post_id = p.id AND l.user_id = $1::bigint) AS liked
         FROM community.post p WHERE p.public_id = ANY($2::text[]) AND p.status = 'published' AND p.deleted_at IS NULL`, [userDbId, publicIds]
    )).rows,

    listSitemap: async () => (await sql(
        `SELECT slug, updated_at FROM community.post
         WHERE status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 5000`
    )).rows,

    /** Review queues: oldest first on updated_at, published newest first on published_at. */
    listAdmin: async ({ status, cursor, limit }) => {
        const published = status === "published";
        const at = published ? "p.published_at" : "p.updated_at";
        const dir = published ? "DESC" : "ASC";
        return (await sql(
            `SELECT p.public_id AS id, p.slug, p.title, p.excerpt, p.status, p.reject_reason, p.hidden_reason, p.hidden_at, p.appealed_at, p.appeal_reason, p.updated_at,
                    u.public_id AS author_id, u.username AS author_username, i.image AS author_image, ${at}::text AS cursor_at, p.public_id AS cursor_id
             FROM community.post p ${AUTHOR}
             WHERE (CASE $4::text
                      WHEN 'pending' THEN p.status = 'pending' AND p.appealed_at IS NULL
                      WHEN 'appeal' THEN p.status = 'pending' AND p.appealed_at IS NOT NULL
                      ELSE p.status = $4::text END) AND p.deleted_at IS NULL
               AND ($1::timestamptz IS NULL OR (${at}, p.public_id) ${published ? "<" : ">"} ($1::timestamptz, $2::text))
             ORDER BY ${at} ${dir}, p.public_id ${dir} LIMIT $3`,
            [cursor?.createdAt ?? null, cursor?.id ?? null, limit, status]
        )).rows;
    },

    /** Published posts with open reports: most reports first, then newest report. */
    // shortcut: the cursor is (report_count, last_report_at, id), so a static queue pages completely, but a report landing mid-paging can still move a row.
    listReported: async ({ cursor, limit }) => (await sql(
        `SELECT p.public_id AS id, p.slug, p.title, p.excerpt, p.status, p.reject_reason, p.hidden_reason, p.hidden_at, p.appealed_at, p.appeal_reason, p.updated_at,
                u.public_id AS author_id, u.username AS author_username, i.image AS author_image, g.report_count,
                (SELECT COALESCE(json_agg(json_build_object('reason', r.reason, 'createdAt', r.created_at) ORDER BY r.created_at DESC), '[]'::json)
                 FROM (SELECT reason, created_at FROM community.post_report WHERE post_id = p.id AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 5) r) AS reports,
                g.last_report_at::text AS cursor_at, p.public_id AS cursor_id
         FROM community.post p ${AUTHOR}
              JOIN (SELECT post_id, count(*)::int AS report_count, max(created_at) AS last_report_at
                    FROM community.post_report WHERE resolved_at IS NULL GROUP BY post_id) g ON g.post_id = p.id
         WHERE p.status = 'published' AND p.deleted_at IS NULL
           AND ($1::int IS NULL OR (g.report_count, g.last_report_at, p.public_id) < ($1::int, $2::timestamptz, $3::text))
         ORDER BY g.report_count DESC, g.last_report_at DESC, p.public_id DESC LIMIT $4`,
        [cursor?.count ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit]
    )).rows,

    getAdmin: async (publicId) => (await sql(
        `SELECT p.public_id AS id, p.slug, p.title, p.excerpt, p.status, p.body_md AS body, p.reject_reason, p.hidden_reason, p.hidden_at, p.appealed_at, p.appeal_reason, p.updated_at,
                u.public_id AS author_id, u.username AS author_username, i.image AS author_image
         FROM community.post p ${AUTHOR} WHERE p.public_id = $1 AND p.deleted_at IS NULL`, [publicId]
    )).rows[0] || null,

    lockForModeration: async (client, publicId) => (await client.query(
        `SELECT p.id::text AS id, p.author_id::text AS author_id, p.slug, p.status, p.appealed_at, p.hidden_at, u.public_id AS author_public_id
         FROM community.post p JOIN identity.users u ON u.id = p.author_id
         WHERE p.public_id = $1 AND p.deleted_at IS NULL FOR UPDATE OF p`, [publicId]
    )).rows[0] || null,

    // One post-publish reward per rolling 24 hours (D2). The profile lock serialises concurrent publishes; award_exp is idempotent per post.
    awardPublishExp: async (client, { authorDbId, postDbId }) => {
        await client.query(`SELECT 1 FROM profile.info WHERE user_id = $1::bigint FOR UPDATE`, [authorDbId]);
        const recent = await client.query(
            `SELECT 1 FROM profile.exp_transaction WHERE user_id = $1::bigint AND source_type = 'blog_post' AND created_at > now() - interval '24 hours' LIMIT 1`, [authorDbId]
        );
        if (recent.rowCount) return null;
        const { rows } = await client.query(
            `SELECT created, awarded, previous_level, new_level FROM public.award_exp($1::bigint, $2, 'blog_post', $3::bigint)`, [authorDbId, BLOG_PUBLISH_EXP_RULE, postDbId]
        );
        const r = rows[0];
        return r?.created ? { awarded: r.awarded, level: r.new_level, previousLevel: r.previous_level } : null;
    },

    // Once per (post, milestone): post_points dedupes on (user, source_type, source_id, action), the type carries the like count (D1).
    awardLikeMilestone: async (client, { authorDbId, postDbId, postPublicId, title, likes, points }) => (await client.query(
        `SELECT created FROM public.post_points($1::bigint, 'credit', 'earned', $2::bigint, $3::text, $4::bigint, $5::text, NULL, NULL, $6::text)`,
        [authorDbId, points, `blog_likes_${likes}`, postDbId, `blog-likes:${postPublicId}:${likes}`, `${likes} likes on "${title}"`]
    )).rows[0]?.created === true,

    approve: async (client, { id, actorDbId, appeal }) => (await client.query(
        `UPDATE community.post SET status = 'published', updated_at = now(),
                approved_by = CASE WHEN $3::boolean THEN approved_by ELSE $2::bigint END,
                approved_at = CASE WHEN $3::boolean THEN approved_at ELSE now() END,
                published_at = COALESCE(published_at, now()), hidden_at = NULL, hidden_reason = NULL
         WHERE id = $1 RETURNING updated_at`, [id, actorDbId, appeal]
    )).rows[0].updated_at,

    // An appeal that is rejected goes back to hidden and keeps hidden_at, so the purge clock never restarts.
    reject: async (client, { id, reason, appeal }) => (await client.query(
        `UPDATE community.post SET status = CASE WHEN $3::boolean THEN 'hidden' ELSE 'rejected' END,
                reject_reason = CASE WHEN $3::boolean THEN reject_reason ELSE $2::text END, updated_at = now()
         WHERE id = $1 RETURNING updated_at`, [id, reason, appeal]
    )).rows[0].updated_at,

    hide: async (client, { id, reason }) => (await client.query(
        `UPDATE community.post SET status = 'hidden', hidden_at = now(), hidden_reason = $2, updated_at = now() WHERE id = $1 RETURNING updated_at`, [id, reason]
    )).rows[0].updated_at,

    show: async (client, { id }) => (await client.query(
        `UPDATE community.post SET status = 'published', hidden_at = NULL, hidden_reason = NULL, updated_at = now() WHERE id = $1 RETURNING updated_at`, [id]
    )).rows[0].updated_at,

    // status = 'hidden' only: a pending appeal keeps its hidden_at but must survive the purge.
    lockExpiredHidden: async (client, { days, limit }) => (await client.query(
        `SELECT id::text AS id, public_id FROM community.post
         WHERE status = 'hidden' AND hidden_at < now() - make_interval(days => $1::int)
         ORDER BY hidden_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [days, limit]
    )).rows,

    /** Soft-deletes the batch's assets that no post outside the batch uses; returns their storage rows. */
    retireOrphanAssets: async (client, { postIds }) => (await client.query(
        `UPDATE storage.assets a SET deleted_at = now()
         WHERE a.deleted_at IS NULL
           AND a.id IN (SELECT asset_id FROM community.post_asset WHERE post_id = ANY($1::bigint[])
                        UNION SELECT cover_asset_id FROM community.post WHERE id = ANY($1::bigint[]) AND cover_asset_id IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM community.post_asset o WHERE o.asset_id = a.id AND o.post_id <> ALL($1::bigint[]))
           AND NOT EXISTS (SELECT 1 FROM community.post c WHERE c.cover_asset_id = a.id AND c.id <> ALL($1::bigint[]))
         RETURNING a.provider, a.object_key AS key`, [postIds]
    )).rows,

    deletePosts: async (client, { ids }) => client.query(`DELETE FROM community.post WHERE id = ANY($1::bigint[])`, [ids]),

    queueStoragePurge: async (client, { files }) => (await client.query(
        `INSERT INTO identity.auth_outbox (event_type, payload) VALUES ('storage.purge', $1::jsonb) RETURNING id::text`, [JSON.stringify({ files })]
    )).rows[0].id,
};
