-- =============================================================================
-- 20261111_025_chat.sql
--
-- Chat core (direct + team conversations) in schema community:
--   conversation, conversation_member, chat_message, chat_attachment,
--   user_block, chat_report; permission chat.moderate for super_admin, admin.
-- Drops the old community.messages (id integer, no client_id, no group chat).
-- PRODUCTION: before db:migrate:prod, confirm SELECT count(*) FROM community.messages = 0;
-- if not 0, stop and ask the user.
-- =============================================================================

BEGIN;

CREATE TYPE community.conversation_kind AS ENUM ('direct', 'team');
CREATE TYPE community.member_state AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE community.conversation (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id varchar(40) UNIQUE NOT NULL,
    kind community.conversation_kind NOT NULL,
    direct_key varchar(41) UNIQUE,            -- "<least user id>:<greatest user id>"
    team_id varchar(50) UNIQUE REFERENCES community.team(id) ON DELETE CASCADE,
    last_message_id bigint,
    last_message_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'direct') = (direct_key IS NOT NULL)),
    CHECK ((kind = 'team') = (team_id IS NOT NULL))
);

CREATE TABLE community.conversation_member (
    conversation_id bigint NOT NULL REFERENCES community.conversation(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    state community.member_state NOT NULL,
    last_read_message_id bigint NOT NULL DEFAULT 0,
    left_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conversation_member_user ON community.conversation_member (user_id, state) WHERE left_at IS NULL;

CREATE TABLE community.chat_message (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id varchar(40) UNIQUE NOT NULL,
    conversation_id bigint NOT NULL REFERENCES community.conversation(id) ON DELETE CASCADE,
    sender_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    client_id uuid NOT NULL,
    body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
    edited_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sender_id, client_id)
);
CREATE INDEX idx_chat_message_conversation ON community.chat_message (conversation_id, id DESC);

CREATE TABLE community.chat_attachment (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id varchar(40) UNIQUE NOT NULL,
    conversation_id bigint NOT NULL REFERENCES community.conversation(id) ON DELETE CASCADE,
    uploader_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    message_id bigint REFERENCES community.chat_message(id) ON DELETE CASCADE,  -- NULL: uploaded, not sent
    storage_key text UNIQUE NOT NULL,
    content_type varchar(40) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5000000),
    width integer,
    height integer,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_attachment_message ON community.chat_attachment (message_id);
CREATE INDEX idx_chat_attachment_orphan ON community.chat_attachment (created_at) WHERE message_id IS NULL;

CREATE TABLE community.user_block (
    blocker_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    blocked_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_user_block_blocked ON community.user_block (blocked_id);

CREATE TABLE community.chat_report (
    message_id bigint NOT NULL REFERENCES community.chat_message(id) ON DELETE CASCADE,
    reporter_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    reason varchar(500) NOT NULL CHECK (char_length(reason) >= 5),
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by bigint REFERENCES identity.users(id) ON DELETE SET NULL,
    UNIQUE (message_id, reporter_id)
);
CREATE INDEX idx_chat_report_open ON community.chat_report (created_at) WHERE resolved_at IS NULL;

DROP TABLE community.messages;

INSERT INTO identity.permissions (id, resource, action, description)
SELECT (SELECT COALESCE(MAX(id), 0) FROM identity.permissions) + 1, 'chat', 'moderate', 'Review reported chat messages'
WHERE NOT EXISTS (SELECT 1 FROM identity.permissions WHERE resource = 'chat' AND action = 'moderate');

SELECT setval(pg_get_serial_sequence('identity.permissions', 'id'), (SELECT MAX(id) FROM identity.permissions));

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r JOIN identity.permissions p ON p.resource = 'chat' AND p.action = 'moderate'
WHERE r.code IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;

COMMIT;
