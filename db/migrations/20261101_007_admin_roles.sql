-- =============================================================================
-- 20261101_007_admin_roles.sql
--
-- Admin panel roles and permissions (docs/admin-panel-plan.md, section 3).
--   1. identity.roles.rank: who may assign roles to / lock whom (a lower rank only).
--   2. super_admin: every permission, including the ones added later (trigger below), with no
--      shortcut in code: requirePermission still checks each code.
--   3. The admin panel permissions, granted to super_admin, admin and course_manager.
-- =============================================================================

BEGIN;

-- 1. rank
ALTER TABLE identity.roles ADD COLUMN IF NOT EXISTS rank smallint NOT NULL DEFAULT 0;

INSERT INTO identity.roles (id, code, name, description)
SELECT COALESCE(MAX(id), 0) + 1, 'super_admin', 'Super admin', 'Every permission; assigns admin and super_admin'
FROM identity.roles
WHERE NOT EXISTS (SELECT 1 FROM identity.roles WHERE code = 'super_admin');

SELECT setval(pg_get_serial_sequence('identity.roles', 'id'), (SELECT MAX(id) FROM identity.roles));

UPDATE identity.roles SET rank = CASE code
    WHEN 'super_admin' THEN 100
    WHEN 'admin' THEN 80
    WHEN 'course_manager' THEN 50
    WHEN 'instructor' THEN 30
    ELSE 10
END;

-- 2. permissions
INSERT INTO identity.permissions (id, resource, action, description)
SELECT (SELECT COALESCE(MAX(id), 0) FROM identity.permissions) + ROW_NUMBER() OVER (ORDER BY v.resource, v.action),
       v.resource, v.action, v.description
FROM (VALUES
    ('user', 'read', 'List users and read their details and activity'),
    ('user', 'pii', 'See full email addresses, IP addresses and user agents'),
    ('user', 'status', 'Activate, suspend or block accounts'),
    ('session', 'revoke', 'Sign other users out of their sessions'),
    ('role', 'assign', 'Assign or remove roles of a lower rank'),
    ('role', 'manage', 'Change which permissions a role has'),
    ('catalog', 'update', 'Edit categories, languages, skills, roles, industries, goals and course structure'),
    ('content', 'studio', 'Open the content studio'),
    ('challenge', 'update', 'Change the status, publishing and points of challenges'),
    ('submission', 'read', 'Read learners'' code and run results'),
    ('coderun', 'cancel', 'Cancel queued or running code runs'),
    ('ops', 'read', 'Open the system page'),
    ('ops', 'resolve', 'Resolve or retry dead letters, close expired runs'),
    ('audit', 'read', 'Read the audit log'),
    ('settings', 'read', 'Read the platform configuration'),
    ('payment', 'read', 'List payments and failed webhooks'),
    ('payment', 'reconcile', 'Read webhook payloads and match transfers to orders')
) AS v(resource, action, description)
WHERE NOT EXISTS (SELECT 1 FROM identity.permissions p WHERE p.resource = v.resource AND p.action = v.action);

SELECT setval(pg_get_serial_sequence('identity.permissions', 'id'), (SELECT MAX(id) FROM identity.permissions));

-- 3. grants
-- super_admin: everything.
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r CROSS JOIN identity.permissions p
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;

-- admin: everything an admin screen uses, except changing the role matrix.
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r JOIN identity.permissions p
  ON p.resource || '.' || p.action IN (
      'admin.read', 'course.create', 'course.update', 'course.delete', 'course.publish', 'course.price',
      'points.adjust', 'order.list', 'order.refund', 'entitlement.grant',
      'user.read', 'user.pii', 'user.status', 'session.revoke', 'role.assign',
      'catalog.update', 'content.studio', 'challenge.update', 'submission.read', 'coderun.cancel',
      'ops.read', 'ops.resolve', 'audit.read', 'settings.read', 'payment.read', 'payment.reconcile')
WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- course_manager: content only.
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r JOIN identity.permissions p
  ON p.resource || '.' || p.action IN (
      'admin.read', 'course.update', 'course.publish', 'course.price',
      'catalog.update', 'content.studio', 'challenge.update', 'submission.read')
WHERE r.code = 'course_manager'
ON CONFLICT DO NOTHING;

-- A permission added later is granted to super_admin at once.
CREATE OR REPLACE FUNCTION identity.grant_new_permission_to_super_admin() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO identity.role_permissions (role_id, permission_id)
    SELECT r.id, NEW.id FROM identity.roles r WHERE r.code = 'super_admin'
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permissions_super_admin ON identity.permissions;
CREATE TRIGGER trg_permissions_super_admin
    AFTER INSERT ON identity.permissions
    FOR EACH ROW EXECUTE FUNCTION identity.grant_new_permission_to_super_admin();

COMMIT;
