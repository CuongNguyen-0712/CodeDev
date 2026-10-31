import { sql, dbPool } from "@/lib/db";

import { TOKEN } from "@/constants/auth";

/**
 * PostgreSQL is the source of truth for sessions and refresh-token history.
 *
 * Lock order is always: identity.sessions row, then identity.refresh_tokens rows. Every flow that
 * locks both (rotation, revocation) follows it, so they cannot deadlock each other.
 */

async function withTransaction(callback) {
    const client = await dbPool.connect();

    try {
        await client.query("BEGIN");
        const result = await callback(client);

        try {
            await client.query("COMMIT");
        } catch (error) {
            // The commit may or may not have been applied (e.g. connection lost before the ack).
            error.commitUncertain = true;
            throw error;
        }

        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => { });
        throw error;
    } finally {
        client.release();
    }
}

const SESSION_COLUMNS = `
    s.id::text AS session_id,
    u.public_id AS user_id,
    s.revoked_at,
    s.revoke_reason,
    s.idle_expires_at,
    s.absolute_expires_at
`;

/** Inserts the outbox row in the caller's transaction. */
async function enqueueOutbox(client, eventType, payload) {
    const res = await client.query(
        `INSERT INTO identity.auth_outbox (event_type, payload) VALUES ($1, $2::jsonb) RETURNING id::text;`,
        [eventType, JSON.stringify(payload)]
    );
    return res.rows[0].id;
}

