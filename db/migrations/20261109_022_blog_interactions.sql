-- =============================================================================
-- 20261109_022_blog_interactions.sql
--
-- Community blog interactions on top of community.post:
--   community.post_like     one like per user per post
--   community.post_comment  flat comments; hidden by moderators, soft-deleted by authors
--   community.post_report   one open report per user per post, resolved by moderators
-- =============================================================================

BEGIN;

CREATE TABLE community.post_like (
    post_id bigint NOT NULL REFERENCES community.post(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_post_like_user ON community.post_like (user_id);

CREATE TABLE community.post_comment (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id varchar(40) UNIQUE NOT NULL,
    post_id bigint NOT NULL REFERENCES community.post(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    is_hidden boolean NOT NULL DEFAULT false,
    is_deleted boolean NOT NULL DEFAULT false,
    hidden_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_comment_post ON community.post_comment (post_id, created_at DESC, id DESC) WHERE NOT is_deleted;
CREATE INDEX idx_post_comment_recent ON community.post_comment (created_at DESC, id DESC) WHERE NOT is_deleted;

CREATE TABLE community.post_report (
    post_id bigint NOT NULL REFERENCES community.post(id) ON DELETE CASCADE,
    reporter_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    reason varchar(500) NOT NULL CHECK (char_length(reason) >= 5),
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    UNIQUE (post_id, reporter_id)
);

CREATE INDEX idx_post_report_open ON community.post_report (post_id) WHERE resolved_at IS NULL;

COMMIT;
