import { sql } from "@/lib/db";
import { ApiError } from "@/lib/error/apiError";

/**
 * Server-side permission checks for privileged APIs (admin / course manager).
 *
 * Roles and permissions are read from the database on every call instead of the JWT: a role
 * removed from a user takes effect immediately, and `auth/can.js` (route guard for pages) lets a
 * token without a permission list through, which is not acceptable for writes.
 */
export async function loadActor(userPublicId) {
    if (!userPublicId) return null;

    const { rows } = await sql(
        `SELECT u.id::text AS id,
                u.public_id,
                COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
                COALESCE(array_agg(DISTINCT p.resource || '.' || p.action) FILTER (WHERE p.id IS NOT NULL), '{}') AS permissions
         FROM identity.users u
         LEFT JOIN identity.user_roles ur ON ur.user_id = u.id
         LEFT JOIN identity.roles r ON r.id = ur.role_id
         LEFT JOIN identity.role_permissions rp ON rp.role_id = r.id
         LEFT JOIN identity.permissions p ON p.id = rp.permission_id
         WHERE u.public_id = $1 AND u.status = 'active'
         GROUP BY u.id, u.public_id`,
        [userPublicId]
    );

    const row = rows[0];
    if (!row) return null;

    return {
        id: row.id,
        publicId: row.public_id,
        roles: row.roles,
        permissions: new Set(row.permissions),
    };
}

export function actorCan(actor, permission) {
    return Boolean(actor) && actor.permissions.has(permission);
}

/**
 * @param {string} userPublicId  from the verified session
 * @param {string|string[]} permission  every listed permission is required
 * @returns {Promise<{ id: string, publicId: string, roles: string[], permissions: Set<string> }>}
 * @throws ApiError 403 when the user lacks a permission (404-style details are not leaked)
 */
export async function requirePermission(userPublicId, permission) {
    const actor = await loadActor(userPublicId);
    const needed = Array.isArray(permission) ? permission : [permission];

    if (!actor || !needed.every((p) => actor.permissions.has(p))) {
        throw new ApiError("You do not have permission to do this.", 403, { code: "FORBIDDEN" });
    }

    return actor;
}
