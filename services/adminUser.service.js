import { adminDb } from "@/db/admin.db";
import { adminUserDb, USER_TABS } from "@/db/adminUser.db";
import { withTransaction } from "@/lib/dbTransaction";
import { actorCan } from "@/lib/authz";
import { ApiError } from "@/lib/error/apiError";
import { authService } from "@/services/auth.service";

/**
 * Admin user management (docs/admin-panel-plan.md 02 and 3.5). The caller passed
 * requirePermission; this layer enforces what a permission alone cannot:
 *   - only users of a lower rank can be locked, signed out or have roles changed (a super admin
 *     may manage another super admin's roles);
 *   - only roles of a lower rank can be assigned, except by a super admin;
 *   - nobody acts on themselves, and the last active super admin keeps the role;
 *   - emails, IP addresses and user agents are masked without user.pii.
 * Every change and its identity.audit_log row commit in one transaction.
 */

const SUPER_ADMIN_RANK = 100;
const forbidden = (message) => new ApiError(message, 403, { code: "FORBIDDEN" });

export const maskEmail = (email) => {
    const [local = "", domain = ""] = String(email || "").split("@");
    return domain ? `${local.slice(0, 1)}***@${domain}` : "***";
};

const masker = (actor) => {
    const pii = actorCan(actor, "user.pii");
    return {
        email: (value) => (pii ? value : maskEmail(value)),
        private: (value) => (pii ? value : value ? "hidden" : null),
    };
};

function decodeCursor(raw) {
    if (!raw) return null;
    try {
        const [createdAt, id] = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf-8"));
        if (/^\d{4}-\d{2}-\d{2}[ T][\d:.]{8,15}$/.test(createdAt) && /^\d{1,19}$/.test(id)) return { createdAt, id };
    } catch {
        // fall through
    }
    throw new ApiError("Invalid cursor", 400);
}

/** Rank rules on a locked target row. */
function assertCanManage(actor, target, { allowSameRankSuper = false } = {}) {
    if (target.public_id === actor.publicId) throw forbidden("You cannot change your own account here.");
    const rank = Number(target.rank);
    const sameRankSuper = allowSameRankSuper && actor.rank === SUPER_ADMIN_RANK && rank === SUPER_ADMIN_RANK;
    if (rank >= actor.rank && !sameRankSuper) throw forbidden("This account has the same or a higher role than yours.");
}

async function auditUser(client, actor, target, { action, reason, before, after, ip }) {
    await adminDb.audit(client, { actorId: actor.id, action, targetType: "user", targetId: target.public_id, reason, before, after, ip });
}

const statusView = (row) => ({ status: row.status, until: row.status_until, reason: row.status_reason });

