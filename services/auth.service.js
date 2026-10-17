import { userDb } from "@/db/user.db";
import { sessionDb } from "@/db/session.db";
import bycrypt from "bcryptjs";
import { ApiError } from "@/lib/error/apiError";
import { generateSonyflake } from "@/lib/sonyflake";
import {
    hashRefreshToken,
    hashIdempotencyKey,
    generateRefreshToken,
    sealRecovery,
    openRecovery,
    recoveryContext,
} from "@/lib/auth.util";
import { ulid } from "ulid";
import { TOKEN, AUTH_ERROR } from "@/constants/auth";
import { AUTH } from "@/lib/authConfig";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { auditAuth } from "@/lib/authAudit";
import { processAuthOutbox, ensureAuthOutboxWorker } from "@/services/authOutbox.service";

// Revoked / expired sessions are remembered briefly to spare PostgreSQL repeated lookups.
const INACTIVE_CACHE_TTL_SEC = 60;

ensureAuthOutboxWorker();

const toMs = (value) => (value ? new Date(value).getTime() : 0);

/**
 * Redis session cache: `session:{sessionId}` -> { sessionId, userId, status, idleExpiresAt,
 * absoluteExpiresAt }. Written only after PostgreSQL committed. The TTL never outlives the
 * session and is capped (AUTH_SESSION_CACHE_MAX_TTL_SECONDS) so PostgreSQL is re-read regularly.
 * Best effort: a failed write only costs a PostgreSQL lookup later.
 */
async function cacheActiveSession({ sessionId, userId, idleExpiresAt, absoluteExpiresAt }) {
    const endsAt = Math.min(toMs(idleExpiresAt), toMs(absoluteExpiresAt));
    const remaining = Math.floor((endsAt - Date.now()) / 1000);
    if (remaining <= 0) return;

    await redis.set(cacheKeys.session(sessionId), {
        sessionId: String(sessionId),
        userId,
        status: "active",
        idleExpiresAt: toMs(idleExpiresAt),
        absoluteExpiresAt: toMs(absoluteExpiresAt),
    }, { ex: Math.min(remaining, AUTH.SESSION_CACHE_MAX_TTL_SEC) });
}

async function cacheInactiveSession(sessionId) {
    await redis.set(cacheKeys.session(sessionId), { sessionId: String(sessionId), status: "inactive" }, { ex: INACTIVE_CACHE_TTL_SEC });
}

/** Cache invalidation for a revocation that just committed; the outbox worker retries failures. */
async function dispatchOutbox(outboxId) {
    if (!outboxId) return;
    await processAuthOutbox({ ids: [outboxId], limit: 1 });
}

const FAILURE = {
    [TOKEN.INVALID]: { code: AUTH_ERROR.REFRESH_TOKEN_INVALID, message: "Your session is no longer valid. Please sign in again." },
    [TOKEN.EXPIRED]: { code: AUTH_ERROR.REFRESH_TOKEN_EXPIRED, message: "Your session has expired. Please sign in again." },
    [TOKEN.REVOKED]: { code: AUTH_ERROR.SESSION_REVOKED, message: "This session was signed out. Please sign in again." },
    [TOKEN.REUSED]: { code: AUTH_ERROR.REFRESH_TOKEN_REUSED, message: "This session was signed out for your security. Please sign in again." },
    [TOKEN.SESSION_MISMATCH]: { code: AUTH_ERROR.SESSION_MISMATCH, message: "Your session is no longer valid. Please sign in again." },
};

function describeUserAgent(userAgent) {
    const ua = String(userAgent || "");
    if (!ua) return { browser: "Unknown browser", os: "Unknown device" };

    const browser =
        /Edg\//.test(ua) ? "Edge" :
            /OPR\/|Opera/.test(ua) ? "Opera" :
                /Firefox\//.test(ua) ? "Firefox" :
                    /Chrome\//.test(ua) ? "Chrome" :
                        /Safari\//.test(ua) ? "Safari" : "Browser";

    const os =
        /Windows/.test(ua) ? "Windows" :
            /Android/.test(ua) ? "Android" :
                /iPhone|iPad|iPod/.test(ua) ? "iOS" :
                    /Mac OS X/.test(ua) ? "macOS" :
                        /Linux/.test(ua) ? "Linux" : "Unknown device";

    return { browser, os };
}

