-- =============================================================================
-- 20261109_020_assets_payload_provider.sql
--
-- storage.assets.provider also accepts 'payload': outside production, uploaded media lives in the
-- local Payload CMS (lib/media/mediaStore.js); object_key is then the Payload document id.
-- =============================================================================

BEGIN;

ALTER TABLE storage.assets DROP CONSTRAINT chk_assets_provider;
ALTER TABLE storage.assets ADD CONSTRAINT chk_assets_provider CHECK (provider IN ('s3', 'cloudinary', 'payload'));

COMMIT;
