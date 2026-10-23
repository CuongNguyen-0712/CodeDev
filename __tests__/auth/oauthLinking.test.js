import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { usernameBase, splitDisplayName } from "@/lib/username";
import { verifiedProviderEmail } from "@/lib/oauthEmail";
import { openRecovery, sealRecovery } from "@/lib/auth.util";
import { mailConfig } from "@/lib/mail";

describe("mailConfig", () => {
    it("uses Gmail from EMAIL_USER / EMAIL_PASS (production)", () => {
        expect(mailConfig({ EMAIL_USER: "a@gmail.com", EMAIL_PASS: "p" }))
            .toEqual({ host: "smtp.gmail.com", port: 465, user: "a@gmail.com", pass: "p", from: "CodeDev <a@gmail.com>" });
    });

    it("prefers SMTP_HOST (Mailpit in development) and honours MAIL_FROM", () => {
        expect(mailConfig({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", MAIL_FROM: "CodeDev <dev@x>", EMAIL_USER: "a@gmail.com", EMAIL_PASS: "p" }))
            .toMatchObject({ host: "127.0.0.1", port: 1025, user: null, from: "CodeDev <dev@x>" });
    });

    it("is null without either", () => {
        expect(mailConfig({ EMAIL_USER: "a@gmail.com" })).toBeNull();
    });
});

describe("sealed blobs", () => {
    it("reject a truncated GCM tag", () => {
        const sealed = sealRecovery("secret", "ctx");
        expect(openRecovery(sealed, "ctx")).toBe("secret");
        const [v, iv, tag, enc] = sealed.split(".");
        const short = Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url");
        expect(openRecovery([v, iv, short, enc].join("."), "ctx")).toBeNull();
    });
});

describe("usernameBase", () => {
    it("turns a display name into [a-z0-9_]{3,30}", () => {
        expect(usernameBase("Nguyễn Văn Đức")).toBe("nguyen_van_duc");
        expect(usernameBase("John.Doe-42")).toBe("john_doe_42");
        expect(usernameBase("  __a__  ")).toBe("user_a");
        expect(usernameBase("")).toBe("user");
        expect(usernameBase("x".repeat(40))).toHaveLength(30);
        for (const raw of ["Ab", "名前", "a  b", "Octo-Cat"]) {
            expect(usernameBase(raw)).toMatch(/^[a-z0-9_]{3,30}$/);
        }
    });

    it("splits a display name into surname and name", () => {
        expect(splitDisplayName("Nguyen Van A", "x")).toEqual({ surname: "Nguyen Van", name: "A" });
        expect(splitDisplayName("Octocat", "x")).toEqual({ surname: "Octocat", name: "Octocat" });
        expect(splitDisplayName(null, "octo")).toEqual({ surname: "octo", name: "octo" });
    });
});

describe("verifiedProviderEmail", () => {
    const github = (emails, ok = true) => () => Promise.resolve({ ok, status: ok ? 200 : 502, json: () => Promise.resolve(emails) });
    const ask = (fetchImpl) => verifiedProviderEmail({ provider: "github", account: { access_token: "t" }, profile: {} }, fetchImpl);

    it("trusts Google only with email_verified", async () => {
        expect(await verifiedProviderEmail({ provider: "google", profile: { email: "A@Gmail.com", email_verified: true } })).toBe("a@gmail.com");
        expect(await verifiedProviderEmail({ provider: "google", profile: { email: "a@gmail.com", email_verified: false } })).toBeNull();
        expect(await verifiedProviderEmail({ provider: "google", profile: { email: "a@gmail.com" } })).toBeNull();
    });

    it("picks GitHub's verified primary, else another verified address, never noreply", async () => {
        expect(await ask(github([
            { email: "Main@x.com", primary: true, verified: true },
            { email: "side@x.com", primary: false, verified: true },
        ]))).toBe("main@x.com");
        expect(await ask(github([
            { email: "main@x.com", primary: true, verified: false },
            { email: "side@x.com", primary: false, verified: true },
        ]))).toBe("side@x.com");
        expect(await ask(github([
            { email: "main@x.com", primary: true, verified: false },
            { email: "1+octo@users.noreply.github.com", primary: false, verified: true },
        ]))).toBeNull();
    });

    it("throws when GitHub cannot be reached", async () => {
        await expect(ask(github([], false))).rejects.toThrow(/502/);
    });
});

/**
 * public.sign_in_with_provider / link_provider_account / log_in against the PostgreSQL in
 * DATABASE_URL (migration 20261023_001 applied). Throwaway users, deleted afterwards (accounts,
 * profile, roles and sessions cascade).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `vt-link-${Date.now().toString(36)}`;

describe.skipIf(!hasDb)("OAuth sign-in decisions (PostgreSQL)", () => {
    let sql;
    let authService;
    let generateSonyflake;
    const one = async (text, params) => (await sql(text, params)).rows[0];
    const email = (name) => `${TAG}-${name}@test.invalid`;

    const providerSignIn = (provider, providerAccountId, address, username = `${TAG}_new`) => authService.signInWithProvider({
        username,
        email: address,
        image: null,
        accountProvider: provider,
        providerAccountId: `${TAG}-${providerAccountId}`,
        surname: "Test",
        name: "User",
        userAgent: TAG,
    });

    const passwordUser = async (name, { verified = false } = {}) => {
        const id = String(generateSonyflake());
        await sql(`SELECT * FROM sign_up($1, $2, $3, $4, 'Test', 'User', 'not-a-real-hash')`, [id, `${TAG}-${name}`, `${TAG}_${name}`, email(name)]);
        if (verified) await sql(`UPDATE identity.users SET email_verified = true WHERE id = $1`, [id]);
        return `${TAG}-${name}`;
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ authService } = await import("@/services/auth.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));
    });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.users WHERE email LIKE $1`, [`${TAG}-%`]);
    });

    it("creates a verified user with a free username, then signs it in", async () => {
        await passwordUser("taken");
        const created = await providerSignIn("github", "1", email("gh1"), `${TAG}_taken`);
        expect(created.result).toBe("created");
        expect(created.user.username).toMatch(new RegExp(`^${TAG}_taken_\\d{4}$`));
        expect(created.user.session.sessionId).toBeTruthy();
        expect((await one(`SELECT email_verified FROM identity.users WHERE public_id = $1`, [created.user.id])).email_verified).toBe(true);

        const again = await providerSignIn("github", "1", "changed@test.invalid");
        expect(again.result).toBe("login");
        expect(again.user.id).toBe(created.user.id);
    });

    it("never links to an unverified account by email and opens no session", async () => {
        const userId = await passwordUser("unverified");
        const res = await providerSignIn("google", "2", email("unverified"));
        expect(res.result).toBe("link_required");
        expect(res.user.id).toBe(userId);
        expect(res.user.session).toBeUndefined();
        expect((await one(`SELECT count(*)::int n FROM identity.accounts a JOIN identity.users u ON u.id = a.user_id WHERE u.public_id = $1`, [userId])).n).toBe(1);
    });

    it("links to a verified account by email", async () => {
        const userId = await passwordUser("verified", { verified: true });
        const res = await providerSignIn("google", "3", email("verified"));
        expect(res.result).toBe("linked");
        expect(res.user.id).toBe(userId);
        expect((await one(`SELECT provider_email FROM identity.accounts WHERE provider_account_id = $1`, [`${TAG}-3`])).provider_email).toBe(email("verified"));
    });

    it("links after the password proved the account, and marks the email verified", async () => {
        const userId = await passwordUser("confirm");
        await authService.linkProviderAccount({ userId, provider: "github", providerAccountId: `${TAG}-4`, providerEmail: email("confirm").toUpperCase() });
        expect((await one(`SELECT email_verified FROM identity.users WHERE public_id = $1`, [userId])).email_verified).toBe(true);
        expect((await providerSignIn("github", "4", email("confirm"))).result).toBe("login");

        const other = await passwordUser("other");
        await expect(authService.linkProviderAccount({ userId: other, provider: "github", providerAccountId: `${TAG}-4`, providerEmail: email("other") }))
            .rejects.toMatchObject({ code: "CD409" });
    });

    it("refuses blocked users on both sign-in paths and ends their sessions", async () => {
        const userId = await passwordUser("blocked", { verified: true });
        const { sessionId, refreshToken } = await authService.createSession({ userId, userAgent: TAG });
        await sql(`UPDATE identity.users SET status = 'blocked' WHERE public_id = $1`, [userId]);
        expect((await providerSignIn("google", "5", email("blocked"))).result).toBe("blocked");
        expect((await sql(`SELECT * FROM log_in($1)`, [`${TAG}_blocked`])).rowCount).toBe(0);

        const { sessionDb } = await import("@/db/session.db");
        expect(await sessionDb.getSessionState({ sessionId })).toBeNull();
        const rotated = await authService.rotateRefreshToken({ refreshToken, idempotencyKey: `${TAG}-k`, expectedSessionId: sessionId });
        expect(rotated.ok).toBe(false);
    });

    it("treats emails without regard to case", async () => {
        await passwordUser("case");
        await expect(sql(`SELECT * FROM sign_up($1, $2, $3, $4, 'T', 'U', 'h')`, [String(generateSonyflake()), `${TAG}-case2`, `${TAG}_case2`, email("case").toUpperCase()]))
            .rejects.toMatchObject({ code: "23505" });
    });
});
