# Authentication

## Credentials

| Credential | Where | Lifetime | Written by |
|---|---|---|---|
| Session JWT (access) | next-auth cookie `next-auth.session-token` (`__Secure-` on https), HttpOnly, SameSite=Lax | access state `accessExpiresAt` = 15 min; cookie = idle window | sign-in, `/api/auth/session`, `/api/auth/refresh` |
| Refresh token (opaque, 320 bit) | cookie `__Host-cd_refresh` (`cd_refresh` on http dev), HttpOnly, Secure, SameSite=Strict, Path=/ | until the session's idle expiry | sign-in, `/api/auth/refresh`; cleared by logout |

The JWT is a JWE (`dir` + `A256GCM`, key derived from `NEXTAUTH_SECRET`) with `iss`, `aud`, `iat`, `exp`, `jti`, `sid`. Only `dir`/`A256GCM` and the configured issuer/audience are accepted (`lib/authJwt.js`). Refresh tokens are stored only as HMAC-SHA256 digests.

## Flows

**Login** — `authService.createSession` inserts the session and its first refresh token in one PostgreSQL transaction, then caches the session in Redis, then the refresh cookie is set.

**OAuth sign-in (GitHub / Google)** — decided in the next-auth `signIn` callback (`app/api/auth/[...nextauth]/route.js`); `jwt` only turns the result into a session. Plan and rationale: [email-verification-plan.md](email-verification-plan.md) sections 10 and 11.
1. `lib/oauthEmail.js` gets the email the provider verified: Google `email_verified`, GitHub `/user/emails` (`primary && verified`, else any verified, never `users.noreply.github.com`). None → `/auth/error?error=OAuthEmailUnverified`.
2. `public.sign_in_with_provider` (emails compared in lower case) returns the decision. It never links by email itself:
   - `login` — the provider account is already linked;
   - `created` — new user, `email_verified = true`, username from `lib/username.js` with a numeric suffix when taken;
   - `link_required` — an existing user with the same email that was **never verified** (pending claim, mode `claim`);
   - `confirm_required` — an existing user with the same, **verified** email (mode `confirm`);
   - `blocked` — the user is not `active` → `AccessDenied`.
3. Pending OAuth claim (`link_required` / `confirm_required`): no session. The callback mails the account's email a `link_account` token right away (30 min, `{ provider, providerAccountId, providerEmail, mode }` in `email_tokens.payload`; 3 mails / 15 min per account, `link:<user>` bucket) and redirects to `/auth/link` ("check your inbox", Resend through `POST /api/auth/link/email`, Cancel). The sealed `cd_link` cookie (10 min) only feeds that page. A token is issued only while the account email still equals the provider email and its verification state still fits the mode.
4. `/auth/link/confirm?token=…&mode=…` removes the token from the URL and waits for a click (link scanners). `POST /api/auth/link/confirm { token, password? }` runs one transaction, user row locked before the token:
   - `claim` (11.1): the new password is required (8–72 characters; `422 password_required` / `weak_password` consume nothing). Every other sign-in method is deleted (an old password or a GitHub / Google added before the email was proven), the provider is linked, the new bcrypt hash becomes the only password, the email is verified, other live tokens and **every session** are revoked. The page then signs in with the new password (`signIn("credentials")`): the new session.
   - `confirm` (11.3 B): only the provider is linked; password and sessions stay. The page offers "Sign in with GitHub".
   - A provider account owned by another user → `409 in_use`, nothing changes.

**Connect / disconnect (Settings → Sign-in methods)** — `GET /api/user/accounts` lists `{ password, providers[] }`. "Connect": `POST /api/auth/link/start` seals `cd_link_intent` `{ userId, sessionId, provider }` (10 min), then the provider sign-in runs; the `signIn` callback links only when the callback request still carries that session (`sid` and user match) and returns `/settings?linked=<provider>`, so next-auth writes no new session and the current one is kept. One account per provider (`accounts_user_provider_uq`). `DELETE /api/user/accounts/:provider` refuses the last way to sign in (`409 LAST_SIGN_IN_METHOD`; a credentials row without a hash does not count).

Notices: "GitHub was connected / disconnected" mail (`email.account_notice` outbox event) after a confirmed claim (with "your password was changed" for `claim`), Settings connect and disconnect.

Audit events: `account.linked` (`reason`: `claim` | `email` | `settings`), `account.link_required` (`reason`: mode), `account.unlinked`, `account.purged`. `log_in` only returns `active` users.

