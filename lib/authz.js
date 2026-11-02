import { headers } from "next/headers";

import { sql } from "@/lib/db";
import { redis } from "@/lib/cache";
import { ApiError } from "@/lib/error/apiError";
import { adminEnabled, adminIpAllowed } from "@/lib/adminMode";
import { RateLimiter } from "@/lib/rateLimit";
import { getAuthSession } from "@/lib/session";
import { adminMfaDb } from "@/db/adminMfa.db";
import { mfaRequiredFor, REAUTH_WINDOW_MS } from "@/services/adminMfa.service";

/**
 * Server-side permission checks for privileged APIs (admin / course manager).
 *
 * Roles and permissions are read from the database on every call instead of the JWT: a role
 * removed from a user takes effect immediately, and `auth/can.js` (route guard for pages) lets a
 * token without a permission list through, which is not acceptable for writes.
 * `rank` is the highest identity.roles.rank of the user (super_admin 100, admin 80, ...).
 */
export async function loadActor(userPublicId) {
    if (!userPublicId) return null;

    const { rows } = await sql(
        `SELECT u.id::text AS id,
                u.public_id,
                COALESCE(MAX(r.rank), 0) AS rank,
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
        rank: Number(row.rank),
        roles: row.roles,
        permissions: new Set(row.permissions),
    };
}

export function actorCan(actor, permission) {
    return Boolean(actor) && actor.permissions.has(permission);
}

async function clientIp() {
    try {
        return RateLimiter.getClientIp(await headers(), { trustedOnly: true });
    } catch {
        return null;
    }
}

/**
 * One audit row per user and permission set every 10 minutes when a privileged call is refused,
 * so probing shows up without a refused-request flood filling the log.
 */
async function recordDenied(userPublicId, actor, needed, ip) {
    try {
        const first = await redis.set(`admin:denied:${userPublicId || ip}:${needed.join(",")}`, "1", { ex: 600, nx: true });
        if (first !== "OK") return;
        await sql(
            `INSERT INTO identity.audit_log (actor_id, action, target_type, target_id, reason, ip_address)
             VALUES ($1, 'admin.denied', 'permission', $2, $3, $4)`,
            [actor?.id ?? null, needed.join(",").slice(0, 100), actor ? "missing permission" : "no active account", ip]
        );
    } catch (error) {
        console.error("[authz] could not record a refused admin call:", error?.message);
    }
}

/** The second-factor state of the caller's current session. */
async function sessionFactor(actor) {
    const session = await getAuthSession({ soft: true });
    const sessionId = session?.user?.sessionId;
    if (!sessionId || session.user.id !== actor.publicId) return null;
    return adminMfaDb.sessionState({ sessionId: String(sessionId), userDbId: actor.id });
}

/**
 * @param {string} userPublicId  from the verified session
 * @param {string|string[]} permission  every listed permission is required
 * @param {{ mfa?: boolean }} [options]  mfa: false only for the two-factor setup and verify routes
 * @returns {Promise<{ id: string, publicId: string, rank: number, roles: string[], permissions: Set<string> }>}
 * @throws ApiError 404 when the admin area is off or the address is not allowed, 403 FORBIDDEN
 *   without a permission, 403 MFA_REQUIRED when the session has not passed the second factor
 */
export async function requirePermission(userPublicId, permission, { mfa = true } = {}) {
    // Only the admin APIs call this, so ADMIN_ENABLED=0 hides them all (lib/adminMode.js).
    if (!adminEnabled()) throw new ApiError("Not found", 404);

    const ip = await clientIp();
    if (!adminIpAllowed(ip)) throw new ApiError("Not found", 404);

    const actor = await loadActor(userPublicId);
    const needed = Array.isArray(permission) ? permission : [permission];

    if (!actor || !needed.every((p) => actor.permissions.has(p))) {
        await recordDenied(userPublicId, actor, needed, ip);
        throw new ApiError("You do not have permission to do this.", 403, { code: "FORBIDDEN" });
    }

    if (mfa && mfaRequiredFor(actor)) {
        const factor = await sessionFactor(actor);
        if (!factor?.mfa_verified_at) {
            throw new ApiError("Confirm with your authenticator app to continue.", 403, { code: "MFA_REQUIRED" });
        }
    }

    return actor;
}

/**
 * Sensitive actions (lock a user, change roles, sign someone out, refunds, balance changes, bulk
 * run closing): the session must have confirmed the second factor in the last 15 minutes.
 * @throws ApiError 403 REAUTH_REQUIRED (the admin screens ask for a code and retry)
 */
export async function requireRecentAuth(actor) {
    if (!mfaRequiredFor(actor)) return;
    const factor = await sessionFactor(actor);
    const at = factor?.reauth_at ? new Date(factor.reauth_at).getTime() : 0;
    if (at < Date.now() - REAUTH_WINDOW_MS) {
        throw new ApiError("Confirm with your authenticator app to continue.", 403, { code: "REAUTH_REQUIRED" });
    }
}
