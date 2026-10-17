import { dbPool } from "@/lib/db";

/**
 * Uploaded media (storage.assets) and the profile avatar pointer (profile.info.avatar_asset_id).
 * Writes run in one transaction: the new asset row, the profile update and the retirement of the
 * previous avatar either all happen or none do.
 */
export const mediaDb = {
    /**
     * Records an uploaded Cloudinary avatar and makes it the user's profile image.
     * @returns {Promise<{ assetId: string, previous: { provider: string, objectKey: string } | null } | null>}
     *          null when the user does not exist.
     */
    setAvatar: async ({ userId, asset }) => {
        const client = await dbPool.connect();

        try {
            await client.query("BEGIN");

            // Lock the profile row: two concurrent uploads must not both retire the same old avatar.
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

            const { info_id: infoId, user_id: ownerId, avatar_asset_id: previousId } = profile.rows[0];

            const inserted = await client.query(
                `INSERT INTO storage.assets
                    (public_id, provider, object_key, external_url, resource_type, mine_type, file_size,
                     original_name, owner_id, purpose, width, height, format, version, checksum)
                 VALUES ($1, 'cloudinary', $2, $3, 'image', $4, $5, $6, $7, 'avatar', $8, $9, $10, $11, $12)
                 RETURNING id::text`,
                [
                    asset.publicId, asset.objectKey, asset.url, asset.mime, asset.size,
                    asset.originalName, ownerId, asset.width, asset.height, asset.format, asset.version, asset.checksum,
                ]
            );
            const assetId = inserted.rows[0].id;

            await client.query(
                `UPDATE profile.info SET image = $1, avatar_asset_id = $2, updated_at = now() WHERE id = $3`,
                [asset.url, assetId, infoId]
            );

            let previous = null;
            if (previousId) {
                const retired = await client.query(
                    `UPDATE storage.assets SET deleted_at = now(), updated_at = now()
                     WHERE id = $1 AND deleted_at IS NULL
                     RETURNING provider, object_key`,
                    [previousId]
                );
                if (retired.rowCount > 0) {
                    previous = { provider: retired.rows[0].provider, objectKey: retired.rows[0].object_key };
                }
            }

            await client.query("COMMIT");
            return { assetId, previous };
        } catch (error) {
            await client.query("ROLLBACK").catch(() => { });
            throw error;
        } finally {
            client.release();
        }
    },
};
