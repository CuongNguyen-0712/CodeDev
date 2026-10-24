import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent = [];
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async (message) => { sent.push(message); }) }));

/**
 * Never-verified accounts (docs/email-verification-plan.md 11.2) against the PostgreSQL in
 * DATABASE_URL (migration 20261024_001): the purge_after trigger, the reminder, and the permanent
 * delete. Every call is scoped to the throwaway users created here.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `vt-purge-${Date.now().toString(36)}`;

describe.skipIf(!hasDb)("never-verified account purge (PostgreSQL)", () => {
    let sql;
    let purgeDb;
    let authService;
    let generateSonyflake;
    let n = 0;

    const makeUser = async ({ verified = false } = {}) => {
        n += 1;
        const publicId = `${TAG}-${n}`;
        const id = String(generateSonyflake());
        await sql(
            `INSERT INTO identity.users (id, public_id, username, email, email_verified) VALUES ($1, $2, $2, $3, $4)`,
            [id, publicId, `${publicId}@test.invalid`, verified]
        );
        await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'Test', 'Purge')`, [id]);
        return { publicId, id, email: `${publicId}@test.invalid` };
    };
    const stateOf = async (user) =>
        (await sql(`SELECT purge_after, purge_reminded_at FROM identity.users WHERE id = $1`, [user.id])).rows[0];
    const count = async (query, params) => (await sql(query, params)).rows[0].n;
    const dueNow = (user) => sql(`UPDATE identity.users SET purge_after = now() - interval '1 minute' WHERE id = $1`, [user.id]);

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ accountPurgeDb: purgeDb } = await import("@/db/accountPurge.db"));
        ({ authService } = await import("@/services/auth.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM commerce.orders WHERE public_id LIKE $1`, [`${TAG}-%`]);
        await sql(`DELETE FROM identity.auth_outbox WHERE payload->>'userId' LIKE $1`, [`${TAG}-%`]);
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}-%`]);
    });

    it("sets a 7-day deadline on unverified sign-ups and clears it for good once verified", async () => {
        const user = await makeUser();
        const { purge_after: deadline } = await stateOf(user);
        expect(Math.abs(new Date(deadline) - (Date.now() + 7 * 864e5))).toBeLessThan(60_000);

        expect((await stateOf(await makeUser({ verified: true }))).purge_after).toBeNull();

        await sql(`UPDATE identity.users SET email_verified = true WHERE id = $1`, [user.id]);
        expect((await stateOf(user)).purge_after).toBeNull();
        // An email change later makes the account unverified again, never deletable.
        await sql(`UPDATE identity.users SET email = $2, email_verified = false WHERE id = $1`, [user.id, `moved-${user.email}`]);
        expect((await stateOf(user)).purge_after).toBeNull();
    });

    it("reminds once, 2 days before the deadline", async () => {
        const user = await makeUser();
        await sql(`UPDATE identity.users SET purge_after = now() + interval '1 day' WHERE id = $1`, [user.id]);
        const early = await makeUser();

        const ids = [user.publicId, early.publicId];
        expect(await purgeDb.claimReminders({ userIds: ids })).toEqual([user.publicId]);
        expect(await purgeDb.claimReminders({ userIds: ids })).toEqual([]);
        expect((await stateOf(user)).purge_reminded_at).not.toBeNull();

        sent.length = 0;
        const { emailVerificationService } = await import("@/services/emailVerification.service");
        await emailVerificationService.remind(user.publicId);
        expect(sent[0].subject).toMatch(/^Verify your email by .+ to keep your CodeDev account$/);
        expect(sent[0].text).toContain("are deleted, with all their data, after 7 days");
    });

    it("deletes a past-deadline account with its data and frees the email; dry run changes nothing", async () => {
        const user = await makeUser();
        await sql(`INSERT INTO identity.accounts (user_id, provider, password_hash) VALUES ($1, 'credentials', 'x')`, [user.id]);
        await sql(`INSERT INTO community.comment (user_id, reference_id, content) SELECT $1, id, 'hi' FROM catalog.course LIMIT 1`, [user.id]);
        const session = await authService.createSession({ userId: user.publicId });
        await dueNow(user);

        expect(await purgeDb.purgeUser({ userPublicId: user.publicId, dryRun: true })).toEqual({ status: "would_purge", files: 0 });
        expect(await count(`SELECT count(*)::int n FROM identity.users WHERE id = $1`, [user.id])).toBe(1);

        const result = await purgeDb.purgeUser({ userPublicId: user.publicId });
        expect(result.status).toBe("purged");
        // As runAccountMaintenance does: the session.revoked event updates the Redis session cache.
        const { processAuthOutbox } = await import("@/services/authOutbox.service");
        await processAuthOutbox({ ids: result.outboxIds, limit: result.outboxIds.length });
        expect(await count(`SELECT count(*)::int n FROM identity.users WHERE id = $1`, [user.id])).toBe(0);
        expect(await count(`SELECT count(*)::int n FROM identity.accounts WHERE user_id = $1`, [user.id])).toBe(0);
        expect(await count(`SELECT count(*)::int n FROM community.comment WHERE user_id = $1`, [user.id])).toBe(0);
        expect(await authService.getSessionStatus(session.sessionId)).toBeNull();

        // The email can be registered again.
        await sql(
            `INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`,
            [String(generateSonyflake()), `${user.publicId}-again`, user.email]
        );
    });

    it("keeps verified accounts, accounts not yet due, and accounts with orders", async () => {
        const verified = await makeUser({ verified: true });
        expect((await purgeDb.purgeUser({ userPublicId: verified.publicId })).status).toBe("gone");

        const notDue = await makeUser();
        expect((await purgeDb.purgeUser({ userPublicId: notDue.publicId })).status).toBe("gone");

        const buyer = await makeUser();
        await dueNow(buyer);
        await sql(`INSERT INTO commerce.orders (public_id, user_id) VALUES ($1, $2)`, [`${buyer.publicId}-order`, buyer.id]);
        expect(await purgeDb.purgeUser({ userPublicId: buyer.publicId })).toEqual({ status: "skipped", reason: "orders" });
    });
});
