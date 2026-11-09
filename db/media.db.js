import { dbPool, sql } from "@/lib/db";

export const AVATAR_HISTORY_MAX = 10;

/** Soft-deletes the owner's avatars beyond the newest AVATAR_HISTORY_MAX, never `keepId`. */
async function pruneAvatars(client, { ownerId, keepId }) {
    const { rows } = await client.query(
        `UPDATE storage.assets SET deleted_at = now(), updated_at = now()
         WHERE id IN (
             SELECT id FROM storage.assets
             WHERE owner_id = $1 AND purpose = 'avatar' AND deleted_at IS NULL AND id <> $2
             ORDER BY id DESC
             OFFSET $3
         )
         RETURNING provider, object_key`,
        [ownerId, keepId, AVATAR_HISTORY_MAX - 1]
    );
    return rows.map((row) => ({ provider: row.provider, objectKey: row.object_key }));
}

/** Runs fn(client, profile) in a transaction with the user's profile row locked; null if no user. */
async function withProfileLock(userId, fn) {
    const client = await dbPool.connect();
    try {
        await client.query("BEGIN");
        const profile = await client.query(
            `SELECT i.id AS info_id, u.id AS user_id, i.avatar_asset_id
             FROM identity.users u
             JOIN profile.info i ON i.user_id = u.id
             WHERE u.public_id = $1
             FOR UPDATE OF i`,
            [userId]
        );
        if (profile.rowCount === 0) {
            await client.query("ROLLBACK");
            return null;
        }
        const result = await fn(client, profile.rows[0]);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => { });
        throw error;
    } finally {
        client.release();
    }
}

/** The owner's live avatar asset by public id, locked; null if missing, deleted or someone else's. */
async function findOwnAvatar(client, { ownerId, assetPublicId }) {
    const { rows } = await client.query(
        `SELECT id::text, external_url, provider, object_key FROM storage.assets
         WHERE public_id = $1 AND owner_id = $2 AND purpose = 'avatar' AND deleted_at IS NULL
         FOR UPDATE`,
        [assetPublicId, ownerId]
    );
    return rows[0] || null;
}

/**
 * Uploaded media (storage.assets) and the profile avatar pointer (profile.info.avatar_asset_id).
 * Earlier avatars are kept as history (newest AVATAR_HISTORY_MAX). Each write runs in one
 * transaction with the profile row locked: asset rows and the profile pointer change together.
 */
export const mediaDb = {
    /**
     * Records an uploaded avatar (asset.provider: cloudinary | payload) and makes it the user's profile image.
     * @returns {Promise<{ assetId: string, pruned: { provider: string, objectKey: string }[] } | null>}
     *          null when the user does not exist.
     */
    setAvatar: ({ userId, asset }) => withProfileLock(userId, async (client, { info_id: infoId, user_id: ownerId }) => {
        const inserted = await client.query(
            `INSERT INTO storage.assets
                (public_id, provider, object_key, external_url, resource_type, mine_type, file_size,
                 original_name, owner_id, purpose, width, height, format, version, checksum)
             VALUES ($1, $13, $2, $3, 'image', $4, $5, $6, $7, 'avatar', $8, $9, $10, $11, $12)
             RETURNING id::text`,
            [
                asset.publicId, asset.objectKey, asset.url, asset.mime, asset.size,
                asset.originalName, ownerId, asset.width, asset.height, asset.format, asset.version, asset.checksum, asset.provider,
            ]
        );
        const assetId = inserted.rows[0].id;

        await client.query(
            `UPDATE profile.info SET image = $1, avatar_asset_id = $2, updated_at = now() WHERE id = $3`,
            [asset.url, assetId, infoId]
        );

        // Earlier avatars stay as history; only those past the newest AVATAR_HISTORY_MAX are retired.
        const pruned = await pruneAvatars(client, { ownerId, keepId: assetId });
        return { assetId, pruned };
    }),

    /**
     * Records an uploaded asset for a user (by public id) with the given purpose, e.g. 'blog'.
     * @returns {Promise<{ assetId: string } | null>} null when the user does not exist.
     */
    insertAsset: async ({ ownerId, asset, purpose }) => {
        const { rows } = await sql(
            `INSERT INTO storage.assets
                (public_id, provider, object_key, external_url, resource_type, mine_type, file_size,
                 original_name, owner_id, purpose, width, height, format, version, checksum)
             SELECT $1, $2, $3, $4, 'image', $5, $6, $7, u.id, $8, $9, $10, $11, $12, $13
             FROM identity.users u WHERE u.public_id = $14
             RETURNING id::text AS "assetId"`,
            [
                asset.publicId, asset.provider, asset.objectKey, asset.url, asset.mime, asset.size,
                asset.originalName, purpose, asset.width, asset.height, asset.format, asset.version, asset.checksum, ownerId,
            ]
        );
        return rows[0] || null;
    },

    /** The user's kept avatars, newest first; `current` marks the one on the profile. */
    listAvatars: async ({ userId }) => {
        const { rows } = await sql(
            `SELECT a.public_id, a.external_url, a.width, a.height, a.created_at,
                    (a.id = i.avatar_asset_id) AS current
             FROM identity.users u
             JOIN profile.info i ON i.user_id = u.id
             JOIN storage.assets a ON a.owner_id = u.id AND a.purpose = 'avatar' AND a.deleted_at IS NULL
             WHERE u.public_id = $1
             ORDER BY a.id DESC
             LIMIT $2`,
            [userId, AVATAR_HISTORY_MAX]
        );
        return rows;
    },

    /**
     * Makes a kept avatar the profile image again.
     * @returns {Promise<{ url: string } | null | false>} null: no user; false: no such avatar.
     */
    restoreAvatar: ({ userId, assetPublicId }) => withProfileLock(userId, async (client, profile) => {
        const asset = await findOwnAvatar(client, { ownerId: profile.user_id, assetPublicId });
        if (!asset) return false;
        await client.query(
            `UPDATE profile.info SET image = $1, avatar_asset_id = $2, updated_at = now() WHERE id = $3`,
            [asset.external_url, asset.id, profile.info_id]
        );
        return { url: asset.external_url };
    }),

    /**
     * Retires a kept avatar that is not the current one.
     * @returns {Promise<{ provider: string, objectKey: string } | "current" | null | false>}
     *          null: no user; false: no such avatar; "current": it is the profile image.
     */
    deleteAvatar: ({ userId, assetPublicId }) => withProfileLock(userId, async (client, profile) => {
        const asset = await findOwnAvatar(client, { ownerId: profile.user_id, assetPublicId });
        if (!asset) return false;
        if (String(asset.id) === String(profile.avatar_asset_id)) return "current";
        await client.query(`UPDATE storage.assets SET deleted_at = now(), updated_at = now() WHERE id = $1`, [asset.id]);
        return { provider: asset.provider, objectKey: asset.object_key };
    }),
};
