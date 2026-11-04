-- =============================================================================
-- 20261104_018_announcements.sql
--
-- Notifications sent by admins (docs/notification-plan.md 3). One row per send; each recipient
-- gets a profile.notification row with kind = 'announcement' and dedupe_key = the announcement id,
-- so a retried batch never writes a second row and a retraction finds every copy.
--   ops.announcement       what was sent, to whom (audience), when, by whom, and its state
--   announcement.send      send, schedule, cancel and retract; granted to admin (super_admin gets
--                          it from its trigger)
--   notification.read_at   when the learner read it (read rate per announcement)
-- =============================================================================

BEGIN;

ALTER TABLE profile.notification ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Read counts and retraction of one announcement's copies.
CREATE INDEX IF NOT EXISTS idx_notification_announcement ON profile.notification (dedupe_key)
    WHERE kind = 'announcement';

CREATE TABLE IF NOT EXISTS ops.announcement (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar(120) NOT NULL,
    body varchar(1000) NOT NULL,
    -- In-site paths only: one leading slash, no second slash or backslash right after it.
    link text CHECK (link IS NULL OR (link ~ '^/[^/\\]' OR link = '/')),
    -- {"type":"all"} | {"type":"role","roles":[...]} | {"type":"course","courseId":"..."} | {"type":"users","userIds":[...]}
    audience jsonb NOT NULL,
    status text NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'sending', 'sent', 'cancelled', 'retracted')),
    send_at timestamptz NOT NULL DEFAULT now(),
    recipients integer,
    created_by bigint REFERENCES identity.users(id) ON DELETE SET NULL,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_created ON ops.announcement (created_at DESC, id DESC);
-- The sweeper's catch-up for sends that never started (queue down when it was due).
CREATE INDEX IF NOT EXISTS idx_announcement_due ON ops.announcement (send_at) WHERE status = 'scheduled';

INSERT INTO identity.permissions (id, resource, action, description)
SELECT (SELECT COALESCE(MAX(id), 0) FROM identity.permissions) + 1, 'announcement', 'send', 'Send, schedule, cancel and retract notifications to learners'
WHERE NOT EXISTS (SELECT 1 FROM identity.permissions WHERE resource = 'announcement' AND action = 'send');

SELECT setval(pg_get_serial_sequence('identity.permissions', 'id'), (SELECT MAX(id) FROM identity.permissions));

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r JOIN identity.permissions p ON p.resource = 'announcement' AND p.action = 'send'
WHERE r.code IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;

COMMIT;
