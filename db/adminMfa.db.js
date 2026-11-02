import { sql } from "@/lib/db";

/** Admin two-factor rows (migration 20261101_010). Writes that must stay together take a client. */
export const adminMfaDb = {
    get: async ({ userDbId }) => (await sql(
        `SELECT secret_enc, confirmed_at, last_step::text AS last_step,
                (SELECT COUNT(*) FROM identity.admin_mfa_recovery r WHERE r.user_id = m.user_id AND r.used_at IS NULL)::int AS recovery_left
         FROM identity.admin_mfa m WHERE m.user_id = $1`,
        [userDbId]
    )).rows[0] || null,

    lock: async (client, { userDbId }) => (await client.query(
        `SELECT secret_enc, confirmed_at, last_step::text AS last_step FROM identity.admin_mfa WHERE user_id = $1 FOR UPDATE`,
        [userDbId]
    )).rows[0] || null,

    /** A pending (unconfirmed) secret; a confirmed one is never replaced here. */
    savePending: async ({ userDbId, secretEnc }) => (await sql(
        `INSERT INTO identity.admin_mfa (user_id, secret_enc) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, created_at = now(), last_step = 0
         WHERE identity.admin_mfa.confirmed_at IS NULL
         RETURNING user_id`,
        [userDbId, secretEnc]
    )).rowCount > 0,

    confirm: async (client, { userDbId, step }) => client.query(
        `UPDATE identity.admin_mfa SET confirmed_at = now(), last_step = $2 WHERE user_id = $1`, [userDbId, step]),

    useStep: async (client, { userDbId, step }) => client.query(
        `UPDATE identity.admin_mfa SET last_step = $2 WHERE user_id = $1`, [userDbId, step]),

    replaceRecoveryCodes: async (client, { userDbId, hashes }) => {
        await client.query(`DELETE FROM identity.admin_mfa_recovery WHERE user_id = $1`, [userDbId]);
        await client.query(
            `INSERT INTO identity.admin_mfa_recovery (user_id, code_hash) SELECT $1, unnest($2::varchar[])`,
            [userDbId, hashes]
        );
    },

    useRecoveryCode: async (client, { userDbId, hash }) => (await client.query(
        `UPDATE identity.admin_mfa_recovery SET used_at = now()
         WHERE id = (SELECT id FROM identity.admin_mfa_recovery WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL LIMIT 1 FOR UPDATE)
         RETURNING id`,
        [userDbId, hash]
    )).rowCount > 0,

    /** The session's second-factor state, only when it belongs to this user. */
    sessionState: async ({ sessionId, userDbId }) => (await sql(
        `SELECT mfa_verified_at, reauth_at, created_at FROM identity.sessions WHERE id = $1 AND user_id = $2`,
        [sessionId, userDbId]
    )).rows[0] || null,

    markSession: async (client, { sessionId, userDbId }) => (await client.query(
        `UPDATE identity.sessions SET mfa_verified_at = COALESCE(mfa_verified_at, now()), reauth_at = now() WHERE id = $1 AND user_id = $2`,
        [sessionId, userDbId]
    )).rowCount > 0,

    /** Lost device: the user enrols again at the next admin visit. */
    reset: async (client, { userDbId }) => {
        await client.query(`DELETE FROM identity.admin_mfa WHERE user_id = $1`, [userDbId]);
        await client.query(`DELETE FROM identity.admin_mfa_recovery WHERE user_id = $1`, [userDbId]);
        await client.query(`UPDATE identity.sessions SET mfa_verified_at = NULL, reauth_at = NULL WHERE user_id = $1`, [userDbId]);
    },
};
