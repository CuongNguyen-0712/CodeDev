-- =============================================================================
-- 20261111_026_chat_files.sql
--
-- Chat revision 2: attachments gain kind (image | file), provider
-- (s3 | cloudinary | upstash) and file_name. Images: Cloudinary in production;
-- files: Upstash Blob in production; MinIO (s3) everywhere else.
-- 025 stays untouched (already applied locally).
-- =============================================================================

BEGIN;

ALTER TABLE community.chat_attachment
    ADD COLUMN kind varchar(10) NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'file')),
    ADD COLUMN provider varchar(20) NOT NULL DEFAULT 's3' CHECK (provider IN ('s3', 'cloudinary', 'upstash')),
    ADD COLUMN file_name varchar(255),                -- sanitized display name; NULL for images
    DROP CONSTRAINT chat_attachment_content_type_check,
    DROP CONSTRAINT chat_attachment_size_bytes_check,
    ADD CONSTRAINT chat_attachment_kind_type CHECK (
        (kind = 'image' AND content_type IN ('image/jpeg', 'image/png', 'image/webp') AND size_bytes BETWEEN 1 AND 5000000)
        OR (kind = 'file' AND content_type IN ('application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/zip')
            AND size_bytes BETWEEN 1 AND 15000000 AND file_name IS NOT NULL)
    ),
    ADD CONSTRAINT chat_attachment_provider_kind CHECK (
        provider = 's3' OR (provider = 'cloudinary' AND kind = 'image') OR (provider = 'upstash' AND kind = 'file')
    );

COMMIT;
