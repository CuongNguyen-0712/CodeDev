import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = [];
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async (message) => { sent.push(message); }) }));

/**
 * GitHub / Google on an existing account against the PostgreSQL in DATABASE_URL (migrations up to
 * 20261024_001): pending OAuth claims confirmed by email (plan 11.1 claim, 11.3 B confirm),
 * notices, Settings disconnect (10.5). Throwaway users, deleted afterwards.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `vt-link-${Date.now().toString(36)}`;

describe.skipIf(!hasDb)("account linking (PostgreSQL)", () => {
    let sql;
    let service;
    let authService;
    let generateSonyflake;
    let n = 0;

    const tokenOf = (message) => message?.text.match(/token=([0-9a-f]{80})/)?.[1];

    const makeUser = async ({ password = true, providers = [] } = {}) => {
        n += 1;
        const publicId = `${TAG}-${n}`;
        const id = String(generateSonyflake());
        await sql(
            `INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`,
            [id, publicId, `${publicId}@test.invalid`]
        );
        if (password) {
            await sql(`INSERT INTO identity.accounts (user_id, provider, password_hash) VALUES ($1, 'credentials', 'x')`, [id]);
        }
        for (const provider of providers) {
            await sql(
                `INSERT INTO identity.accounts (user_id, provider, provider_account_id) VALUES ($1, $2, $3)`,
                [id, provider, `${publicId}-${provider}`]
            );
        }
        return { publicId, id, email: `${publicId}@test.invalid` };
    };

    const accountsOf = async (user) =>
        (await sql(`SELECT provider::text FROM identity.accounts WHERE user_id = $1 ORDER BY provider`, [user.id])).rows.map((r) => r.provider);

    const passwordHashOf = async (user) =>
        (await sql(`SELECT password_hash FROM identity.accounts WHERE user_id = $1 AND provider = 'credentials'`, [user.id])).rows[0]?.password_hash;

    const requestLink = async (user, providerAccountId, mode = "claim") => {
        sent.length = 0;
        await service.requestLinkEmail({ targetUserId: user.publicId, provider: "github", providerAccountId, providerEmail: user.email, mode });
        return sent[0];
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ accountLinkService: service } = await import("@/services/accountLink.service"));
        ({ authService } = await import("@/services/auth.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));
    });

    beforeEach(() => { sent.length = 0; });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.auth_outbox WHERE payload->>'userId' LIKE $1`, [`${TAG}-%`]);
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}-%`]);
    });

    it("11.1 claim: the link needs a new password, then links GitHub, replaces the password, verifies and signs out", async () => {
        const user = await makeUser();
        const session = await authService.createSession({ userId: user.publicId });

        const mail = await requestLink(user, `${user.publicId}-gh`);
        expect(mail.to).toBe(user.email);
        expect(mail.subject).toBe("Confirm linking GitHub to your CodeDev account");
        expect(mail.text).toContain("mode=claim");
        const token = tokenOf(mail);

        // Checked before anything is consumed: the same link still works afterwards.
        expect(await service.confirmLink(token)).toEqual({ status: "password_required", mode: "claim" });
        expect(await service.confirmLink(token, "short")).toEqual({ status: "weak_password" });

        expect(await service.confirmLink(token, "new-password-1"))
            .toEqual({ status: "linked", mode: "claim", provider: "github", username: user.publicId });
        expect(await accountsOf(user)).toEqual(["credentials", "github"]);
        expect(await bcrypt.compare("new-password-1", await passwordHashOf(user))).toBe(true);

        const state = await sql(
            `SELECT u.email_verified, u.purge_after, s.revoked_at FROM identity.users u JOIN identity.sessions s ON s.user_id = u.id WHERE s.id = $1`,
            [session.sessionId]
        );
        expect(state.rows[0]).toMatchObject({ email_verified: true, purge_after: null });
        expect(state.rows[0].revoked_at).not.toBeNull();
        expect(await authService.getSessionStatus(session.sessionId)).toBeNull();
        expect(sent.at(-1).text).toContain("Your password was changed");

        // The new session: the new password signs in (login needs a role, as every real user has).
        await sql(`INSERT INTO identity.user_roles (user_id, role_id) VALUES ($1, public.default_role_id())`, [user.id]);
        const login = await authService.login({ username: user.publicId, password: "new-password-1" });
        expect(login.session.sessionId).toBeTruthy();

        // Single use.
        expect((await service.confirmLink(token, "new-password-1")).status).toBe("invalid");
    });

    it("11.1 claim: every other sign-in method goes, including a provider added before the email was proven", async () => {
        const user = await makeUser({ providers: ["google"] });
        const token = tokenOf(await requestLink(user, `${user.publicId}-gh`));
        expect((await service.confirmLink(token, "new-password-1")).status).toBe("linked");
        expect(await accountsOf(user)).toEqual(["credentials", "github"]);
    });

    it("11.3 B confirm: a verified account only gains the provider; password and sessions stay", async () => {
        const user = await makeUser();
        await sql(`UPDATE identity.users SET email_verified = true WHERE id = $1`, [user.id]);
        const session = await authService.createSession({ userId: user.publicId });

        // A claim link is never issued for a verified account; a confirm link is.
        expect(await requestLink(user, `${user.publicId}-gh`, "claim")).toBeUndefined();
        const mail = await requestLink(user, `${user.publicId}-gh`, "confirm");
        expect(mail.text).toContain("mode=confirm");

        expect(await service.confirmLink(tokenOf(mail)))
            .toEqual({ status: "linked", mode: "confirm", provider: "github", username: user.publicId });
        expect(await accountsOf(user)).toEqual(["credentials", "github"]);
        expect(await passwordHashOf(user)).toBe("x");
        expect(await authService.getSessionStatus(session.sessionId)).not.toBeNull();
    });

    it("no link when the provider email is no longer the account's email", async () => {
        const user = await makeUser();
        // Pending link decided on a@…, then the account's email moved to the victim's address.
        sent.length = 0;
        await service.requestLinkEmail({ targetUserId: user.publicId, provider: "github", providerAccountId: `${user.publicId}-gh`, providerEmail: `other-${user.email}`, mode: "claim" });
        expect(sent).toHaveLength(0);

        // A token issued while they matched stops working once the email changes.
        const token = tokenOf(await requestLink(user, `${user.publicId}-gh`));
        await sql(`UPDATE identity.users SET email = $2 WHERE id = $1`, [user.id, `moved-${user.email}`]);
        expect((await service.confirmLink(token, "new-password-1")).status).toBe("invalid");
        expect(await accountsOf(user)).toEqual(["credentials"]);
    });

    it("a GitHub account owned by someone else changes nothing", async () => {
        const owner = await makeUser({ providers: ["github"] });
        const user = await makeUser();
        const token = tokenOf(await requestLink(user, `${owner.publicId}-github`));

        expect(await service.confirmLink(token, "new-password-1")).toEqual({ status: "in_use" });
        expect(await accountsOf(user)).toEqual(["credentials"]);
        expect(await passwordHashOf(user)).toBe("x");
        expect((await sql(`SELECT email_verified FROM identity.users WHERE id = $1`, [user.id])).rows[0].email_verified).toBe(false);
    });

    it("expired, replaced and malformed tokens are refused; at most 3 mails per 15 minutes", async () => {
        const user = await makeUser();
        const first = tokenOf(await requestLink(user, `${user.publicId}-gh`));
        const second = tokenOf(await requestLink(user, `${user.publicId}-gh`));
        expect((await service.confirmLink(first, "new-password-1")).status).toBe("invalid");
        expect(await service.confirmLink("abc")).toEqual({ status: "invalid" });

        await sql(`UPDATE identity.email_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, [user.id]);
        expect((await service.confirmLink(second, "new-password-1")).status).toBe("expired");
        expect(await accountsOf(user)).toEqual(["credentials"]);

        expect(await requestLink(user, `${user.publicId}-gh`)).toBeTruthy();
        const fourth = await service.requestLinkEmail({ targetUserId: user.publicId, provider: "github", providerAccountId: `${user.publicId}-gh`, providerEmail: user.email });
        expect(fourth).toMatchObject({ sent: false });
    });

    it("lists sign-in methods and never removes the last one", async () => {
        const user = await makeUser({ password: false, providers: ["github"] });
        expect(await service.listMethods(user.publicId)).toMatchObject({ password: false, providers: [{ provider: "github" }] });

        await expect(service.unlink({ userId: user.publicId, provider: "github" }))
            .rejects.toMatchObject({ status: 409, errorCode: "LAST_SIGN_IN_METHOD" });
        await expect(service.unlink({ userId: user.publicId, provider: "google" })).rejects.toMatchObject({ status: 404 });
        await expect(service.unlink({ userId: user.publicId, provider: "credentials" })).rejects.toMatchObject({ status: 400 });

        await sql(`INSERT INTO identity.accounts (user_id, provider, provider_account_id) VALUES ($1, 'google', $2)`, [user.id, `${user.publicId}-google`]);
        await service.unlink({ userId: user.publicId, provider: "github", ip: "203.0.113.9" });
        expect(await accountsOf(user)).toEqual(["google"]);
        expect(sent.at(-1)).toMatchObject({ to: user.email, subject: "GitHub was disconnected from your CodeDev account" });
        expect(sent.at(-1).text).toContain("203.0.113.9");
    });

    it("a password row without a hash does not count as a sign-in method", async () => {
        const user = await makeUser({ providers: ["google"] });
        await sql(`UPDATE identity.accounts SET password_hash = NULL WHERE user_id = $1 AND provider = 'credentials'`, [user.id]);
        await expect(service.unlink({ userId: user.publicId, provider: "google" })).rejects.toMatchObject({ status: 409 });
    });
});
