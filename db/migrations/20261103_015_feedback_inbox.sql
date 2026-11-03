-- =============================================================================
-- 20261103_015_feedback_inbox.sql
--
-- Admin feedback inbox (docs/admin-panel-plan.md 11.3): what learners send with "Send feedback".
--   community.feedback   handled_at / handled_by: marked handled (or reopened) from /admin/feedback
--   feedback.read        read the inbox and mark feedback handled; granted to admin, super_admin
--                        gets it from its trigger
-- =============================================================================

BEGIN;

ALTER TABLE community.feedback
    ADD COLUMN IF NOT EXISTS handled_at timestamptz,
    ADD COLUMN IF NOT EXISTS handled_by bigint REFERENCES identity.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_open ON community.feedback (created_at DESC) WHERE handled_at IS NULL;

INSERT INTO identity.permissions (id, resource, action, description)
SELECT (SELECT COALESCE(MAX(id), 0) FROM identity.permissions) + 1, 'feedback', 'read', 'Read feedback sent about CodeDev and mark it handled'
WHERE NOT EXISTS (SELECT 1 FROM identity.permissions WHERE resource = 'feedback' AND action = 'read');

SELECT setval(pg_get_serial_sequence('identity.permissions', 'id'), (SELECT MAX(id) FROM identity.permissions));

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r JOIN identity.permissions p ON p.resource = 'feedback' AND p.action = 'read'
WHERE r.code IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;

COMMIT;