**Unverified accounts (11.2, 12)** — the trigger `identity.users_purge_after` sets two deadlines on insert of an unverified user: `verify_lock_at` = sign-up + 168 hours (end of the grace period, see the lock below) and `purge_after` = sign-up + 336 hours (deletion). Verifying clears both for good. A verified account that changes its email gets `verify_lock_at` = now + 168 hours again but never `purge_after`; a never-verified account that changes its email keeps its deadlines. Migration `20261026_003` gave existing unverified accounts at least 48 hours before the lock and never moved a deletion earlier. `GET|POST /api/internal/account-maintenance[?dryRun=1]` (daily by the Inngest function `account-maintenance`; by hand with `Authorization: Bearer $CRON_SECRET` or `$AUTH_CRON_SECRET`; without Inngest the in-process outbox worker runs it every 10 min):
- 2 days before the lock: one reminder ("Verify your email by <date> to keep using CodeDev"), `lock_reminded_at` set.
- 2 days before the deletion: one reminder ("Verify your email by <date> to keep your CodeDev account"), `purge_reminded_at` set.
- The banner shows the lock date while it is ahead, then the deletion date (`/api/user/me` → `verify_lock_at`, `purge_after`).
- **Lock (12.3):** the session JWT carries `verifyLockAt` (epoch ms, `null` once verified; `lib/verifyLock.js`). It is set at sign-in and re-read from PostgreSQL by `POST /api/auth/refresh` and by `useSession().update()` (jwt `trigger: "update"`, client data ignored). Past it, `proxy.js` sends every `PRIVATE` / `PROTECTED` page to `/auth/verify-required?next=<path>` (PUBLIC pages stay open), and `getAuthSession` / `requireAuthSession` throw `403 EMAIL_VERIFICATION_REQUIRED` (`soft: true` returns `null`) unless the route passes `allowLocked: true`: `GET /api/user/me`, `PATCH /api/user/logout`, `POST /api/auth/verify-email/resend`, `POST /api/pusher/auth`, the public reads (`/api/course/courses`, `/course-details`, `/comments`, `/api/roadmap/details`), and `updateUserProfileAction` when it changes only the email. The lock is checked after the access expiry, so an expired access state still refreshes first. `lib/axios.js` and `unwrapActionResult` send a 403 with that code to the lock page. The lock page and `/auth/verify-email` call `update()` once the email is verified; other devices follow at their next refresh (≤ 15 min).
- **Connect hits another user's provider account (12.4):** an unverified account that presses Connect and comes back with a GitHub / Google account already linked to another user B gets, besides `linkError=OAuthAccountInUse`, a sealed 10-minute cookie `cd_link_conflict` (`{ userId, sessionId, provider, ownerUsername, deletable, purgeAfter }`; the OAuth round trip proved this session also controls B). Settings reads it through `GET /api/user/delete-unverified` and offers: Switch to @B (sign out, sign in with the provider), Delete @A and switch (only a never-verified account), or Stay. Nothing is merged. `POST /api/user/delete-unverified { confirm: <own username> }` (same origin, `profile` limiter) needs that cookie of the same session, deletes through `accountPurgeDb.purgeUser({ requested: true })` (still never-verified only, no orders), audits `account.purged` with `reason: user_requested` and clears the refresh cookie; the client then signs out and signs in with the provider. Verified accounts keep the plain "already linked" message.
- past the deadline: one transaction per account (`db/accountPurge.db.js`): skipped and logged when it has orders or is an actor of ledger / audit rows; sessions revoked (outbox → Redis); `roadmap.*` rows and `storage.assets` deleted; files queued (`storage.purge`: S3 objects, Cloudinary avatars); then the user row, so everything else cascades (profile, ledgers, enrolments, submissions, comments, messages, tokens, sign-in methods). The email is free again.

**Email verification** — plan: [email-verification-plan.md](email-verification-plan.md) sections 3–6.
- Sending: `emailVerificationService.request(userId)` queues `email.verify_requested` in the auth outbox and processes it at once; the handler issues a token (320-bit, stored as `HMAC("email-verify|" + token)` in `identity.email_tokens`, one live token per user, `EMAIL_VERIFY_TTL_SECONDS` = 24 h) and mails `/auth/verify-email?token=…` through `lib/mail.js` (SMTP). Failed sends are retried by the outbox; each retry issues a new token. Verified users get nothing.
- Mail transport (`lib/mailConfig.mjs`, `lib/mail.js`): see `MAIL_FROM` / `MAIL_PASSWORD` below. Connection 10 s, greeting 10 s, socket 20 s timeouts, so a slow server fails fast and the outbox retries (5 s, 10 s, … up to 5 min). The start-up log prints `mail: gmail smtp.gmail.com:465 from …` or `mailpit …`. Check an env file without the app: `npm run mail:test -- --env .env.production --to <you>` (signs in, sends one test message, never prints the password).
- Triggered by: signup (`/api/user/signup`, response `verificationSent`), an email change in Settings (`updateUserProfileAction` sets `email_verified = false`; shares the `emailVerify` budget, 429 when used up), `POST /api/auth/verify-email/resend` (signed in, same origin, `emailVerify` limiter: 3 / 15 min per user).
- Checking: `/auth/verify-email` removes the token from the URL (`referrer: no-referrer`) and calls `POST /api/auth/verify-email` (`verifyEmail` limiter, 20 / min per IP). One transaction: unknown or replaced → 400, sent to a previous email → 400, expired → 410, already used → 200 `already_verified`, else `email_verified = true` → 200 `verified`. Not a GET, so link scanners do not use the token up.
- UI: banner under the navbar (`components/auth/verifyEmailBanner.jsx`) while `/api/user/me` says `email_verified: false`; "Send verification email" next to the badge in Settings.
- Gate: `commerceService.checkout` / `redeem` → `403 EMAIL_NOT_VERIFIED` until verified. Everything else works unverified.

