# Authentication

## Credentials

| Credential | Where | Lifetime | Written by |
|---|---|---|---|
| Session JWT (access) | next-auth cookie `next-auth.session-token` (`__Secure-` on https), HttpOnly, SameSite=Lax | access state `accessExpiresAt` = 15 min; cookie = idle window | sign-in, `/api/auth/session`, `/api/auth/refresh` |
| Refresh token (opaque, 320 bit) | cookie `__Host-cd_refresh` (`cd_refresh` on http dev), HttpOnly, Secure, SameSite=Strict, Path=/ | until the session's idle expiry | sign-in, `/api/auth/refresh`; cleared by logout |

The JWT is a JWE (`dir` + `A256GCM`, key derived from `NEXTAUTH_SECRET`) with `iss`, `aud`, `iat`, `exp`, `jti`, `sid`. Only `dir`/`A256GCM` and the configured issuer/audience are accepted (`lib/authJwt.js`). Refresh tokens are stored only as HMAC-SHA256 digests.

## Flows

**Login** — `authService.createSession` inserts the session and its first refresh token in one PostgreSQL transaction, then caches the session in Redis, then the refresh cookie is set.

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

## Deploying

1. Apply `db/migrations/20261016_001_auth_session_hardening.sql` (additive; triggers keep the previous app version working during a rolling deploy).
2. Set `REFRESH_TOKEN_RECOVERY_KEY`, distinct `AUTH_JWT_ISSUER`/`AUTH_JWT_AUDIENCE` per environment, and `AUTH_CRON_SECRET` + a scheduler if the app runs serverless.
3. Existing sessions keep working: legacy cookies are upgraded on their next `/api/auth/session` call (refresh token moved to its cookie).
