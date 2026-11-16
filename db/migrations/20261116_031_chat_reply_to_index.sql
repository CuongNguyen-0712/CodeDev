-- =============================================================================
-- 20261116_031_chat_reply_to_index.sql
--
-- chat_message.reply_to_id is a self-referencing FK (ON DELETE SET NULL), so
-- every hard delete of a message scans chat_message for quoting rows. A partial
-- index keeps that lookup cheap without indexing the many NULLs.
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_chat_message_reply_to ON community.chat_message (reply_to_id) WHERE reply_to_id IS NOT NULL;

COMMIT;
