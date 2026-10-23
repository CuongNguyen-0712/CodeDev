import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = [];
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async (message) => { sent.push(message); }) }));

/**
 * Email verification against the PostgreSQL in DATABASE_URL (migration 20261023_002 applied):
 * outbox -> token -> mail (mocked) -> verify. Throwaway users, deleted afterwards.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `vt-verify-${Date.now().toString(36)}`;

describe.skipIf(!hasDb)("email verification (PostgreSQL)", () => {
    let sql;
    let service;
    let generateSonyflake;
    let n = 0;

    const tokenOf = (message) => message.text.match(/token=([0-9a-f]{80})/)?.[1];

    const makeUser = async () => {
        n += 1;
        const publicId = `${TAG}-${n}`;
        await sql(
            `INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $2, $3)`,
            [String(generateSonyflake()), publicId, `${publicId}@test.invalid`]
        );
        return publicId;
    };

    const requestToken = async (userId) => {
        sent.length = 0;
        await service.request(userId);
        return sent[0];
    };

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ emailVerificationService: service } = await import("@/services/emailVerification.service"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));
    });

    beforeEach(() => { sent.length = 0; });

    afterAll(async () => {
        if (!sql) return;
        await sql(`DELETE FROM identity.auth_outbox WHERE payload->>'userId' LIKE $1`, [`${TAG}-%`]);
        await sql(`DELETE FROM identity.users WHERE public_id LIKE $1`, [`${TAG}-%`]);
    });

    it("mails a link whose token verifies the email once", async () => {
        const userId = await makeUser();
        const mail = await requestToken(userId);
        expect(mail.to).toBe(`${userId}@test.invalid`);
        expect(mail.subject).toBe("Verify your email for CodeDev");
        expect(mail.html).toContain("/auth/verify-email?token=");

        const token = tokenOf(mail);
        const stored = await sql(`SELECT token_hash FROM identity.email_tokens t JOIN identity.users u ON u.id = t.user_id WHERE u.public_id = $1`, [userId]);
        expect(stored.rows[0].token_hash).not.toContain(token);

        await expect(service.assertVerified(userId)).rejects.toMatchObject({ status: 403 });
        expect(await service.verify(token)).toEqual({ status: "verified" });
        expect(await service.verify(token)).toEqual({ status: "already_verified" });
        await expect(service.assertVerified(userId)).resolves.toBeUndefined();

        // Verified users get no more mail.
        expect(await requestToken(userId)).toBeUndefined();
    });

    it("keeps only the newest link", async () => {
        const userId = await makeUser();
        const first = tokenOf(await requestToken(userId));
        const second = tokenOf(await requestToken(userId));
        expect(await service.verify(first)).toEqual({ status: "invalid" });
        expect(await service.verify(second)).toEqual({ status: "verified" });
    });

    it("rejects expired links and links sent to a previous email", async () => {
        const expiredUser = await makeUser();
        const expired = tokenOf(await requestToken(expiredUser));
        await sql(`UPDATE identity.email_tokens SET expires_at = now() - interval '1 minute' WHERE email = $1`, [`${expiredUser}@test.invalid`]);
        expect(await service.verify(expired)).toEqual({ status: "expired" });

        const movedUser = await makeUser();
        const moved = tokenOf(await requestToken(movedUser));
        await sql(`UPDATE identity.users SET email = $2 WHERE public_id = $1`, [movedUser, `${movedUser}-new@test.invalid`]);
        expect(await service.verify(moved)).toEqual({ status: "invalid" });
    });

    it("ignores malformed tokens", async () => {
        expect(await service.verify("nope")).toEqual({ status: "invalid" });
        expect(await service.verify(undefined)).toEqual({ status: "invalid" });
        expect(await service.verify("a".repeat(80))).toEqual({ status: "invalid" });
    });
});