export const authService = {
    login: async (data) => {
        const { username, password, userAgent = null, ip = null } = data;

        const response = await userDb.login({ username });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Invalid credentials, try again", 401);
        }

        const user = response.rows[0];

        const isValid = await bycrypt.compare(password, user.password);

        if (!isValid) {
            throw new ApiError("Invalid credentials, try again", 401);
        }

        delete user.password;

        const permissions = await userDb.getPermissions({ userId: user.id });

        if (!permissions || permissions.rowCount === 0) {
            throw new ApiError("No permissions found for the user", 403);
        }

        user.permissions = permissions.rows.map(p => p.permissions);
        user.session = await authService.createSession({ userId: user.id, userAgent, ip });

        return user;
    },

    signUpWithProvider: async (data) => {
        const { userAgent = null, ip = null, ...profile } = data;
        const id = generateSonyflake();
        const public_id = ulid();

        const response = await userDb.signUpWithProvider({ ...profile, id, public_id });

        if (!response || response.rowCount === 0) {
            throw new ApiError("Authentication failed, try again", 500);
        }

        const user = response.rows[0];

        const permissions = await userDb.getPermissions({ userId: user.id });

        if (!permissions || permissions.rowCount === 0) {
            throw new ApiError("No permissions found for the user", 403);
        }

        user.permissions = permissions.rows.map(p => p.permissions);
        user.session = await authService.createSession({ userId: user.id, userAgent, ip });

        return user;
    },

    /**
     * Login: PostgreSQL commit first (session + first refresh token), then Redis.
     * @returns {{ sessionId, refreshToken, refreshExpiresAt, absoluteExpiresAt }} — the refresh
     *   token goes straight into the HttpOnly cookie and nowhere else.
     */
    createSession: async ({ userId, userAgent = null, ip = null }) => {
        const sessionId = String(generateSonyflake());
        const tokenId = String(generateSonyflake());
        const refreshToken = generateRefreshToken();

        const created = await sessionDb.createSession({
            sessionId,
            tokenId,
            userPublicId: userId,
            tokenHash: hashRefreshToken(refreshToken),
            userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
            ip: ip ? String(ip).slice(0, 64) : null,
            idleTtlSec: AUTH.SESSION_IDLE_TTL_SEC,
            absoluteTtlSec: AUTH.SESSION_ABSOLUTE_TTL_SEC,
        });

        if (!created) {
            throw new ApiError("Failed to create session, try again", 500);
        }

        await cacheActiveSession({
            sessionId,
            userId,
            idleExpiresAt: created.idle_expires_at,
            absoluteExpiresAt: created.absolute_expires_at,
        }).catch(() => { });

        auditAuth("session.created", { userId, sessionId, ip });

        return {
            sessionId,
            refreshToken,
            refreshExpiresAt: toMs(created.idle_expires_at),
            absoluteExpiresAt: toMs(created.absolute_expires_at),
        };
    },

    /**
     * Refresh-token rotation (see sessionDb.rotateRefreshToken for the transaction).
     * Redis is only updated after the commit, and a Redis failure never fails the refresh.
     *
     * @returns {Promise<
     *   { ok: true, status, sessionId, userId, refreshToken, refreshExpiresAt, absoluteExpiresAt } |
     *   { ok: false, status, code, message }
     * >}
     */
    rotateRefreshToken: async ({ refreshToken, idempotencyKey, expectedSessionId, ip = null }) => {
        const newRefreshToken = generateRefreshToken();
        const keyHash = hashIdempotencyKey(idempotencyKey);

        const result = await sessionDb.rotateRefreshToken({
            tokenHash: hashRefreshToken(refreshToken),
            expectedSessionId,
            idempotencyKeyHash: keyHash,
            newTokenId: String(generateSonyflake()),
            newTokenHash: hashRefreshToken(newRefreshToken),
            idleTtlSec: AUTH.SESSION_IDLE_TTL_SEC,
            recoveryTtlSec: AUTH.REFRESH_RECOVERY_TTL_SEC,
            seal: ({ sessionId, tokenId }) => sealRecovery(newRefreshToken, recoveryContext({ sessionId, tokenId, keyHash })),
        });

        if (result.status === TOKEN.REFRESH || result.status === TOKEN.RECOVERED) {
            const issued = result.status === TOKEN.REFRESH
                ? newRefreshToken
                : openRecovery(result.sealed, recoveryContext({ sessionId: result.sessionId, tokenId: result.consumedTokenId, keyHash }));

            if (!issued) {
                // Sealed with a key that is no longer configured: cannot recover, do not revoke.
                auditAuth("session.refresh.failed", { userId: result.userId, sessionId: result.sessionId, ip, reason: "recovery_unreadable" });
                return { ok: false, status: TOKEN.INVALID, ...FAILURE[TOKEN.INVALID] };
            }

            await cacheActiveSession({
                sessionId: result.sessionId,
                userId: result.userId,
                idleExpiresAt: result.idleExpiresAt,
                absoluteExpiresAt: result.absoluteExpiresAt,
            }).catch(() => { });

            auditAuth(result.status === TOKEN.REFRESH ? "session.refreshed" : "session.refresh.recovered", {
                userId: result.userId,
                sessionId: result.sessionId,
                ip,
            });

            return {
                ok: true,
                status: result.status,
                sessionId: result.sessionId,
                userId: result.userId,
                refreshToken: issued,
                refreshExpiresAt: toMs(result.refreshExpiresAt),
                absoluteExpiresAt: toMs(result.absoluteExpiresAt),
            };
        }

        if (result.status === TOKEN.REUSED) {
            auditAuth("session.refresh.reuse_detected", { userId: result.userId, sessionId: result.sessionId, ip, outboxId: result.outboxId });
            await dispatchOutbox(result.outboxId);
        } else {
            auditAuth("session.refresh.failed", { userId: result.userId, sessionId: result.sessionId, ip, reason: result.status });
            if (result.sessionId && [TOKEN.REVOKED, TOKEN.EXPIRED].includes(result.status)) {
                await cacheInactiveSession(result.sessionId).catch(() => { });
            }
        }

        return { ok: false, status: result.status, ...(FAILURE[result.status] || FAILURE[TOKEN.INVALID]) };
    },

    logout: async ({ userId, sessionId }) => {
        const result = await sessionDb.revokeSessions({ userPublicId: userId, sessionIds: [String(sessionId)], reason: "logout" });
        auditAuth("session.logout", { userId, sessionId, count: result.sessionIds.length });
        await dispatchOutbox(result.outboxId);
        return result.sessionIds.length > 0;
    },

    revokeSession: async ({ userId, sessionId }) => {
        const result = await sessionDb.revokeSessions({ userPublicId: userId, sessionIds: [String(sessionId)], reason: "user_revoked" });

        if (result.sessionIds.length === 0) {
            throw new ApiError("Session not found or already signed out", 404);
        }

        auditAuth("session.revoked", { userId, sessionId, reason: "user_revoked" });
        await dispatchOutbox(result.outboxId);
        return true;
    },

    revokeOtherSessions: async ({ userId, currentSessionId }) => {
        const result = await sessionDb.revokeSessions({ userPublicId: userId, exceptSessionId: String(currentSessionId), reason: "user_revoked_others" });
        auditAuth("session.revoked_others", { userId, sessionId: currentSessionId, count: result.sessionIds.length });
        await dispatchOutbox(result.outboxId);
        return result.sessionIds.length;
    },

    revokeAllSessions: async ({ userId }) => {
        const result = await sessionDb.revokeSessions({ userPublicId: userId, reason: "user_revoked_all" });
        auditAuth("session.revoked_all", { userId, count: result.sessionIds.length });
        await dispatchOutbox(result.outboxId);
        return result.sessionIds.length;
    },

    /**
     * @returns {Promise<object|null>} the active session, or null when revoked / expired / unknown.
     * @throws ApiError(503, AUTH_UNAVAILABLE) when PostgreSQL cannot answer and Redis has no entry:
     *   an outage is reported as such, never as "signed out".
     */
    getSessionStatus: async (sessionId) => {
        if (!sessionId) return null;

        // redis.get never throws: when Redis is down it answers from the in-process fallback.
        const cached = await redis.get(cacheKeys.session(sessionId));
        if (cached?.status === "inactive") return null;
        if (cached?.status === "active") {
            const endsAt = Math.min(Number(cached.idleExpiresAt) || 0, Number(cached.absoluteExpiresAt) || 0);
            if (endsAt > Date.now()) return cached;
        }

        let row;
        try {
            row = await sessionDb.getSessionState({ sessionId });
        } catch (error) {
            console.error("[Session] PostgreSQL session lookup failed:", error?.message);
            throw new ApiError("Authentication is temporarily unavailable, please try again shortly.", 503, {
                code: AUTH_ERROR.AUTH_UNAVAILABLE,
                expose: true,
                retryAfter: 5,
            });
        }

        const now = Date.now();
        if (!row || row.revoked_at || toMs(row.idle_expires_at) <= now || toMs(row.absolute_expires_at) <= now) {
            await cacheInactiveSession(sessionId).catch(() => { });
            return null;
        }

        const active = {
            sessionId: row.session_id,
            userId: row.user_id,
            status: "active",
            idleExpiresAt: toMs(row.idle_expires_at),
            absoluteExpiresAt: toMs(row.absolute_expires_at),
        };

        await cacheActiveSession(active).catch(() => { });
        return active;
    },

    listSessions: async ({ userId, currentSessionId }) => {
        const rows = await sessionDb.listSessions({ userPublicId: userId });

        return rows.map((row) => ({
            id: row.session_id,
            ...describeUserAgent(row.user_agent),
            createdAt: row.created_at,
            lastActiveAt: row.last_seen_at,
            expiresAt: new Date(Math.min(toMs(row.idle_expires_at), toMs(row.absolute_expires_at))).toISOString(),
            current: String(row.session_id) === String(currentSessionId),
        }));
    },
};

export default authService;