**API request** — `lib/session.js` decrypts the JWT, rejects an expired access state with `401 ACCESS_TOKEN_EXPIRED`, then checks the session (Redis `session:{id}`, PostgreSQL on miss). Both down → `503 AUTH_UNAVAILABLE`.

**Refresh** — `POST /api/auth/refresh` (same origin + `Idempotency-Key`). One transaction (`db/session.db.js → rotateRefreshToken`): lock session row, then token row; validate revocation / idle / absolute expiry; consume the token, insert its replacement (unique index: one current token per session), store the AEAD-sealed new token for idempotent recovery, slide the idle expiry (never past absolute). Commit, then Redis, then cookies.
- Same token + same key within `AUTH_REFRESH_RECOVERY_TTL_SECONDS` → the same new token (lost response).
- Consumed token otherwise → replay: session and all its tokens revoked, outbox event written.
- Commit not acknowledged → `503`, client retries with the same key.

**Logout / revoke** — revoke + outbox event in one transaction; the event (Redis invalidation, realtime notice) is processed right after commit. With Inngest the other outbox events (email, storage) are delivered by `outbox-deliver` and retried there, up to `max_attempts`, then kept in `ops.dead_letters`; without Inngest the in-process worker retries every 15 s.

**Client** — `lib/authRefresh.js`: single-flight per tab, Web Lock across tabs, BroadcastChannel to share results, same key across retries. Refresh 60 s before expiry while the tab is visible, or on demand after `ACCESS_TOKEN_EXPIRED` (axios interceptor / `callWithAuthRetry`), retrying the original request once. Terminal refresh errors sign every tab out.

## Revocation consistency

Revocation is committed in PostgreSQL first. Redis may say "active" until the outbox event is processed; Redis session entries live at most `AUTH_SESSION_CACHE_MAX_TTL_SECONDS` (5 min), so a revocation is enforced everywhere within that bound even if Redis writes keep failing. Access JWTs are re-checked against the session store on every API call, so an access token does not outlive its session's revocation by more than that bound.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` | — | session JWT key |
| `REFRESH_TOKEN_HASH_SECRET` | — | HMAC key for token / idempotency-key digests |
| `REFRESH_TOKEN_RECOVERY_KEY` | HKDF of the hash secret | 32 bytes base64, AES-GCM key for recovery blobs; set it explicitly in production |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | 900 | |
| `AUTH_SESSION_IDLE_TTL_SECONDS` | 1209600 (14 d) | |
| `AUTH_SESSION_ABSOLUTE_TTL_SECONDS` | 2592000 (30 d) | |
| `AUTH_REFRESH_RECOVERY_TTL_SECONDS` | 120 | |
| `AUTH_SESSION_CACHE_MAX_TTL_SECONDS` | 300 | revocation staleness bound |
| `AUTH_JWT_ISSUER` / `AUTH_JWT_AUDIENCE` | `codedev` / `codedev-web` | use distinct values per environment |
| `AUTH_ALLOWED_ORIGINS` | — | extra origins for refresh / logout |
| `AUTH_ACCEPT_LEGACY_JWT` | `true` | set `false` 30 days after deploying (all pre-iss/aud cookies expired) |
| `AUTH_CRON_SECRET` / `CRON_SECRET` | — | bearer token to run `/api/internal/account-maintenance` and `/api/internal/exp-audit` by hand; unset, they answer 404 |
| `AUTH_OUTBOX_WORKER` | on | `off` disables the in-process worker (it only runs while Inngest is not configured) |
| `MAIL_FROM` | dev: `CodeDev <dev@codedev.local>` | sending address, `you@gmail.com` or `CodeDev <you@gmail.com>`; with Gmail it must be the signed-in account |
| `MAIL_PASSWORD` | — | Google App Password of `MAIL_FROM` (spaces ignored). Set → `smtp.gmail.com:465` in any environment. Empty → development / test use Mailpit `127.0.0.1:1025`; production sends nothing (outbox retries) and the start-up check logs `mail: …` |
| `MAIL_HOST` / `MAIL_PORT` | — / 465 | optional: another SMTP provider instead of Gmail (Resend later) |
| `EMAIL_VERIFY_TTL_SECONDS` | 86400 | verification link lifetime |

## Deploying

1. Apply pending migrations: `npm run db:migrate:prod -- --yes` (now `20261023_001` OAuth linking, `_002` email tokens, `_003` link tokens, `_004` one account per provider; all additive, the old `auth_with_provider` stays for the running app version).
2. Set `REFRESH_TOKEN_RECOVERY_KEY`, distinct `AUTH_JWT_ISSUER`/`AUTH_JWT_AUDIENCE` per environment, and `AUTH_CRON_SECRET` + a scheduler if the app runs serverless.
3. Existing sessions keep working: legacy cookies are upgraded on their next `/api/auth/session` call (refresh token moved to its cookie).
