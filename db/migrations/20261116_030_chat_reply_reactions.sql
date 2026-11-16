-- =============================================================================
-- 20261116_030_chat_reply_reactions.sql
--
-- Chat UX phase 2.
--  1. chat_message.reply_to_id points at the quoted message; the quote is
--     dropped (SET NULL) if the target row is ever deleted.
--  2. chat_reaction holds one row per (message, user, emoji); removed with
--     the message or the user.
--  3. conversation_member.request_pushed_at marks that the "New message
--     request" push was already sent for that (conversation, recipient).
-- =============================================================================

BEGIN;

ALTER TABLE community.chat_message
    ADD COLUMN IF NOT EXISTS reply_to_id bigint REFERENCES community.chat_message(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS community.chat_reaction (
    message_id bigint NOT NULL REFERENCES community.chat_message(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    emoji text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji)
);

ALTER TABLE community.conversation_member
    ADD COLUMN IF NOT EXISTS request_pushed_at timestamptz;

COMMIT;
