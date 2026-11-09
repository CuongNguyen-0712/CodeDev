-- =============================================================================
-- 20261109_021_community_blog.sql
--
-- Community blog (docs/superpowers blog design):
--   community.post        learners' posts: draft -> pending -> published / rejected / hidden
--   community.post_asset  images a post uses, so they follow the post's life
--   blog.moderate         approve, reject, hide or show posts; granted to admin and course_manager,
--                         super_admin gets it from its trigger
-- =============================================================================

BEGIN;

CREATE TABLE community.post (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id varchar(40) UNIQUE NOT NULL,
    author_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    slug varchar(100) UNIQUE NOT NULL,
    title varchar(150) NOT NULL,
    excerpt varchar(300) NOT NULL,
    body_md text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 50000),
    tags text[] NOT NULL CHECK (cardinality(tags) BETWEEN 1 AND 5),
    cover_asset_id bigint REFERENCES storage.assets(id) ON DELETE SET NULL,
    status varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected', 'hidden')),
    reject_reason text,
    hidden_reason text,
    hidden_at timestamptz,
    appealed_at timestamptz,
    appeal_reason varchar(500),
    approved_by bigint REFERENCES identity.users(id) ON DELETE SET NULL,
    approved_at timestamptz,
    published_at timestamptz,
    like_count int NOT NULL DEFAULT 0,
    comment_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX idx_post_published ON community.post (published_at DESC, id DESC) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX idx_post_tags ON community.post USING gin (tags) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX idx_post_author ON community.post (author_id, updated_at DESC);
CREATE INDEX idx_post_hidden ON community.post (hidden_at) WHERE status = 'hidden';
CREATE INDEX idx_post_queue ON community.post (status, updated_at) WHERE status IN ('pending', 'hidden', 'rejected');

CREATE TABLE community.post_asset (
    post_id bigint NOT NULL REFERENCES community.post(id) ON DELETE CASCADE,
    asset_id bigint NOT NULL REFERENCES storage.assets(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, asset_id)
);

CREATE INDEX idx_post_asset_asset ON community.post_asset (asset_id);

INSERT INTO identity.permissions (id, resource, action, description)
SELECT (SELECT COALESCE(MAX(id), 0) FROM identity.permissions) + 1, 'blog', 'moderate', 'Approve, reject, hide or show learners'' blog posts'
WHERE NOT EXISTS (SELECT 1 FROM identity.permissions WHERE resource = 'blog' AND action = 'moderate');

SELECT setval(pg_get_serial_sequence('identity.permissions', 'id'), (SELECT MAX(id) FROM identity.permissions));

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r JOIN identity.permissions p ON p.resource = 'blog' AND p.action = 'moderate'
WHERE r.code IN ('super_admin', 'admin', 'course_manager')
ON CONFLICT DO NOTHING;

COMMIT;
