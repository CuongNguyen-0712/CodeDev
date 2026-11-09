import { sql } from "@/lib/db";

const AUTHOR = `JOIN identity.users u ON u.id = p.author_id LEFT JOIN profile.info i ON i.user_id = u.id`;
const PUBLIC_COLS = `p.public_id AS id, p.slug, p.title, p.excerpt, p.tags, p.published_at, u.public_id AS author_id, u.username AS author_username, i.image AS author_image`;

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

    /** Links the author's own live blog assets whose delivery URL the post uses; replaces earlier links. */
    replaceAssets: async (client, { postDbId, authorDbId, urls }) => {
        await client.query(`DELETE FROM community.post_asset WHERE post_id = $1`, [postDbId]);
        if (!urls.length) return;
        await client.query(
            `INSERT INTO community.post_asset (post_id, asset_id)
             SELECT $1, a.id FROM storage.assets a
             WHERE a.owner_id = $2 AND a.purpose = 'blog' AND a.deleted_at IS NULL AND a.external_url = ANY($3)`,
            [postDbId, authorDbId, urls]
        );
    },

    softDelete: async (client, { id }) => client.query(`UPDATE community.post SET deleted_at = now(), updated_at = now() WHERE id = $1`, [id]),

    listMine: async (authorDbId) => (await sql(
        `SELECT public_id AS id, slug, title, status, reject_reason, hidden_reason, hidden_at, appealed_at, updated_at
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
           AND ($1::text IS NULL OR $1 = ANY(p.tags))
           AND ($2::timestamptz IS NULL OR (p.published_at, p.public_id) < ($2::timestamptz, $3::text))
         ORDER BY p.published_at DESC, p.public_id DESC LIMIT $4`,
        [tag, cursor?.createdAt ?? null, cursor?.id ?? null, limit]
    )).rows,

    getPublishedBySlug: async (slug) => (await sql(
        `SELECT ${PUBLIC_COLS}, p.body_md AS body, p.updated_at
         FROM community.post p ${AUTHOR}
         WHERE p.slug = $1 AND p.status = 'published' AND p.deleted_at IS NULL`, [slug]
    )).rows[0] || null,
};
