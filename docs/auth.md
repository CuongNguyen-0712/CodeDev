# Authentication

## Credentials

| Credential | Where | Lifetime | Written by |
|---|---|---|---|
| Session JWT (access) | next-auth cookie `next-auth.session-token` (`__Secure-` on https), HttpOnly, SameSite=Lax | access state `accessExpiresAt` = 15 min; cookie = idle window | sign-in, `/api/auth/session`, `/api/auth/refresh` |
| Refresh token (opaque, 320 bit) | cookie `__Host-cd_refresh` (`cd_refresh` on http dev), HttpOnly, Secure, SameSite=Strict, Path=/ | until the session's idle expiry | sign-in, `/api/auth/refresh`; cleared by logout |

The JWT is a JWE (`dir` + `A256GCM`, key derived from `NEXTAUTH_SECRET`) with `iss`, `aud`, `iat`, `exp`, `jti`, `sid`. Only `dir`/`A256GCM` and the configured issuer/audience are accepted (`lib/authJwt.js`). Refresh tokens are stored only as HMAC-SHA256 digests.

## Flows

**Login** — `authService.createSession` inserts the session and its first refresh token in one PostgreSQL transaction, then caches the session in Redis, then the refresh cookie is set.

**OAuth sign-in (GitHub / Google)** — decided in the next-auth `signIn` callback (`app/api/auth/[...nextauth]/route.js`); `jwt` only turns the result into a session. Plan and rationale: [email-verification-plan.md](email-verification-plan.md) section 10.
1. `lib/oauthEmail.js` gets the email the provider verified: Google `email_verified`, GitHub `/user/emails` (`primary && verified`, else any verified, never `users.noreply.github.com`). None → `/auth/error?error=OAuthEmailUnverified`.
2. `public.sign_in_with_provider` (emails compared in lower case) returns the decision:
   - `login` — the provider account is already linked;
   - `created` — new user, `email_verified = true`, username from `lib/username.js` with a numeric suffix when taken;
   - `linked` — an existing user with the same email **and a verified email**: the provider account is attached;
   - `link_required` — an existing user whose email was never verified: no session; the pending link goes into the sealed `cd_link` cookie (10 min) and the browser goes to `/auth/link`;
   - `blocked` — the user is not `active` → `AccessDenied`.
3. `/auth/link` asks for that user's password (5a). The credentials sign-in carries `link: "1"`; the `signIn` callback then calls `public.link_provider_account` (which also marks the email verified when it matches the provider's) and clears the cookie. A provider account owned by another user → `OAuthAccountInUse`.
4. "Email me a link instead" (5b): `POST /api/auth/link/email` (same origin, `emailVerify` limiter in its own `link:<user>` bucket) mails a `link_account` token (30 min, pending link in `email_tokens.payload`) to the account's email, only while that email is still unverified and still equals the provider email. `/auth/link/confirm` asks for a click, then `POST /api/auth/link/confirm` runs one transaction: user row locked, token consumed, every other sign-in method deleted (the password and any GitHub / Google added before the email was proven), provider linked, email verified, all sessions revoked.

**Connect / disconnect (Settings → Sign-in methods)** — `GET /api/user/accounts` lists `{ password, providers[] }`. "Connect": `POST /api/auth/link/start` seals `cd_link_intent` `{ userId, sessionId, provider }` (10 min), then the provider sign-in runs; the `signIn` callback links only when the callback request still carries that session (`sid` and user match) and returns `/settings?linked=<provider>`, so next-auth writes no new session and the current one is kept. One account per provider (`accounts_user_provider_uq`). `DELETE /api/user/accounts/:provider` refuses the last way to sign in (`409 LAST_SIGN_IN_METHOD`; a credentials row without a hash does not count).

Notices: "GitHub was connected / disconnected" mail (`email.account_notice` outbox event) after an automatic link (case 4), 5a, Settings connect and disconnect.

Audit events: `account.linked` (`reason`: `verified_email` | `password` | `email` | `settings`), `account.link_required`, `account.unlinked`. `log_in` only returns `active` users.

