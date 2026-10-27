import { sql } from "@/lib/db";
import { withTransaction } from "@/lib/dbTransaction";
import { sessionDb } from "@/db/session.db";

/**
 * Never-verified accounts (docs/email-verification-plan.md 11.2): identity.users.purge_after is
 * set on sign-up (trigger, migrations 20261024_001, 20261026_003) and cleared for good once the
 * email is verified. verify_lock_at (plan 12) is the end of the 7-day grace period.
 */
export const accountPurgeDb = {
    /**
     * Marks up to `limit` accounts 2 days before their deadline as reminded; returns their public
     * ids. `userIds` narrows it (tests must not touch other accounts of a shared database).
     */
    claimReminders: async ({ limit = 50, userIds = null } = {}) => {
        const res = await sql(
            `UPDATE identity.users u SET purge_reminded_at = now()
             WHERE u.id IN (
                 SELECT id FROM identity.users
                 WHERE purge_after IS NOT NULL AND email_verified IS NOT TRUE AND status = 'active'
                   AND purge_reminded_at IS NULL AND purge_after - interval '2 days' <= now()
                   AND ($2::text[] IS NULL OR public_id = ANY($2::text[]))
                 ORDER BY purge_after
                 LIMIT $1
                 FOR UPDATE SKIP LOCKED
             )
             RETURNING u.public_id;`,
            [limit, userIds]
        );
        return res.rows.map((r) => r.public_id);
    },

    /**
     * Same as claimReminders for the lock deadline (plan 12): accounts locking within 48 hours,
     * not yet locked. Covers accounts that were verified once and changed their email.
     */
    claimLockReminders: async ({ limit = 50, userIds = null } = {}) => {
        const res = await sql(
            `UPDATE identity.users u SET lock_reminded_at = now()
             WHERE u.id IN (
                 SELECT id FROM identity.users
                 WHERE verify_lock_at > now() AND email_verified IS NOT TRUE AND status = 'active'
                   AND lock_reminded_at IS NULL AND verify_lock_at - interval '48 hours' <= now()
                   AND ($2::text[] IS NULL OR public_id = ANY($2::text[]))
                 ORDER BY verify_lock_at
                 LIMIT $1
                 FOR UPDATE SKIP LOCKED
             )
             RETURNING u.public_id;`,
            [limit, userIds]
        );
        return res.rows.map((r) => r.public_id);
    },

    /** Public ids of accounts past their deadline. */
    listDue: async ({ limit = 50 } = {}) => {
        const res = await sql(
            `SELECT public_id FROM identity.users
             WHERE purge_after <= now() AND email_verified IS NOT TRUE
             ORDER BY purge_after
             LIMIT $1;`,
            [limit]
        );
        return res.rows.map((r) => r.public_id);
    },

    /**
     * Deletes one never-verified account (past its deadline, or any time when `requested` by its
     * owner) and everything that cascades from it (profile, ledgers,
     * enrolments, submissions, comments, messages, tokens, sign-in methods), in one transaction.
     * The email is free again afterwards. Files outside the database are queued for deletion
     * (outbox "storage.purge") and sessions for cache invalidation ("session.revoked").
     * @returns {Promise<{ status: "purged" | "would_purge" | "skipped" | "gone", reason?: string,
     *                     files?: number, outboxIds?: string[] }>}
     */
    purgeUser: async ({ userPublicId, dryRun = false, requested = false }) => {
        return withTransaction(async (client) => {
            // `requested`: the owner deletes it now (plan 12.4); still only a never-verified account.
            const userRes = await client.query(
                `SELECT id FROM identity.users
                 WHERE public_id = $1 AND email_verified IS NOT TRUE
                   AND purge_after IS NOT NULL AND ($2 OR purge_after <= now())
                 FOR UPDATE;`,
                [userPublicId, requested]
            );
            const id = userRes.rows[0]?.id;
            if (!id) return { status: "gone" }; // verified or deleted meanwhile

            // Never delete payment history; an actor of ledger / audit rows is an admin, not a
            // throwaway sign-up (those rows are append-only and would block the delete anyway).
            const blockers = await client.query(
                `SELECT
                     EXISTS (SELECT 1 FROM commerce.orders WHERE user_id = $1) AS orders,
                     EXISTS (SELECT 1 FROM profile.point_transaction WHERE actor_id = $1)
                       OR EXISTS (SELECT 1 FROM profile.exp_transaction WHERE actor_id = $1)
                       OR EXISTS (SELECT 1 FROM identity.audit_log WHERE actor_id = $1) AS actor;`,
                [id]
            );
            if (blockers.rows[0].orders) return { status: "skipped", reason: "orders" };
            if (blockers.rows[0].actor) return { status: "skipped", reason: "actor" };

            const filesRes = await client.query(
                `SELECT provider, object_key AS key, NULL AS bucket
                 FROM storage.assets WHERE owner_id = $1 AND object_key IS NOT NULL
                 UNION
                 SELECT 's3', source_snapshot->>'s3_key', source_snapshot->>'s3_bucket'
                 FROM challenge.code_submissions WHERE user_id = $1 AND source_snapshot ? 's3_key';`,
                [id]
            );
            const files = filesRes.rows;
            if (dryRun) return { status: "would_purge", files: files.length };

            const revoked = await sessionDb.revokeSessionsTx(client, { userPublicId, reason: "account_purged" });

            // Tables whose foreign key to identity.users does not cascade.
            await client.query(`DELETE FROM roadmap.user_progress WHERE user_id = $1;`, [id]);
            await client.query(`DELETE FROM roadmap.roadmap_users WHERE user_id = $1;`, [id]);
            await client.query(`DELETE FROM storage.assets WHERE owner_id = $1;`, [id]);

            const outboxIds = [revoked.outboxId];
            if (files.length > 0) {
                const queued = await client.query(
                    `INSERT INTO identity.auth_outbox (event_type, payload) VALUES ('storage.purge', $1::jsonb) RETURNING id::text;`,
                    [JSON.stringify({ files })]
                );
                outboxIds.push(queued.rows[0].id);
            }

            await client.query(`DELETE FROM identity.users WHERE id = $1;`, [id]);
            return { status: "purged", files: files.length, outboxIds: outboxIds.filter(Boolean) };
        });
    },
};

export default accountPurgeDb;