export const adminUserService = {
    tabs: USER_TABS,

    list: async ({ actor, tab, search, role, cursor, limit = 50 }) => {
        const mask = masker(actor);
        const [{ rows }, counts] = await Promise.all([
            adminUserDb.list({ tab, search, role, cursor: decodeCursor(cursor), limit: limit + 1 }),
            adminUserDb.tabCounts(),
        ]);
        const page = rows.slice(0, limit);
        const last = page[page.length - 1];
        return {
            items: page.map(({ cursor_at, cursor_id, ...row }) => ({ ...row, email: mask.email(row.email) })),
            nextCursor: rows.length > limit ? Buffer.from(JSON.stringify([last.cursor_at, last.cursor_id])).toString("base64url") : null,
            counts,
        };
    },

    detail: async ({ actor, userId }) => {
        const user = await adminUserDb.detail({ userId });
        if (!user) throw new ApiError("User not found", 404);
        const mask = masker(actor);
        const [sessions, enrollments, roles] = await Promise.all([
            adminUserDb.sessions({ userId }),
            adminUserDb.enrollments({ userId }),
            adminUserDb.roles(),
        ]);
        const targetRank = Math.max(0, ...user.roles.map((role) => Number(role.rank)));
        const isSelf = user.id === actor.publicId;
        const canManage = !isSelf && (targetRank < actor.rank || (actor.rank === SUPER_ADMIN_RANK && targetRank === SUPER_ADMIN_RANK));

        return {
            ...user,
            email: mask.email(user.email),
            points: Number(user.points),
            exp: Number(user.exp),
            sessions: sessions.rows.map((row) => ({ ...row, ip_address: mask.private(row.ip_address), user_agent: mask.private(row.user_agent) })),
            enrollments: enrollments.rows,
            // Which roles this viewer may assign or remove, and why not, so the screen can say so.
            assignableRoles: roles.rows.map((role) => {
                const rank = Number(role.rank);
                let reason = null;
                if (isSelf) reason = "You cannot change your own roles.";
                else if (!canManage) reason = "This account has the same or a higher role than yours.";
                else if (rank >= actor.rank && actor.rank !== SUPER_ADMIN_RANK) reason = "Requires a higher role than yours.";
                return { code: role.code, name: role.name, rank, allowed: reason === null, reason };
            }),
            permissions: {
                canChangeStatus: canManage && targetRank < actor.rank,
                canRevokeSessions: canManage && targetRank < actor.rank,
                isSelf,
            },
        };
    },

    activity: async ({ actor, userId, kinds, before }) => {
        if (before && Number.isNaN(Date.parse(before))) throw new ApiError("Invalid cursor", 400);
        const { rows } = await adminUserDb.activity({ userId, kinds, before, limit: 31 });
        const mask = masker(actor);
        const page = rows.slice(0, 30);
        return {
            items: page.map((row) => (row.kind === "session" ? { ...row, detail: mask.private(row.detail) } : row)),
            nextBefore: rows.length > 30 ? page[page.length - 1].at : null,
        };
    },

    /** status: active | suspended (needs until) | blocked. */
    setStatus: async ({ actor, userId, status, until = null, reason, ip = null }) => {
        const result = await withTransaction(async (client) => {
            const target = await adminUserDb.lockUser(client, userId);
            if (!target) throw new ApiError("User not found", 404);
            assertCanManage(actor, target);

            const next = status === "active"
                ? { status: "active", until: null, reason: null }
                : { status: "blocked", until: status === "suspended" ? until : null, reason };
            if (status === "suspended" && (!until || new Date(until) <= new Date())) {
                throw new ApiError("A suspension needs an end date in the future", 422);
            }

            await adminUserDb.setStatus(client, { dbId: target.db_id, ...next });
            await auditUser(client, actor, target, {
                action: `user.${status === "active" ? "activate" : status}`,
                reason,
                before: statusView(target),
                after: { status: next.status, until: next.until, reason: next.reason },
                ip,
            });
            return { id: target.public_id, state: status, until: next.until };
        });

        // After commit: a locked account loses every session (refresh already stops on status).
        if (status !== "active") await authService.revokeAllSessions({ userId });
        return result;
    },

    changeRole: async ({ actor, userId, role: roleCode, add, reason, ip = null }) => {
        const result = await withTransaction(async (client) => {
            const target = await adminUserDb.lockUser(client, userId);
            if (!target) throw new ApiError("User not found", 404);
            assertCanManage(actor, target, { allowSameRankSuper: true });

            const role = await adminUserDb.findRole(client, roleCode);
            if (!role) throw new ApiError("Unknown role", 422);
            if (Number(role.rank) >= actor.rank && actor.rank !== SUPER_ADMIN_RANK) {
                throw forbidden("Only a higher role can assign or remove this role.");
            }

            if (!add && role.code === "super_admin") {
                const supers = await adminUserDb.lockActiveSuperAdmins(client);
                if (supers.length <= 1 && supers.includes(target.public_id)) {
                    throw new ApiError("The last active super admin keeps the role.", 409, { code: "LAST_SUPER_ADMIN" });
                }
            }

            if (add) await adminUserDb.addRole(client, { dbId: target.db_id, roleId: role.id });
            else await adminUserDb.removeRole(client, { dbId: target.db_id, roleId: role.id });

            const after = add ? [...new Set([...target.roles, role.code])] : target.roles.filter((code) => code !== role.code);
            await auditUser(client, actor, target, {
                action: add ? "role.grant" : "role.revoke",
                reason,
                before: { roles: target.roles },
                after: { roles: after },
                ip,
            });
            return { id: target.public_id, roles: after };
        });

        // Permissions are read from the database per request; ending the sessions also drops the
        // permission list cached in old JWTs (page navigation guard).
        await authService.revokeAllSessions({ userId });
        return result;
    },

    revokeSessions: async ({ actor, userId, reason, ip = null }) => {
        await withTransaction(async (client) => {
            const target = await adminUserDb.lockUser(client, userId);
            if (!target) throw new ApiError("User not found", 404);
            assertCanManage(actor, target);
            await auditUser(client, actor, target, { action: "session.revoke_all", reason, ip });
        });
        const count = await authService.revokeAllSessions({ userId });
        return { revoked: count };
    },

    /** Sweeper: suspensions whose end passed become active again (audited with no actor). */
    liftEndedSuspensions: async () => withTransaction(async (client) => {
        const { rows } = await adminUserDb.liftEndedSuspensions(client);
        for (const row of rows) {
            await adminDb.audit(client, { actorId: null, action: "user.suspension_ended", targetType: "user", targetId: row.public_id, reason: "suspension ended" });
        }
        return rows.length;
    }),
};
