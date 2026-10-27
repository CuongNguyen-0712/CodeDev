// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-2-1",
    title: "How to store refresh tokens as hashes",
    slug: { _type: "slug", current: "store-refresh-tokens-as-hashes" },
    description:
        "A nightly database backup of the CodeDev auth service leaked from a misconfigured bucket, and the refresh tokens in it still worked. Learn why a refresh token table should hold only a verifier (SHA-256 of a 256-bit random token), why SHA-256 is enough here while passwords need bcrypt or Argon2, why encryption is not the same thing, how to look a token up by its hash and compare in constant time, and how to prove with tests and SQL that no plain token is ever stored or logged.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the CodeDev auth team",
        problem:
            "Security ticket SEC-214, Monday 09:20: a storage bucket holding nightly pg_dump files of the auth database was readable without credentials for eleven days. Nothing suggests the dumps were downloaded, but nobody can prove they were not. Worse, the on-call engineer restored one dump into a scratch database, copied a value from auth.refresh_tokens.token and sent it to POST https://api.codedev.test/auth/refresh: the API answered 200 with a fresh access token for a real learner. Every refresh token that was valid on the night of the dump can be used by whoever holds the file.",
    },

    content: [
        h2("1. The incident: a backup that signs people in"),
        p("The previous module made access tokens short-lived and verified. Refresh tokens are the other half of the flow: long-lived (30 days on CodeDev), stored server-side so they can be revoked, and exchanged at `POST /auth/refresh` for a new access token. This is the table the auth service has used since launch:"),
        code("sql", `
CREATE TABLE auth.refresh_tokens (
    id          text        PRIMARY KEY,
    family_id   text        NOT NULL,
    user_id     text        NOT NULL REFERENCES identity.users (id),
    device_id   text        NOT NULL,
    token       text        NOT NULL UNIQUE,      -- the refresh token itself
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    revoked_at  timestamptz,
    replaced_by text
);`, "migrations/2025_03_auth_refresh_tokens.sql"),
        p("The `token` column holds exactly the string the browser sends. Anyone who can read the table - a backup, a read replica, a support tool with `SELECT` rights, a SQL injection anywhere in the same database - can read working credentials. The bucket was the trigger; the design is the bug."),

        h2("2. Reproduce it and read the evidence"),
        p("Reproduce the claim before you fix anything, in a scratch database that is not reachable from the internet. Restore the dump and count how many tokens in it would still be accepted today:"),
        code("bash", `
$ createdb leak_check && pg_restore --no-owner -d leak_check auth-2026-10-15.dump
$ psql leak_check -c "SELECT count(*) AS live
    FROM auth.refresh_tokens
    WHERE revoked_at IS NULL AND used_at IS NULL AND expires_at > now();"
 live
------
 18342`, "terminal"),
        p("Then pick one row and replay it against staging with a copy of the same data, never against a real learner's account in production:"),
        code("bash", `
$ curl -s -X POST https://api.codedev.test/auth/refresh \\
    -H 'Content-Type: application/json' \\
    -d '{"refreshToken":"Qm9vdHN0cmFwLXRva2VuLWZyb20tdGhlLWR1bXA..."}'
{"accessToken":"eyJhbGciOiJFUzI1NiIs...","expiresIn":900}`, "terminal"),
        p("Two facts come out of this. The dump is a list of 18,342 working credentials. And the fix has two parts that must not be confused: **stop storing secrets** so the next backup is harmless, and **revoke what already leaked**, because hashing the rows today does not change the copies in the dump. This lesson is about the first part; lesson 2.2 walks through the migration and the clean-up of the live table."),

        h2("3. Core idea: store a verifier, not the secret"),
        p("The server never needs to know a refresh token after it has handed it out. It only needs to **recognise** it when it comes back. So store a one-way function of the token, and when a token arrives, compute the same function and look for a match. That is how password storage works too - with one important difference in which function you pick."),
        h3("Why SHA-256 is enough here and bcrypt is not needed"),
        p("A password needs a slow, salted hash (bcrypt, scrypt, Argon2id) because people choose it: there are only so many likely passwords, so an attacker with the hashes tries them all. A refresh token is not chosen by anyone. It is 32 bytes from a cryptographically secure random generator:"),
        code("typescript", `
import { randomBytes, createHash } from "node:crypto";

const token = randomBytes(32).toString("base64url");               // 43 characters, 256 bits of entropy
const tokenHash = createHash("sha256").update(token).digest("hex"); // 64 hex characters, stored`),
        bullets([
            "**There is no dictionary to try.** Guessing one of 2^256 values is out of reach at any hash speed, so a fast hash loses nothing. A slow hash would only make every refresh slower for real users.",
            "**The lookup stays an index lookup.** SHA-256 is deterministic, so the server computes the hash of what it received and runs `WHERE token_hash = $1` on a unique index. bcrypt adds a random salt per row: the same token hashes differently every time, and the server would have to bcrypt-compare against every row.",
            "**The rule only holds for high-entropy secrets.** A 6-digit email code or a user-chosen PIN has a tiny key space. For those, a hash does not help much at all: limit attempts and expire them quickly.",
        ]),
        h3("Why not encrypt the column instead?"),
        p("Encryption is reversible by design: whoever has the key gets every token back. The key has to live where the API can use it, which is usually close to the database credentials, the same backup scripts and the same people. A hash has no key to steal. If you want a second layer, use **HMAC-SHA-256 with a server-side secret** (a pepper kept in a secret manager, not in the database): a stolen table is then useless even for checking guesses offline. It is optional for random tokens, and it adds a key to rotate."),
        h3("Constant-time comparison: what it does and what it does not"),
        p("Comparing two strings with `===` stops at the first byte that differs, so the time it takes can leak how much of a guess was right. `crypto.timingSafeEqual(a, b)` compares two buffers of the **same length** in a time that does not depend on their content (it throws if the lengths differ, so compare fixed-size values such as two 32-byte digests)."),
        p("Be precise about the threat. When the lookup is `WHERE token_hash = $1`, any timing difference from the database index depends on the **hash** of a guess, and learning bits of a hash does not help an attacker build a token that produces it. The constant-time comparison in your code is cheap insurance: it keeps the check safe if the lookup changes later, for example to the common `selector.verifier` format where the row is found by a public id and the secret part is compared in code. The OWASP Session Management Cheat Sheet asks the same of session identifiers: enough entropy to be unpredictable, and never written to logs."),
        callout("info", "When not to keep a token table at all",
            "Some systems use self-contained refresh tokens (signed JWTs) and keep no table. They cannot be revoked one by one, cannot be rotated safely and cannot be detected when replayed (lessons 2.3 and 3.1). RFC 9700, section 4.14, expects the authorization server to be able to revoke refresh tokens and to detect reuse, which needs server-side state. If you keep state, keep it as hashes."),

        challenge("chal_quiz_nas_211"),

        h2("4. The schema: make the plain token impossible to store"),
        p("Rename the column so nobody can mistake its meaning, and let the database reject anything that is not a SHA-256 hex digest. A plain token is 43 base64url characters and fails the check, so a future bug that writes the raw token fails loudly in the first test run instead of silently in production:"),
        code("sql", `
CREATE TABLE auth.refresh_tokens (
    id          text        PRIMARY KEY,
    family_id   text        NOT NULL,
    user_id     text        NOT NULL REFERENCES identity.users (id),
    device_id   text        NOT NULL,
    token_hash  text        NOT NULL UNIQUE
                CHECK (token_hash ~ '^[0-9a-f]{64}$'),     -- only a SHA-256 hex digest fits
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    revoked_at  timestamptz,
    replaced_by text        REFERENCES auth.refresh_tokens (id)
);
CREATE INDEX refresh_tokens_family_idx ON auth.refresh_tokens (family_id);
CREATE INDEX refresh_tokens_user_idx   ON auth.refresh_tokens (user_id) WHERE revoked_at IS NULL;`, "migrations/2026_10_auth_refresh_tokens_hashed.sql"),
        p("The `UNIQUE` constraint gives you the index the lookup needs. `used_at`, `revoked_at` and `replaced_by` stay in the model for the rest of the module: rotation (lesson 2.3), replay detection (3.1) and revocation (4.1) all work on this one table."),

        h2("5. Worked example: issue and validate in a NestJS service"),
        p("The service below is the whole pattern. The plain token exists in exactly two places: the return value of `issue()`, which goes to the client once, and the request body that `validate()` receives. Neither is ever stored or logged."),
        code("typescript", `
// src/auth/refresh-token.service.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;           // 32 random bytes, base64url, no padding
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sha256 = (value: string) => createHash("sha256").update(value).digest();

export interface Clock { now(): Date }
export interface IdGenerator { next(prefix: "rt" | "fam"): string }

export type Validation =
    | { ok: true; id: string; familyId: string; userId: string; deviceId: string }
    | { ok: false; reason: "malformed" | "unknown" | "revoked" | "expired" };

@Injectable()
export class RefreshTokenService {
    private readonly logger = new Logger(RefreshTokenService.name);
    constructor(
        @Inject("AUTH_DB") private readonly db: Pool,          // providers registered in AuthModule
        @Inject("ID_GENERATOR") private readonly ids: IdGenerator,
        @Inject("CLOCK") private readonly clock: Clock,
    ) {}

    async issue(userId: string, deviceId: string) {
        const token = randomBytes(32).toString("base64url");
        const id = this.ids.next("rt");
        const familyId = this.ids.next("fam");
        const now = this.clock.now();
        const expiresAt = new Date(now.getTime() + TTL_MS);
        await this.db.query(
            \`INSERT INTO auth.refresh_tokens (id, family_id, user_id, device_id, token_hash, created_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)\`,
            [id, familyId, userId, deviceId, sha256(token).toString("hex"), now, expiresAt],
        );
        this.logger.log({ event: "refresh_token.issued", id, userId, deviceId });   // ids only
        return { token, id, familyId, expiresAt };                                  // the only copy of the token
    }

    async validate(presented: unknown): Promise<Validation> {
        if (typeof presented !== "string" || !TOKEN_FORMAT.test(presented)) return this.reject("malformed");
        const digest = sha256(presented);
        const { rows } = await this.db.query(
            \`SELECT id, family_id, user_id, device_id, token_hash, expires_at, revoked_at
             FROM auth.refresh_tokens WHERE token_hash = $1\`,
            [digest.toString("hex")],
        );
        const row = rows[0];
        if (!row || !timingSafeEqual(Buffer.from(row.token_hash, "hex"), digest)) return this.reject("unknown");
        if (row.revoked_at !== null) return this.reject("revoked", row.id);
        if (this.clock.now() >= row.expires_at) return this.reject("expired", row.id);
        return { ok: true, id: row.id, familyId: row.family_id, userId: row.user_id, deviceId: row.device_id };
    }

    private reject(reason: "malformed" | "unknown" | "revoked" | "expired", id?: string): Validation {
        this.logger.warn({ event: "refresh_token.rejected", reason, ...(id ? { id } : {}) }); // never the token or the hash
        return { ok: false, reason };
    }
}`, "refresh-token.service.ts"),
        bullets([
            "**The format check comes first.** It is not the security boundary (a hash of junk simply matches nothing), but it rejects garbage before it reaches the database and the logs, and it makes \"someone sent a 64-character hex string\" visible as `malformed`.",
            "**The order of the checks is part of the contract.** Revoked is reported before expired: an explicit decision by the user or an admin is the more useful answer for support and audit.",
            "**The log has ids, never secrets.** `id` is enough to find the row, the family and the user. A token in a log line is a credential in every log pipeline, index and export that receives it.",
            "**Inject the clock and the id generator.** The service never calls `Date.now()` or `Math.random()` directly, so tests can move time to one millisecond before `expires_at` and back.",
        ]),

        h2("6. How to verify it"),
        p("\"We hash the tokens\" is a claim about every code path that writes the table, now and later. Check it in ways that keep working after the next refactor:"),
        numbered([
            "**A test that dumps the store.** After issuing tokens, read every row and assert that no issued token appears anywhere in it, and that each `token_hash` equals SHA-256 of a token you issued. This is what the exercise below does.",
            "**The database refuses the mistake.** With the `CHECK` constraint, an `INSERT` of a raw token fails with `new row for relation \"refresh_tokens\" violates check constraint`. Write a test that tries it once.",
            "**A query on the real table.** `SELECT count(*) FROM auth.refresh_tokens WHERE token_hash !~ '^[0-9a-f]{64}$';` must return 0. Run it after the migration and keep it as a periodic check.",
            "**The logs.** Search a day of auth logs for 43-character base64url strings (`grep -E '[A-Za-z0-9_-]{43}'`) and for 64-character hex strings. Any hit is a secret or a hash that should not be there.",
            "**The replay.** Take a `token_hash` from a fresh backup and send it to `/auth/refresh`. The answer must be a rejection, never a token.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Hashing on write but not on read.** The insert stores the hash, the lookup still says `WHERE token_hash = $1` with the raw token, and every refresh fails - or someone \"fixes\" it by storing the raw token again. Spot it: a round-trip test (issue, then validate the returned token) fails.",
            "**bcrypt for random tokens.** Every row gets a different salt, so the lookup becomes a full scan with a slow comparison per row. Spot it: refresh latency grows with the table, and the code loads many rows to compare in a loop.",
            "**Returning or logging the whole row.** `return { ok: true, ...row }` or `logger.debug(row)` puts `token_hash` in responses and logs. A hash is not a working token, but it is a stable identifier for a credential and it lets anyone with the logs check guesses offline. Spot it: grep for 64-hex strings in logs and API responses.",
            "**`timingSafeEqual` on strings of different lengths.** It throws `RangeError` instead of returning false. Spot it: a 500 instead of 401 when a client sends a token that is one character too long. Compare fixed-size digests, or check the length first.",
            "**Treating the hash migration as the incident response.** Hashing protects future backups. Tokens already in a leaked file must be revoked. Spot it: the post-incident checklist has no `UPDATE ... SET revoked_at` step.",
        ]),

        h2("8. Exercise: store refresh tokens as hashes"),
        p("Write `issueRefreshToken` and `validateRefreshToken` for an in-memory store that mirrors the table above. The test runner plays the incident: it issues tokens for several users and devices, revokes some, moves a fake clock past expiry, presents values copied straight out of the store (as an attacker with the backup would) and finally scans the store, your log events and your results for any token or stored hash."),
        challenge("chal_coding_nas_212"),

        h2("9. Summary"),
        bullets([
            "Store a verifier, not the secret: `token_hash = SHA-256(token)` with a unique index. For a 256-bit random token a fast hash is the right choice; slow salted hashes are for secrets people choose.",
            "Look the token up by its hash, compare digests with `timingSafeEqual`, and check revoked before expired. Logs and responses carry ids, never tokens or hashes.",
            "Prove it: a test that dumps the store, a `CHECK` constraint that rejects anything but a digest, and a replay of a backup value that must fail. Hashing protects the next backup; tokens that already leaked must still be revoked.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9700, Best Current Practice for OAuth 2.0 Security, section 4.14 (Refresh Token Protection) - datatracker.ietf.org/doc/html/rfc9700",
            "OWASP Session Management Cheat Sheet (session ID entropy, logging, storage) - cheatsheetseries.owasp.org",
            "OWASP Password Storage Cheat Sheet, for the contrast: why passwords need bcrypt or Argon2id",
            "Node.js documentation: crypto.randomBytes, crypto.createHash, crypto.timingSafeEqual",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Restore last night's backup of your own project into a scratch database and list every column that holds a secret a client could send back: refresh tokens, password reset links, email verification codes, API keys, invite links. For each one, write down whether a copy of the backup would let someone use it today, and which of them are random enough for SHA-256 and which need rate limiting instead."),
    ],
});
