-- =============================================================================
-- 20261017_001_storage_assets_media.sql
--
-- storage.assets becomes the registry for every uploaded file (S3 objects and Cloudinary
-- images), and profile avatars point at their asset:
--   * who owns it (owner_id), what it is for (purpose), image metadata (width, height,
--     format, version), a SHA-256 of the uploaded bytes and a soft-delete marker.
--   * provider limited to the providers the app writes ('s3', 'cloudinary').
--   * one row per stored object: unique (provider, object_key).
--   * profile.info.avatar_asset_id -> storage.assets: the uploaded avatar; profile.info.image
--     stays the URL that is shown (also used for OAuth provider avatars, which have no asset).
--
-- Expand-only and backwards compatible: no column is renamed or dropped (the misspelled
-- `mine_type` column stays; app code and seed scripts still write it), every new column is
-- nullable, so the previous app version keeps working during a rolling deploy.
-- =============================================================================

BEGIN;

ALTER TABLE storage.assets
    ADD COLUMN IF NOT EXISTS owner_id   bigint,
    ADD COLUMN IF NOT EXISTS purpose    varchar(30),
    ADD COLUMN IF NOT EXISTS width      integer,
    ADD COLUMN IF NOT EXISTS height     integer,
    ADD COLUMN IF NOT EXISTS format     varchar(20),
    ADD COLUMN IF NOT EXISTS version    bigint,
    ADD COLUMN IF NOT EXISTS checksum   varchar(64),
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN storage.assets.object_key IS 'S3 object key, or the Cloudinary public_id';
COMMENT ON COLUMN storage.assets.external_url IS 'Delivery URL (Cloudinary secure_url); NULL for S3 objects read through the API';
COMMENT ON COLUMN storage.assets.mine_type IS 'MIME type (column name misspelled historically; kept for compatibility)';
COMMENT ON COLUMN storage.assets.owner_id IS 'Uploading user, NULL for platform content (seeded challenge files)';
COMMENT ON COLUMN storage.assets.purpose IS 'avatar | challenge_file | submission | ...';
COMMENT ON COLUMN storage.assets.version IS 'Cloudinary version of the stored file';
COMMENT ON COLUMN storage.assets.checksum IS 'SHA-256 (hex) of the uploaded bytes';
COMMENT ON COLUMN storage.assets.deleted_at IS 'Set when the file was replaced / removed from the provider';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_assets_owner') THEN
        ALTER TABLE storage.assets
            ADD CONSTRAINT fk_assets_owner FOREIGN KEY (owner_id) REFERENCES identity.users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_assets_provider') THEN
        ALTER TABLE storage.assets
            ADD CONSTRAINT chk_assets_provider CHECK (provider IN ('s3', 'cloudinary')) NOT VALID;
        ALTER TABLE storage.assets VALIDATE CONSTRAINT chk_assets_provider;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_assets_dimensions') THEN
        ALTER TABLE storage.assets
            ADD CONSTRAINT chk_assets_dimensions CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0));
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_provider_object_key
    ON storage.assets (provider, object_key)
    WHERE object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_owner_purpose
    ON storage.assets (owner_id, purpose)
    WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------- avatars

ALTER TABLE profile.info
    ADD COLUMN IF NOT EXISTS avatar_asset_id bigint;

COMMENT ON COLUMN profile.info.avatar_asset_id IS 'Uploaded avatar (storage.assets); NULL when image is an OAuth provider URL or empty';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_info_avatar_asset') THEN
        ALTER TABLE profile.info
            ADD CONSTRAINT fk_info_avatar_asset FOREIGN KEY (avatar_asset_id) REFERENCES storage.assets(id) ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_info_avatar_asset
    ON profile.info (avatar_asset_id)
    WHERE avatar_asset_id IS NOT NULL;

COMMIT;
