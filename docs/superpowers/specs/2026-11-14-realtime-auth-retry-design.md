# Realtime auth retry (Pusher Channels + Beams) — design

Date: 2026-11-14 · Size: small change

## Intent

A tab reopened after idling longer than the access window (15 min) loses its realtime
subscriber and its web push binding. The page loads with a live session cookie but an expired
access state (`proxy.js` does not refresh), `useSession` reports `authenticated`, and
`AuthSessionWatcher` mounts `UserRealtimeBridge` and calls `resumeWebPush` at once — racing the
proactive refresh in `SessionWatcher`.

- pusher-js posts `/api/pusher/auth` with its own ajax transport -> 401 `ACCESS_TOKEN_EXPIRED`
  -> `pusher:subscription_error`, and the channel is never subscribed again. A remount does not
  help: `acquireChannel` returns the existing (failed) channel from `pusher.channel(name)`.
- Beams' `TokenProvider` GETs `/api/pusher/beams-auth` with its own fetch -> 401 -> `setUserId`
  throws -> `[Beams Client] resume failed`, device not rebound.

Both calls bypass the 401 `ACCESS_TOKEN_EXPIRED` -> refresh -> retry-once rule that axios
(`lib/axios.js`) and server actions (`callWithAuthRetry` in `lib/actionResult.js`) follow.
The same gap breaks a hidden tab that reconnects after a network drop: pusher-js re-authorizes
every channel with the expired cookie (hidden tabs do not refresh proactively).

## Goals

- First mount after idle: private channel subscribes and the Beams device rebinds, with no
  401 left unhandled.
- Reconnect in a hidden tab with expired access: channel re-authorizes successfully.
- One refresh request per tab for any burst of 401s (reuse `refreshSession` dedupe).

## Non-goals

- Refreshing in `proxy.js` on page load.
- Changing the access window, the refresh endpoint, or the auth routes' responses.
- The public broadcast channel (no auth involved).

## Anti-goals

- A retry loop: at most one retry per auth call.
- Retrying 401 `UNAUTHENTICATED`, 403 (forbidden channel, verify lock) or 429 — these are final.
- Delaying realtime for users whose access is still valid (no gate before mounting).

## Approaches

- **A. Refresh + retry inside the SDKs' auth hooks — chosen.** pusher-js 8.6
  `channelAuthorization.customHandler` and a custom Beams `tokenProvider` (`fetchToken(userId)`)
  both call one helper that applies the axios rule. Fixes first mount and hidden-tab reconnect.
- B. Wait for `refreshSession()` before mounting the bridge / resuming push. Least code, but
  fixes first mount only and adds a refresh round-trip before realtime.
- C. Refresh in `proxy.js` on page load. Token rotation in the proxy (idempotency, many tabs)
  is risky, and it still misses the hidden-tab reconnect.

## Design

1. **`fetchWithAuthRetry(input, init)`** in `lib/authRefresh.js` (next to `refreshSession`):
   records `startedAt`, fetches with `credentials: "same-origin"`, `cache: "no-store"`; on
   401 whose JSON body `code` is `ACCESS_TOKEN_EXPIRED`, awaits
   `refreshSession({ ifOlderThan: startedAt })` and fetches once more. Returns the final
   `Response`. A failed refresh returns the original 401 (a terminal failure already broadcasts
   `signed-out`, which `SessionWatcher` handles). Each attempt gets its own 10 s timeout
   (`AbortSignal.timeout`) unless the caller passes a signal, so a hung request cannot leave a
   channel pending for good.
2. **Pusher** (`lib/pusherClient.js`): replace `{ endpoint, transport }` with
   `customHandler({ socketId, channelName }, callback)` that POSTs form data
   (`socket_id`, `channel_name`) to `/api/pusher/auth` through the helper; `callback(null, json)`
   on 2xx, else `callback(error)`. The callback runs once, outside the `try`. pusher-js copies
   `status` into `subscription_error` only for its own `HTTPAuthError`, so the status reaches
   the dev log inside the message ("Channel authorization failed (403)"), not as a field.
3. **Safety net** (`lib/pusherClient.js`):
   - `acquireChannel` always returns `pusher.subscribe(name)`: idempotent for a subscribed or
     pending channel, resends for a failed one, reinstates one whose unsubscribe is pending.
   - On an auth `refreshed` event (`onAuthEvent`), every held channel that is neither subscribed
     nor pending is resubscribed, at most once a minute per channel (two tabs whose refreshed
     session still answered `ACCESS_TOKEN_EXPIRED` would otherwise drive each other).
   - A 408, 429, 5xx or network error on channel auth schedules one resubscribe for that channel:
     `Retry-After` when given, else 10 s doubling up to 5 min, reset on success; dropped on
     release and on sign out. 401 and 403 are never retried this way.
   - `releaseChannel` uses the existing client only, so an unmount after sign out opens nothing.
4. **Beams** (`lib/beamsClient.js`): `bind()` passes
   `{ fetchToken: (userId) => fetch-with-retry GET /api/pusher/beams-auth?user_id=… -> json }`
   instead of `new sdk.TokenProvider(...)`; throws `Beams token request failed (<status>)` with
   `.status` on non-2xx. That message does not match `isGone`, so a 404 from our own route no
   longer resets the device (only Beams reporting the device gone does).
5. **Tests** (vitest): helper — 401 expired -> refresh -> retry ok; second 401 not retried;
   other 401/403/429 not retried; refresh failure returns original. Pusher handler — callback
   success / error. Safety net — failed channel resubscribed on acquire and on `refreshed`.
   Beams — `bind` uses the custom provider and recovers from one expired 401.

## Left to the builder

- Exact error body shape read from `ApiError` responses (`code` field location) — match what
  `lib/axios.js` reads.
- Whether the helper lives in `lib/authRefresh.js` or a sibling module, if `authRefresh.js`
  must stay free of non-refresh fetches.
- Manual check in Chrome: sign in, set the access expiry short (or wait 15 min), reload — no
  401 left in the network tab for `/api/pusher/auth` and `/api/pusher/beams-auth`.
