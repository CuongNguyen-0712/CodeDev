import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent = [];
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async (message) => { sent.push(message); }) }));

/**
 * Never-verified accounts (docs/email-verification-plan.md 11.2) against the PostgreSQL in
 * DATABASE_URL (migrations 20261024_001, 20261026_003): the deadline trigger, the reminders, and the permanent
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
        (await sql(`SELECT purge_after, purge_reminded_at, verify_lock_at, lock_reminded_at FROM identity.users WHERE id = $1`, [user.id])).rows[0];
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

    it("locks unverified sign-ups after 7 days, deletes them after 14, and clears both once verified", async () => {
        const user = await makeUser();
        const { purge_after: deadline, verify_lock_at: lockAt } = await stateOf(user);
        expect(Math.abs(new Date(lockAt) - (Date.now() + 7 * 864e5))).toBeLessThan(60_000);
        expect(Math.abs(new Date(deadline) - (Date.now() + 14 * 864e5))).toBeLessThan(60_000);

        expect(await stateOf(await makeUser({ verified: true }))).toMatchObject({ purge_after: null, verify_lock_at: null });

        // Changing the email of a never-verified account keeps its deadlines.
        await sql(`UPDATE identity.users SET email = $2, email_verified = false WHERE id = $1`, [user.id, `early-${user.email}`]);
        expect(await stateOf(user)).toMatchObject({ purge_after: deadline, verify_lock_at: lockAt });

        await sql(`UPDATE identity.users SET email_verified = true WHERE id = $1`, [user.id]);
        expect(await stateOf(user)).toMatchObject({ purge_after: null, verify_lock_at: null });
        // An email change later makes the account unverified again: locked after 7 days, never deletable.
        await sql(`UPDATE identity.users SET email = $2, email_verified = false WHERE id = $1`, [user.id, `moved-${user.email}`]);
        const moved = await stateOf(user);
        expect(moved.purge_after).toBeNull();
        expect(Math.abs(new Date(moved.verify_lock_at) - (Date.now() + 7 * 864e5))).toBeLessThan(60_000);
    });

    it("reminds once, 2 days before the lock", async () => {
        const user = await makeUser();
        await sql(`UPDATE identity.users SET verify_lock_at = now() + interval '1 day' WHERE id = $1`, [user.id]);
        const early = await makeUser();
        const locked = await makeUser();
        await sql(`UPDATE identity.users SET verify_lock_at = now() - interval '1 hour' WHERE id = $1`, [locked.id]);

        const ids = [user.publicId, early.publicId, locked.publicId];
        expect(await purgeDb.claimLockReminders({ userIds: ids })).toEqual([user.publicId]);
        expect(await purgeDb.claimLockReminders({ userIds: ids })).toEqual([]);
        expect((await stateOf(user)).lock_reminded_at).not.toBeNull();

        sent.length = 0;
        const { emailVerificationService } = await import("@/services/emailVerification.service");
        await emailVerificationService.remind(user.publicId, "lock");
        expect(sent[0].subject).toMatch(/^Verify your email by .+ to keep using CodeDev$/);
        expect(sent[0].text).toContain("you need to verify before you can use your account");
        expect(sent[0].text).toMatch(/are deleted, with all their data, on .+\./);
    });

    it("reminds once, 2 days before the deletion", async () => {
        const user = await makeUser();
        await sql(`UPDATE identity.users SET purge_after = now() + interval '1 day', verify_lock_at = now() - interval '6 days' WHERE id = $1`, [user.id]);
        const early = await makeUser();

        const ids = [user.publicId, early.publicId];
        expect(await purgeDb.claimReminders({ userIds: ids })).toEqual([user.publicId]);
        expect(await purgeDb.claimReminders({ userIds: ids })).toEqual([]);
        expect((await stateOf(user)).purge_reminded_at).not.toBeNull();

        sent.length = 0;
        const { emailVerificationService } = await import("@/services/emailVerification.service");
        await emailVerificationService.remind(user.publicId, "purge");
        expect(sent[0].subject).toMatch(/^Verify your email by .+ to keep your CodeDev account$/);
        expect(sent[0].text).toContain("Your account is locked until you verify");
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

    it("deletes a never-verified account on its owner's request before the deadline, never a once-verified one", async () => {
        const fresh = await makeUser();
        expect((await purgeDb.purgeUser({ userPublicId: fresh.publicId, requested: true })).status).toBe("purged");
        expect(await count(`SELECT count(*)::int n FROM identity.users WHERE id = $1`, [fresh.id])).toBe(0);

        const moved = await makeUser({ verified: true });
        await sql(`UPDATE identity.users SET email = $2, email_verified = false WHERE id = $1`, [moved.id, `moved-${moved.email}`]);
        expect((await purgeDb.purgeUser({ userPublicId: moved.publicId, requested: true })).status).toBe("gone");
        const verified = await makeUser({ verified: true });
        expect((await purgeDb.purgeUser({ userPublicId: verified.publicId, requested: true })).status).toBe("gone");
    });

    it("names the owner of a provider account a Connect was refused for (plan 12.4)", async () => {
        const { userDb } = await import("@/db/user.db");
        const owner = await makeUser({ verified: true });
        await sql(`INSERT INTO identity.accounts (user_id, provider, provider_account_id) VALUES ($1, 'google', $2)`, [owner.id, `g-${owner.publicId}`]);
        const unverified = await makeUser();

        expect(await userDb.getLinkConflict({ userId: unverified.publicId, provider: "google", providerAccountId: `g-${owner.publicId}` }))
            .toMatchObject({ owner_username: owner.publicId, email_verified: false, deletable: true });
        expect(await userDb.getLinkConflict({ userId: unverified.publicId, provider: "google", providerAccountId: "nobody" })).toBeNull();
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
