import { sql } from "@/lib/db";
import { withTransaction } from "@/lib/dbTransaction";
import { sessionDb } from "@/db/session.db";

// identity.email_tokens (migrations 20261023_002, _003). Tokens are passed in already hashed.

export const emailTokenDb = {
    /**
     * Replaces the user's live token for `purpose`. Returns the address it is for, or null when
     * the user does not exist, is not active, or is already verified. A link_account token is also
     * refused unless the provider email is still the user's email: the pending link was decided on
     * that match, and the user may have changed their email since.
     */
    issue: async ({ userPublicId, purpose, tokenHash, ttlSec, payload = null }) => {
        return withTransaction(async (client) => {
            const userRes = await client.query(
                `SELECT u.id, u.email, u.email_verified, i.name
                 FROM identity.users u
                 LEFT JOIN profile.info i ON i.user_id = u.id
                 WHERE u.public_id = $1 AND u.status = 'active'
                 FOR UPDATE OF u;`,
                [userPublicId]
            );
            const user = userRes.rows[0];
            if (!user || user.email_verified) return null;
            if (purpose === "link_account" && String(payload?.providerEmail || "").toLowerCase() !== user.email) return null;

            await client.query(
                `DELETE FROM identity.email_tokens WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL;`,
                [user.id, purpose]
            );
            await client.query(
                `INSERT INTO identity.email_tokens (user_id, purpose, email, token_hash, expires_at, payload)
                 VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5), $6::jsonb);`,
                [user.id, purpose, user.email, tokenHash, ttlSec, payload ? JSON.stringify(payload) : null]
            );
            return { email: user.email, name: user.name };
        });
    },

    /**
     * Consumes a verify_email token and marks the email verified, in one transaction.
     * @returns {Promise<{ status: "verified" | "already_verified" | "expired" | "invalid", userId?: string }>}
     */
    verifyEmail: async ({ tokenHash }) => {
        return withTransaction(async (client) => {
            const res = await client.query(
                `SELECT t.id, t.email, t.expires_at <= now() AS expired, t.consumed_at IS NOT NULL AS consumed,
                        u.id AS user_id, u.public_id, u.email AS current_email, u.email_verified
                 FROM identity.email_tokens t
                 JOIN identity.users u ON u.id = t.user_id
                 WHERE t.token_hash = $1 AND t.purpose = 'verify_email'
                 FOR UPDATE OF t, u;`,
                [tokenHash]
            );
            const row = res.rows[0];
            if (!row || row.email !== row.current_email) return { status: "invalid" };

            const userId = row.public_id;
            if (row.consumed) return { status: row.email_verified ? "already_verified" : "invalid", userId };
            if (row.expired) return { status: "expired", userId };

            await client.query(`UPDATE identity.email_tokens SET consumed_at = now() WHERE id = $1;`, [row.id]);
            await client.query(
                `UPDATE identity.users SET email_verified = true, updated_at = now() WHERE id = $1;`,
                [row.user_id]
            );
            return { status: "verified", userId };
        });
    },

    /**
     * Consumes a link_account token (plan 10.3, case 5b) in one transaction: attaches the provider
     * account, marks the email verified, removes every other way to sign in (password or provider
     * added by someone who never proved the email) and revokes every session. CD409 (account owned
     * by another user) rolls it all back.
     * @returns {Promise<{ status: "linked" | "expired" | "invalid", userId?, provider?, outboxIds? }>}
     */
    confirmLink: async ({ tokenHash }) => {
        return withTransaction(async (client) => {
            // Same lock order as issue(): user row first, then the token.
            const owner = await client.query(
                `SELECT user_id FROM identity.email_tokens WHERE token_hash = $1 AND purpose = 'link_account';`,
                [tokenHash]
            );
            if (!owner.rows[0]) return { status: "invalid" };
            const userRes = await client.query(
                `SELECT id, public_id, email, email_verified FROM identity.users WHERE id = $1 AND status = 'active' FOR UPDATE;`,
                [owner.rows[0].user_id]
            );
            const user = userRes.rows[0];
            const res = await client.query(
                `SELECT id, email, payload, expires_at <= now() AS expired, consumed_at IS NOT NULL AS consumed
                 FROM identity.email_tokens WHERE token_hash = $1 AND purpose = 'link_account' FOR UPDATE;`,
                [tokenHash]
            );
            const row = res.rows[0];
            const providerEmail = String(row?.payload?.providerEmail || "").toLowerCase();
            if (!user || !row || row.consumed || user.email_verified || row.email !== user.email
                || providerEmail !== user.email || !row.payload?.provider) {
                return { status: "invalid" };
            }
            if (row.expired) return { status: "expired" };

            const { provider, providerAccountId } = row.payload;
            await client.query(`UPDATE identity.email_tokens SET consumed_at = now() WHERE id = $1;`, [row.id]);
            // Purge first: one row per provider (accounts_user_provider_uq) leaves no room for the
            // new account while an old GitHub / Google row of the same kind is still there.
            await client.query(
                `DELETE FROM identity.accounts
                 WHERE user_id = $1 AND NOT (provider = $2::provider_enum AND provider_account_id IS NOT DISTINCT FROM $3);`,
                [user.id, provider, providerAccountId]
            );
            await client.query(`SELECT public.link_provider_account($1, $2, $3, $4);`, [user.public_id, provider, providerAccountId, providerEmail]);
            await client.query(`UPDATE identity.users SET email_verified = true, updated_at = now() WHERE id = $1;`, [user.id]);

            const revoked = await sessionDb.revokeSessionsTx(client, { userPublicId: user.public_id, reason: "account_linked_by_email" });
            return { status: "linked", userId: user.public_id, provider, outboxIds: [revoked.outboxId].filter(Boolean) };
        });
    },

    /** Queues an auth outbox event (processed by services/authOutbox.service.js). */
    enqueue: async (eventType, payload) => {
        const res = await sql(
            `INSERT INTO identity.auth_outbox (event_type, payload) VALUES ($1, $2::jsonb) RETURNING id::text;`,
            [eventType, JSON.stringify(payload)]
        );
        return res.rows[0]?.id || null;
    },

    cleanup: async ({ retentionDays = 7 } = {}) => {
        const res = await sql(
            `DELETE FROM identity.email_tokens
             WHERE COALESCE(consumed_at, expires_at) < now() - make_interval(days => $1);`,
            [retentionDays]
        );
        return res.rowCount;
    },
};

export default emailTokenDb;
