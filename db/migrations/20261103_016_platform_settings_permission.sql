-- =============================================================================
-- 20261103_016_platform_settings_permission.sql
--
-- The admin Settings screens checked `settings.read`, which is the learners' own "Read user settings"
-- permission (held by the role `user`): anyone with admin.read, course managers included, could read
-- the role matrix and the configuration warnings. They now need `platform.settings`, granted to admin
-- (super_admin gets it from its trigger).
-- =============================================================================

BEGIN;

INSERT INTO identity.permissions (id, resource, action, description)
SELECT (SELECT COALESCE(MAX(id), 0) FROM identity.permissions) + 1, 'platform', 'settings', 'Read the platform configuration and the role matrix in the admin'
WHERE NOT EXISTS (SELECT 1 FROM identity.permissions WHERE resource = 'platform' AND action = 'settings');

SELECT setval(pg_get_serial_sequence('identity.permissions', 'id'), (SELECT MAX(id) FROM identity.permissions));

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r JOIN identity.permissions p ON p.resource = 'platform' AND p.action = 'settings'
WHERE r.code IN ('super_admin', 'admin')
ON CONFLICT DO NOTHING;

COMMIT;