export const sessionDb = {
    /** New session + its first refresh token, atomically. */
    createSession: async ({ sessionId, tokenId, userPublicId, tokenHash, userAgent, ip, idleTtlSec, absoluteTtlSec }) => {
        return withTransaction(async (client) => {
            const sessionRes = await client.query(
                `INSERT INTO identity.sessions (
                     id, user_id, user_agent, ip_address,
                     expires_at, absolute_expires_at, idle_expires_at,
                     last_seen_at, last_refreshed_at, created_at, updated_at
                 )
                 SELECT $1, u.id, $3, $4,
                        now() + make_interval(secs => $6),
                        now() + make_interval(secs => $6),
                        LEAST(now() + make_interval(secs => $5), now() + make_interval(secs => $6)),
                        now(), now(), now(), now()
                 FROM identity.users u
                 WHERE u.public_id = $2
                 RETURNING id::text AS session_id, idle_expires_at, absolute_expires_at;`,
                [sessionId, userPublicId, userAgent, ip, idleTtlSec, absoluteTtlSec]
            );

            const session = sessionRes.rows[0];
            if (!session) return null;

            await client.query(
                `INSERT INTO identity.refresh_tokens (id, session_id, refresh_token_hash, issued_at, expires_at, created_at)
                 VALUES ($1, $2, $3, now(), $4, now());`,
                [tokenId, sessionId, tokenHash, session.idle_expires_at]
            );

            return { ...session, user_id: userPublicId };
        });
    },

    /**
     * Atomic refresh-token rotation.
     *
     * 1. Resolve the session of the presented token, lock the session row, then the token row.
     * 2. Validate session (revoked / idle / absolute expiry) and token state.
     * 3. A consumed token is either an idempotent retry (same Idempotency-Key, still inside the
     *    recovery window, replacement still current) or a replay: replays revoke the session and
     *    every token of it, and enqueue the cache invalidation in the same transaction.
     * 4. Otherwise consume the token, insert its replacement, store the sealed recovery result
     *    and slide the idle expiry (never past the absolute expiry). One commit for all of it.
     *
     * `seal({ sessionId, tokenId })` returns the AEAD-sealed new token (computed inside, because
     * the AAD binds the consumed token id).
     */
    rotateRefreshToken: async ({ tokenHash, expectedSessionId, idempotencyKeyHash, newTokenId, newTokenHash, idleTtlSec, recoveryTtlSec, seal }) => {
        return withTransaction(async (client) => {
            const lookup = await client.query(
                `SELECT id::text, session_id::text FROM identity.refresh_tokens WHERE refresh_token_hash = $1;`,
                [tokenHash]
            );
            const found = lookup.rows[0];
            if (!found) return { status: TOKEN.INVALID };

            if (expectedSessionId && found.session_id !== String(expectedSessionId)) {
                return { status: TOKEN.SESSION_MISMATCH, sessionId: found.session_id };
            }

            const sessionRes = await client.query(
                `SELECT ${SESSION_COLUMNS}, now() AS db_now
                 FROM identity.sessions s
                 JOIN identity.users u ON u.id = s.user_id AND u.status = 'active'
                 WHERE s.id = $1
                 FOR UPDATE OF s;`,
                [found.session_id]
            );
            const session = sessionRes.rows[0];
            if (!session) return { status: TOKEN.INVALID };

            const tokenRes = await client.query(
                `SELECT id::text, consumed_at, revoked_at, expires_at, replaced_by_id::text,
                        recovery_key_hash, recovery_sealed, recovery_expires_at
                 FROM identity.refresh_tokens
                 WHERE id = $1
                 FOR UPDATE;`,
                [found.id]
            );
            const token = tokenRes.rows[0];
            const now = new Date(session.db_now).getTime();
            const base = { sessionId: session.session_id, userId: session.user_id };

            if (session.revoked_at) return { ...base, status: TOKEN.REVOKED };
            if (now >= new Date(session.absolute_expires_at).getTime() || now >= new Date(session.idle_expires_at).getTime()) {
                return { ...base, status: TOKEN.EXPIRED };
            }
            if (!token || token.revoked_at) return { ...base, status: TOKEN.REVOKED };

            if (token.consumed_at) {
                const isRetry = Boolean(
                    idempotencyKeyHash &&
                    token.recovery_key_hash === idempotencyKeyHash &&
                    token.recovery_sealed &&
                    token.recovery_expires_at &&
                    new Date(token.recovery_expires_at).getTime() > now
                );

                if (isRetry && token.replaced_by_id) {
                    const replacement = await client.query(
                        `SELECT id::text, expires_at FROM identity.refresh_tokens
                         WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL
                         FOR UPDATE;`,
                        [token.replaced_by_id]
                    );
                    if (replacement.rows[0]) {
                        return {
                            ...base,
                            status: TOKEN.RECOVERED,
                            consumedTokenId: token.id,
                            newTokenId: replacement.rows[0].id,
                            sealed: token.recovery_sealed,
                            refreshExpiresAt: replacement.rows[0].expires_at,
                            idleExpiresAt: session.idle_expires_at,
                            absoluteExpiresAt: session.absolute_expires_at,
                        };
                    }
                }

                // Replay of a consumed token: assume theft, end the whole token family.
                await client.query(
                    `UPDATE identity.sessions
                     SET revoked_at = now(), is_revoked = TRUE, revoke_reason = 'refresh_token_reuse', updated_at = now()
                     WHERE id = $1;`,
                    [session.session_id]
                );
                await client.query(
                    `UPDATE identity.refresh_tokens
                     SET revoked_at = now(), recovery_sealed = NULL, recovery_key_hash = NULL, recovery_expires_at = NULL
                     WHERE session_id = $1 AND revoked_at IS NULL;`,
                    [session.session_id]
                );
                const outboxId = await enqueueOutbox(client, "session.revoked", {
                    sessionIds: [session.session_id],
                    userId: session.user_id,
                    reason: "refresh_token_reuse",
                });

                return { ...base, status: TOKEN.REUSED, outboxId };
            }

            if (now >= new Date(token.expires_at).getTime()) return { ...base, status: TOKEN.EXPIRED };

            const sealed = idempotencyKeyHash ? seal({ sessionId: session.session_id, tokenId: token.id }) : null;

            await client.query(
                `UPDATE identity.refresh_tokens
                 SET consumed_at = now(),
                     rotated_at = now(),
                     replaced_by_id = $2,
                     rotated_to_token_id = $2,
                     recovery_key_hash = $3,
                     recovery_sealed = $4,
                     recovery_expires_at = CASE WHEN $4::text IS NULL THEN NULL ELSE now() + make_interval(secs => $5) END
                 WHERE id = $1;`,
                [token.id, newTokenId, sealed ? idempotencyKeyHash : null, sealed, recoveryTtlSec]
            );

            const updatedSession = await client.query(
                `UPDATE identity.sessions
                 SET idle_expires_at = LEAST(now() + make_interval(secs => $2), absolute_expires_at),
                     last_refreshed_at = now(),
                     last_seen_at = now(),
                     updated_at = now()
                 WHERE id = $1
                 RETURNING idle_expires_at, absolute_expires_at;`,
                [session.session_id, idleTtlSec]
            );
            const { idle_expires_at: idleExpiresAt, absolute_expires_at: absoluteExpiresAt } = updatedSession.rows[0];

            // The partial unique index guarantees this is the only current token of the session.
            await client.query(
                `INSERT INTO identity.refresh_tokens (id, session_id, refresh_token_hash, issued_at, expires_at, created_at)
                 VALUES ($1, $2, $3, now(), $4, now());`,
                [newTokenId, session.session_id, newTokenHash, idleExpiresAt]
            );

            return {
                ...base,
                status: TOKEN.REFRESH,
                consumedTokenId: token.id,
                newTokenId: String(newTokenId),
                refreshExpiresAt: idleExpiresAt,
                idleExpiresAt,
                absoluteExpiresAt,
            };
        });
    },

    getSessionState: async ({ sessionId }) => {
        const res = await sql(
            `SELECT ${SESSION_COLUMNS}
             FROM identity.sessions s
             JOIN identity.users u ON u.id = s.user_id AND u.status = 'active'
             WHERE s.id = $1;`,
            [sessionId]
        );
        // A blocked / inactive user's sessions read as missing, i.e. not active.
        return res.rows[0] || null;
    },

    listSessions: async ({ userPublicId }) => {
        const res = await sql(
            `SELECT
                 s.id::text AS session_id,
                 s.user_agent,
                 s.ip_address,
                 s.created_at,
                 COALESCE(s.last_seen_at, s.updated_at) AS last_seen_at,
                 s.idle_expires_at,
                 s.absolute_expires_at
             FROM identity.sessions s
             WHERE s.user_id = (SELECT id FROM identity.users WHERE public_id = $1)
               AND s.revoked_at IS NULL
               AND s.idle_expires_at > now()
               AND s.absolute_expires_at > now()
             ORDER BY COALESCE(s.last_seen_at, s.updated_at) DESC
             LIMIT 50;`,
            [userPublicId]
        );
        return res.rows;
    },

    /**
     * Revokes sessions of one user (all of them, a list, or all except one), their refresh
     * tokens, and enqueues the cache invalidation — one transaction.
     */
    revokeSessions: async (args) => withTransaction((client) => sessionDb.revokeSessionsTx(client, args)),

    /** revokeSessions inside the caller's transaction (e.g. a link confirmed by email). */
    revokeSessionsTx: async (client, { userPublicId, sessionIds = null, exceptSessionId = null, reason }) => {
        const res = await client.query(
            `UPDATE identity.sessions s
             SET revoked_at = now(), is_revoked = TRUE, revoke_reason = $4, updated_at = now()
             WHERE s.user_id = (SELECT id FROM identity.users WHERE public_id = $1)
               AND s.revoked_at IS NULL
               AND ($2::bigint[] IS NULL OR s.id = ANY($2::bigint[]))
               AND ($3::bigint IS NULL OR s.id <> $3::bigint)
             RETURNING s.id::text AS session_id;`,
            [userPublicId, sessionIds, exceptSessionId, reason]
        );
        const revoked = res.rows.map((row) => row.session_id);
        if (revoked.length === 0) return { sessionIds: [], outboxId: null };

        await client.query(
            `UPDATE identity.refresh_tokens
             SET revoked_at = now(), recovery_sealed = NULL, recovery_key_hash = NULL, recovery_expires_at = NULL
             WHERE session_id = ANY($1::bigint[]) AND revoked_at IS NULL;`,
            [revoked]
        );

        const outboxId = await enqueueOutbox(client, "session.revoked", { sessionIds: revoked, userId: userPublicId, reason });

        return { sessionIds: revoked, outboxId };
    },

    // ---------------------------------------------------------------- outbox

    /**
     * Claims due events with a lease: `available_at` moves forward, so a crashed worker's events
     * become visible again after `leaseSec`. SKIP LOCKED lets several instances share the queue.
     * The lease outlasts the slowest handler (SMTP gives up after ~40s), so a slow send is never
     * claimed and sent a second time. `eventTypes` limits the claim to those types.
     */
    claimOutbox: async ({ limit = 50, leaseSec = 120, ids = null, eventTypes = null } = {}) => {
        const res = await sql(
            `WITH due AS (
                 SELECT id FROM identity.auth_outbox
                 WHERE processed_at IS NULL
                   AND dead_at IS NULL
                   AND available_at <= now()
                   AND ($3::bigint[] IS NULL OR id = ANY($3::bigint[]))
                   AND ($4::text[] IS NULL OR event_type = ANY($4::text[]))
                 ORDER BY id
                 LIMIT $1
                 FOR UPDATE SKIP LOCKED
             )
             UPDATE identity.auth_outbox o
             SET attempts = o.attempts + 1, available_at = now() + make_interval(secs => $2)
             FROM due
             WHERE o.id = due.id
             RETURNING o.id::text, o.event_type, o.payload, o.attempts, o.max_attempts;`,
            [limit, leaseSec, ids, eventTypes]
        );
        return res.rows;
    },

    completeOutbox: async ({ id }) => {
        await sql(`UPDATE identity.auth_outbox SET processed_at = now(), last_error = NULL WHERE id = $1;`, [id]);
    },

    /** Records a failure and schedules the retry; an event out of attempts is marked dead instead. */
    failOutbox: async ({ id, error, retryInSec }) => {
        const res = await sql(
            `UPDATE identity.auth_outbox
             SET last_error = left($2, 500),
                 available_at = now() + make_interval(secs => $3),
                 dead_at = CASE WHEN attempts >= max_attempts THEN now() END
             WHERE id = $1
             RETURNING dead_at IS NOT NULL AS dead;`,
            [id, String(error || "unknown error"), retryInSec]
        );
        return { dead: Boolean(res.rows[0]?.dead) };
    },

    /** Gives up on an event (a permanent error, or the queue ran out of retries). */
    killOutbox: async ({ id, error }) => {
        await sql(
            `UPDATE identity.auth_outbox SET dead_at = now(), last_error = left($2, 500)
             WHERE id = $1 AND processed_at IS NULL AND dead_at IS NULL;`,
            [id, String(error || "unknown error")]
        );
    },

    outboxState: async ({ id }) => {
        const res = await sql(
            `SELECT event_type, payload, attempts, processed_at, dead_at, available_at FROM identity.auth_outbox WHERE id = $1;`,
            [id]
        );
        return res.rows[0] || null;
    },

    markOutboxPublished: async ({ ids }) => {
        await sql(`UPDATE identity.auth_outbox SET published_at = now() WHERE id = ANY($1::bigint[]);`, [ids]);
    },

    /** Pending events whose Inngest event never went out, or went out long ago without a result. */
    listStaleOutbox: async ({ olderThanMin = 15, limit = 100 } = {}) => {
        const res = await sql(
            `SELECT id::text FROM identity.auth_outbox
             WHERE processed_at IS NULL AND dead_at IS NULL
               AND created_at < now() - interval '1 minute'
               AND (published_at IS NULL OR published_at < now() - make_interval(mins => $1))
             ORDER BY id LIMIT $2;`,
            [olderThanMin, limit]
        );
        return res.rows.map((r) => r.id);
    },

    /** Drops expired recovery blobs and old processed outbox rows. Token history is kept. */
    cleanup: async ({ outboxRetentionDays = 7 } = {}) => {
        const recovery = await sql(
            `UPDATE identity.refresh_tokens
             SET recovery_sealed = NULL, recovery_key_hash = NULL, recovery_expires_at = NULL
             WHERE recovery_expires_at IS NOT NULL AND recovery_expires_at <= now();`
        );
        const outbox = await sql(
            `DELETE FROM identity.auth_outbox
             WHERE processed_at IS NOT NULL AND processed_at < now() - make_interval(days => $1);`,
            [outboxRetentionDays]
        );
        return { recoveryCleared: recovery.rowCount, outboxDeleted: outbox.rowCount };
    },
};

export default sessionDb;
