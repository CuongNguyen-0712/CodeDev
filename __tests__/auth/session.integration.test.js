import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Integration tests against the real PostgreSQL in DATABASE_URL (migration
 * 20261016_001_auth_session_hardening applied). They create sessions for an existing user,
 * tagged with a dedicated user agent, and delete them afterwards. Redis is disabled
 * (in-memory fallback), Pusher is not configured.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = "vitest-auth-integration";

describe.skipIf(!hasDb)("session lifecycle (PostgreSQL)", () => {
    let sql;
    let authService;
    let sessionDb;
    let processAuthOutbox;
    let redis;
    let hashRefreshToken;
    let userId;
    const created = [];

    const one = async (text, params) => (await sql(text, params)).rows[0];

    const tokensOf = async (sessionId) => (await sql(
        `SELECT id::text, refresh_token_hash, consumed_at, revoked_at, replaced_by_id::text, recovery_sealed
         FROM identity.refresh_tokens WHERE session_id = $1 ORDER BY issued_at, id`,
        [sessionId]
    )).rows;

    const currentTokens = async (sessionId) => (await one(
        `SELECT COUNT(*)::int AS n FROM identity.refresh_tokens WHERE session_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
        [sessionId]
    )).n;

    const newSession = async () => {
        const session = await authService.createSession({ userId, userAgent: TAG });
        created.push(session.sessionId);
        return session;
    };

    const rotate = (refreshToken, idempotencyKey, expectedSessionId) =>
        authService.rotateRefreshToken({ refreshToken, idempotencyKey, expectedSessionId });

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ authService } = await import("@/services/auth.service"));
        ({ sessionDb } = await import("@/db/session.db"));
        ({ processAuthOutbox } = await import("@/services/authOutbox.service"));
        ({ redis } = await import("@/lib/cache"));
        ({ hashRefreshToken } = await import("@/lib/auth.util"));
        userId = (await one(`SELECT public_id FROM identity.users ORDER BY id LIMIT 1`)).public_id;
    });

    afterAll(async () => {
        if (!sql || created.length === 0) return;
        await sql(`DELETE FROM identity.auth_outbox WHERE payload->'sessionIds' ?| $1::text[]`, [created]);
        await sql(`DELETE FROM identity.sessions WHERE user_agent = $1`, [TAG]);
    });

    it("login creates one session with exactly one current token, stored only as a hash", async () => {
        const { sessionId, refreshToken } = await newSession();
        const rows = await tokensOf(sessionId);
        expect(rows).toHaveLength(1);
        expect(rows[0].refresh_token_hash).toBe(hashRefreshToken(refreshToken));
        expect(JSON.stringify(rows)).not.toContain(refreshToken);

        const session = await one(`SELECT idle_expires_at, absolute_expires_at, revoked_at FROM identity.sessions WHERE id = $1`, [sessionId]);
        expect(session.revoked_at).toBeNull();
        expect(new Date(session.idle_expires_at) <= new Date(session.absolute_expires_at)).toBe(true);
    });

    it("refresh consumes the old token, links the new one and keeps the session id", async () => {
        const { sessionId, refreshToken } = await newSession();
        const result = await rotate(refreshToken, "key-rotate-0000001", sessionId);

        expect(result).toMatchObject({ ok: true, status: "REFRESH", sessionId });
        expect(result.refreshToken).not.toBe(refreshToken);

        const [old, fresh] = await tokensOf(sessionId);
        expect(old.consumed_at).not.toBeNull();
        expect(old.replaced_by_id).toBe(fresh.id);
        expect(old.recovery_sealed).not.toContain(result.refreshToken);
        expect(fresh.consumed_at).toBeNull();
        expect(await currentTokens(sessionId)).toBe(1);

        // The new token works under the normal policy.
        const next = await rotate(result.refreshToken, "key-rotate-0000002", sessionId);
        expect(next).toMatchObject({ ok: true, status: "REFRESH" });
        expect(await currentTokens(sessionId)).toBe(1);
    });

    it("a lost response is recovered by retrying with the same Idempotency-Key", async () => {
        const { sessionId, refreshToken } = await newSession();
        const first = await rotate(refreshToken, "key-lost-000000001", sessionId);
        const retry = await rotate(refreshToken, "key-lost-000000001", sessionId);

        expect(retry).toMatchObject({ ok: true, status: "RECOVERED", refreshToken: first.refreshToken });
        expect(await currentTokens(sessionId)).toBe(1);
        expect((await tokensOf(sessionId))).toHaveLength(2);
    });

    it("replaying a consumed token with another key revokes the whole session", async () => {
        const { sessionId, refreshToken } = await newSession();
        const first = await rotate(refreshToken, "key-replay-0000001", sessionId);
        const replay = await rotate(refreshToken, "key-replay-0000002", sessionId);

        expect(replay).toMatchObject({ ok: false, status: "REUSED", code: "REFRESH_TOKEN_REUSED" });

        const session = await one(`SELECT revoked_at, revoke_reason FROM identity.sessions WHERE id = $1`, [sessionId]);
        expect(session.revoked_at).not.toBeNull();
        expect(session.revoke_reason).toBe("refresh_token_reuse");
        expect(await currentTokens(sessionId)).toBe(0);

        // The legitimately issued token dies with the family.
        expect(await rotate(first.refreshToken, "key-replay-0000003", sessionId)).toMatchObject({ ok: false, status: "REVOKED" });

        const outbox = await one(`SELECT processed_at FROM identity.auth_outbox WHERE payload->'sessionIds' ? $1`, [sessionId]);
        expect(outbox.processed_at).not.toBeNull();
        expect(await authService.getSessionStatus(sessionId)).toBeNull();
    });

    it("an expired recovery window turns the same-key retry into a replay", async () => {
        const { sessionId, refreshToken } = await newSession();
        await rotate(refreshToken, "key-window-0000001", sessionId);
        await sql(`UPDATE identity.refresh_tokens SET recovery_expires_at = now() - interval '1 second' WHERE session_id = $1 AND consumed_at IS NOT NULL`, [sessionId]);

        expect(await rotate(refreshToken, "key-window-0000001", sessionId)).toMatchObject({ ok: false, status: "REUSED" });
    });

    it("two concurrent refreshes with the same token never both rotate", async () => {
        const { sessionId, refreshToken } = await newSession();
        const results = await Promise.all([
            rotate(refreshToken, "key-race-a00000001", sessionId),
            rotate(refreshToken, "key-race-b00000001", sessionId),
        ]);

        const statuses = results.map((r) => r.status).sort();
        expect(statuses).toEqual(["REFRESH", "REUSED"]);
        // Never two current tokens; the replay ended the family.
        expect(await currentTokens(sessionId)).toBe(0);
        const rows = await tokensOf(sessionId);
        expect(rows).toHaveLength(2);
    });

    it("concurrent retries with the same key converge on one token", async () => {
        const { sessionId, refreshToken } = await newSession();
        const results = await Promise.all([
            rotate(refreshToken, "key-same-000000001", sessionId),
            rotate(refreshToken, "key-same-000000001", sessionId),
        ]);

        expect(results.every((r) => r.ok)).toBe(true);
        expect(new Set(results.map((r) => r.refreshToken)).size).toBe(1);
        expect(await currentTokens(sessionId)).toBe(1);
    });

    it("rejects unknown, mismatched and expired tokens without side effects", async () => {
        const a = await newSession();
        const b = await newSession();

        expect(await rotate("f".repeat(80), "key-invalid-000001", a.sessionId)).toMatchObject({ ok: false, status: "INVALID" });

        expect(await rotate(a.refreshToken, "key-mismatch-00001", b.sessionId)).toMatchObject({ ok: false, status: "SESSION_MISMATCH" });
        expect(await currentTokens(a.sessionId)).toBe(1);

        await sql(`UPDATE identity.sessions SET idle_expires_at = now() - interval '1 second' WHERE id = $1`, [a.sessionId]);
        expect(await rotate(a.refreshToken, "key-expired-000001", a.sessionId)).toMatchObject({ ok: false, status: "EXPIRED" });
        const [token] = await tokensOf(a.sessionId);
        expect(token.consumed_at).toBeNull();
    });

    it("rolls everything back when the rotation fails before commit", async () => {
        const { sessionId, refreshToken } = await newSession();
        await expect(sessionDb.rotateRefreshToken({
            tokenHash: hashRefreshToken(refreshToken),
            expectedSessionId: sessionId,
            idempotencyKeyHash: "a".repeat(64),
            newTokenId: "9" + String(Date.now()),
            newTokenHash: "b".repeat(64),
            idleTtlSec: 60,
            recoveryTtlSec: 60,
            seal: () => { throw new Error("seal failed"); },
        })).rejects.toThrow("seal failed");

        const rows = await tokensOf(sessionId);
        expect(rows).toHaveLength(1);
        expect(rows[0].consumed_at).toBeNull();
    });

    it("logout revokes one session; logout-others keeps the current; logout-all ends them all", async () => {
        const s1 = await newSession();
        const s2 = await newSession();
        const s3 = await newSession();

        expect(await authService.logout({ userId, sessionId: s1.sessionId })).toBe(true);
        expect(await authService.getSessionStatus(s1.sessionId)).toBeNull();
        expect(await currentTokens(s1.sessionId)).toBe(0);

        await authService.revokeOtherSessions({ userId, currentSessionId: s3.sessionId });
        expect(await authService.getSessionStatus(s2.sessionId)).toBeNull();
        expect(await authService.getSessionStatus(s3.sessionId)).not.toBeNull();

        await authService.revokeAllSessions({ userId });
        expect(await authService.getSessionStatus(s3.sessionId)).toBeNull();
        expect(await rotate(s3.refreshToken, "key-after-all-0001", s3.sessionId)).toMatchObject({ ok: false, status: "REVOKED" });
    });

    it("outbox events survive a cache failure and are retried until processed", async () => {
        const { sessionId } = await newSession();
        const spy = vi.spyOn(redis, "setOrThrow").mockRejectedValueOnce(new Error("redis down"));

        await authService.logout({ userId, sessionId });
        let event = await one(`SELECT id::text, processed_at, attempts, last_error FROM identity.auth_outbox WHERE payload->'sessionIds' ? $1`, [sessionId]);
        expect(event.processed_at).toBeNull();
        expect(event.attempts).toBe(1);
        expect(event.last_error).toContain("redis down");

        // The worker picks it up once it is due again.
        await sql(`UPDATE identity.auth_outbox SET available_at = now() WHERE id = $1`, [event.id]);
        await processAuthOutbox({ ids: [event.id] });
        event = await one(`SELECT processed_at, attempts FROM identity.auth_outbox WHERE id = $1`, [event.id]);
        expect(event.processed_at).not.toBeNull();
        expect(event.attempts).toBe(2);
        spy.mockRestore();
    });

    it("cache miss falls back to PostgreSQL; PostgreSQL down answers 503, never 'signed out'", async () => {
        const { sessionId } = await newSession();
        await redis.del(`session:${sessionId}`);
        expect(await authService.getSessionStatus(sessionId)).toMatchObject({ status: "active", userId });

        await redis.del(`session:${sessionId}`);
        const spy = vi.spyOn(sessionDb, "getSessionState").mockRejectedValueOnce(new Error("connection refused"));
        await expect(authService.getSessionStatus(sessionId)).rejects.toMatchObject({ status: 503, errorCode: "AUTH_UNAVAILABLE" });
        spy.mockRestore();
    });
});