**Email verification** — plan: [email-verification-plan.md](email-verification-plan.md) sections 3–6.
- Sending: `emailVerificationService.request(userId)` queues `email.verify_requested` in the auth outbox and processes it at once; the handler issues a token (320-bit, stored as `HMAC("email-verify|" + token)` in `identity.email_tokens`, one live token per user, `EMAIL_VERIFY_TTL_SECONDS` = 24 h) and mails `/auth/verify-email?token=…` through `lib/mail.js` (SMTP). Failed sends are retried by the outbox; each retry issues a new token. Verified users get nothing.
- Triggered by: signup (`/api/user/signup`, response `verificationSent`), an email change in Settings (`updateUserProfileAction` sets `email_verified = false`; shares the `emailVerify` budget, 429 when used up), `POST /api/auth/verify-email/resend` (signed in, same origin, `emailVerify` limiter: 3 / 15 min per user).
- Checking: `/auth/verify-email` removes the token from the URL (`referrer: no-referrer`) and calls `POST /api/auth/verify-email` (`verifyEmail` limiter, 20 / min per IP). One transaction: unknown or replaced → 400, sent to a previous email → 400, expired → 410, already used → 200 `already_verified`, else `email_verified = true` → 200 `verified`. Not a GET, so link scanners do not use the token up.
- UI: banner under the navbar (`components/auth/verifyEmailBanner.jsx`) while `/api/user/me` says `email_verified: false`; "Send verification email" next to the badge in Settings.
- Gate: `commerceService.checkout` / `redeem` → `403 EMAIL_NOT_VERIFIED` until verified. Everything else works unverified.

**API request** — `lib/session.js` decrypts the JWT, rejects an expired access state with `401 ACCESS_TOKEN_EXPIRED`, then checks the session (Redis `session:{id}`, PostgreSQL on miss). Both down → `503 AUTH_UNAVAILABLE`.

**Refresh** — `POST /api/auth/refresh` (same origin + `Idempotency-Key`). One transaction (`db/session.db.js → rotateRefreshToken`): lock session row, then token row; validate revocation / idle / absolute expiry; consume the token, insert its replacement (unique index: one current token per session), store the AEAD-sealed new token for idempotent recovery, slide the idle expiry (never past absolute). Commit, then Redis, then cookies.
- Same token + same key within `AUTH_REFRESH_RECOVERY_TTL_SECONDS` → the same new token (lost response).
- Consumed token otherwise → replay: session and all its tokens revoked, outbox event written.
- Commit not acknowledged → `503`, client retries with the same key.

**Logout / revoke** — revoke + outbox event in one transaction; the event (Redis invalidation, realtime notice) is processed right after commit and retried by the outbox worker (every 15 s in-process, or `POST /api/internal/auth-outbox`).

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
| `AUTH_CRON_SECRET` | — | enables `POST /api/internal/auth-outbox` |
| `AUTH_OUTBOX_WORKER` | on | `off` disables the in-process worker |
| `EMAIL_USER` / `EMAIL_PASS` | — | production: Gmail address + its App Password; `lib/mail.js` then sends through `smtp.gmail.com:465` |
| `SMTP_HOST` / `SMTP_PORT` | — / 465 | any other mail server, wins over `EMAIL_*`; dev: Mailpit `127.0.0.1:1025`. Neither set: dev/test log the message, production throws (outbox retries) and the start-up check logs an error |
| `SMTP_USER` / `SMTP_PASS` | — | login for `SMTP_HOST` (Resend later: `resend` + API key) |
| `MAIL_FROM` | `CodeDev <sending address>` | optional sender; with Gmail it must be that Gmail address |
| `EMAIL_VERIFY_TTL_SECONDS` | 86400 | verification link lifetime |

## Deploying

1. Apply pending migrations: `npm run db:migrate:prod -- --yes` (now `20261023_001` OAuth linking, `_002` email tokens, `_003` link tokens, `_004` one account per provider; all additive, the old `auth_with_provider` stays for the running app version).
2. Set `REFRESH_TOKEN_RECOVERY_KEY`, distinct `AUTH_JWT_ISSUER`/`AUTH_JWT_AUDIENCE` per environment, and `AUTH_CRON_SECRET` + a scheduler if the app runs serverless.
3. Existing sessions keep working: legacy cookies are upgraded on their next `/api/auth/session` call (refresh token moved to its cookie).
