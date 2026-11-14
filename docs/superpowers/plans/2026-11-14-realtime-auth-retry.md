# Realtime Auth Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tab reopened after idle keeps its Pusher private channel and its Beams binding: both auth calls refresh an expired access state and retry once.

**Architecture:** One fetch helper (`fetchWithAuthRetry`) applies the same rule as `lib/axios.js` (401 `ACCESS_TOKEN_EXPIRED` -> `refreshSession({ ifOlderThan })` -> retry once). pusher-js uses it through `channelAuthorization.customHandler`; Beams through a custom `tokenProvider` object. A safety net in `lib/pusherClient.js` resubscribes failed channels on acquire and on the `refreshed` auth event.

**Tech Stack:** Next.js 16, next-auth 4, pusher-js 8.6.0, @pusher/push-notifications-web 1.1.0, vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-realtime-auth-retry-design.md`

## Global Constraints

- At most one retry per auth call; retry only on status 401 with body `code === AUTH_ERROR.ACCESS_TOKEN_EXPIRED` (`constants/auth.js`).
- Never retry 401 `UNAUTHENTICATED`, 403, 429 or 5xx.
- Error bodies are `{ success: false, code, message }` (same as `lib/axios.js` reads).
- Requests use `credentials: "same-origin"`, `cache: "no-store"`.
- Auth endpoints and their responses stay unchanged: `POST /api/pusher/auth` (form data `socket_id`, `channel_name`, Pusher's own JSON), `GET /api/pusher/beams-auth?user_id=…` (`{ token }`).
- No gate before mounting `UserRealtimeBridge`; no change to `proxy.js`.
- Run tests with `npx vitest run <path>`; full suite `npm test`.

## Review Focus

1. Pusher and Beams both get 401 on the same page load -> exactly one `POST /api/auth/refresh` (Task 1 test `shares one refresh between concurrent expired calls`).
2. Refresh fails for good (terminal 401) -> auth call ends with the original 401, no loop; `SessionWatcher` handles `signed-out` (Task 1 test `returns the original 401 when the refresh fails`).
3. A 401 body that is not JSON (proxy HTML, empty) -> treated as not expired, returned as is (Task 1 test `does not retry a 401 without a JSON body`).
4. Offline during channel auth -> `callback(error)`, nothing thrown out of the handler (Task 2 test `passes a network error to the callback`).
5. Sign out after the safety net is armed -> a later `refreshed` event creates no new client and subscribes nothing (Task 2 test `stops listening for refreshed after disconnectPusher`).

---

### Task 1: `fetchWithAuthRetry` helper

**Files:**
- Modify: `lib/authRefresh.js` (append export after `refreshSession`)
- Test: `__tests__/auth/fetchWithAuthRetry.test.js` (new; same setup as the `client refresh (lib/authRefresh)` block in `__tests__/auth/units.test.js`: `vi.resetModules()`, `globalThis.window = globalThis`, `globalThis.fetch = fetchMock`, dynamic import)

**Interfaces:**
- Produces: `export async function fetchWithAuthRetry(input: string, init?: RequestInit): Promise<Response>` — returns the final `Response`; rejects only on network error (from `fetch` itself).

- [ ] **Step 1: Write the failing tests**

Route `fetchMock` by URL: `/api/auth/refresh` answers the refresh, anything else answers the target. Response helpers like `units.test.js` (`ok`, `fail(status, code)`), plus `clone()` returning itself.

```js
it("retries once after refreshing on 401 ACCESS_TOKEN_EXPIRED", async () => {
    target.mockResolvedValueOnce(fail(401, "ACCESS_TOKEN_EXPIRED")).mockResolvedValueOnce(ok({ auth: "a" }));
    refresh.mockResolvedValue(okRefresh());
    const res = await mod.fetchWithAuthRetry("/api/pusher/auth", { method: "POST" });
    expect(res.status).toBe(200);
    expect(target).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(target.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
});
it("does not retry a second 401", ...)            // target 401 expired twice -> res.status 401, target x2, refresh x1
it.each([[401, "UNAUTHENTICATED"], [403, "FORBIDDEN"], [429, "RATE_LIMITED"], [503, "AUTH_UNAVAILABLE"]])(
    "returns %i %s as is", ...)                    // target x1, refresh x0
it("does not retry a 401 without a JSON body", ...) // json() rejects -> status 401, target x1, refresh x0
it("returns the original 401 when the refresh fails", ...) // refresh -> fail(401, "REFRESH_TOKEN_REUSED") -> status 401, target x1
it("shares one refresh between concurrent expired calls", ...) // two calls in Promise.all, each target 401 then 200 -> refresh x1, both 200
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run __tests__/auth/fetchWithAuthRetry.test.js`
Expected: FAIL — `mod.fetchWithAuthRetry is not a function`.

- [ ] **Step 3: Implement `fetchWithAuthRetry(input, init)` in `lib/authRefresh.js`**

Record `startedAt = Date.now()`; `fetch(input, { credentials: "same-origin", cache: "no-store", ...init })`. If status is 401, read `code` from `response.clone().json()` (catch -> null). Only on `ACCESS_TOKEN_EXPIRED`: `await refreshSession({ ifOlderThan: startedAt })` in try/catch (failure -> return the first response), then return one more `fetch` with the same arguments. Import `AUTH_ERROR` from `@/constants/auth` next to `TERMINAL_REFRESH_ERRORS`. JSDoc one line pointing to `lib/axios.js` for the same rule.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run __tests__/auth/fetchWithAuthRetry.test.js __tests__/auth/units.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/authRefresh.js __tests__/auth/fetchWithAuthRetry.test.js
git commit -m "feat(auth): fetchWithAuthRetry refreshes an expired access state and retries once"
```

---

### Task 2: Pusher channel auth through the helper + resubscribe safety net

**Files:**
- Modify: `lib/pusherClient.js` (client options, `acquireChannel`, `disconnectPusher`, new listener)
- Test: `__tests__/realtime/pusherAuth.test.js` (new; mock `pusher-js` ctor like `__tests__/chat/pusherConnected.test.js`, mock `@/lib/authNavigation`, mock `@/lib/authRefresh` with `fetchWithAuthRetry: vi.fn()` and `onAuthEvent: vi.fn()` capturing the listener and returning an unsubscribe `vi.fn()`)

**Interfaces:**
- Consumes: `fetchWithAuthRetry(input, init): Promise<Response>` (Task 1); existing `onAuthEvent(listener): () => void` from `lib/authRefresh.js` (messages `{ type: "refreshed" | "signed-out" | "logged-out" }`).
- Produces: no new exports. `getPusherClient`, `acquireChannel`, `releaseChannel`, `disconnectPusher`, `isPusherConnected` keep their signatures.

Fake pusher instance for tests: `{ connection: { state, bind: vi.fn() }, channel: vi.fn(name => channels[name]), subscribe: vi.fn(), unsubscribe: vi.fn(), disconnect: vi.fn() }`; fake channel `{ subscribed, subscriptionPending }`.

- [ ] **Step 1: Write the failing tests**

```js
it("authorizes channels with a custom handler posting form data", async () => {
    getPusherClient();
    const { customHandler } = ctor.mock.calls[0][1].channelAuthorization;
    fetchWithAuthRetry.mockResolvedValue({ ok: true, status: 200, json: async () => ({ auth: "k:sig" }) });
    const callback = vi.fn();
    await customHandler({ socketId: "1.2", channelName: "private-user-u1" }, callback);
    const [url, init] = fetchWithAuthRetry.mock.calls[0];
    expect(url).toBe("/api/pusher/auth");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toBe("socket_id=1.2&channel_name=private-user-u1");
    expect(callback).toHaveBeenCalledWith(null, { auth: "k:sig" });
});
it("passes a non-2xx status to the callback as an error", ...) // 403 -> callback(Error with .status 403, null)
it("passes a network error to the callback", ...)              // fetchWithAuthRetry rejects -> callback(error, null), handler resolves
it("acquireChannel resubscribes a channel that failed", ...)   // channel {subscribed:false, subscriptionPending:false} exists -> pusher.subscribe called
it("acquireChannel leaves a pending or subscribed channel alone", ...) // subscribe not called
it("resubscribes held failed channels on refreshed", ...)      // acquire "private-user-u1", mark failed, fire listener({type:"refreshed"}) -> subscribe("private-user-u1"); a released channel is not resubscribed
it("stops listening for refreshed after disconnectPusher", ...) // unsubscribe fn called; firing the old listener calls no ctor and no subscribe
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run __tests__/realtime/pusherAuth.test.js`
Expected: FAIL — `channelAuthorization.customHandler` is undefined.

- [ ] **Step 3: Implement in `lib/pusherClient.js`**

- `channelAuthorization: { customHandler: authorizeChannel }` replacing `endpoint`/`transport` (keep the existing comment, reworded to mention the expired-access retry). `authorizeChannel({ socketId, channelName }, callback)` is `async`, posts `new URLSearchParams({ socket_id, channel_name })` with header `Content-Type: application/x-www-form-urlencoded` through `fetchWithAuthRetry`; 2xx -> `callback(null, await res.json())`; else `callback(Object.assign(new Error(\`Channel authorization failed (${res.status})\`), { status: res.status }), null)`; catch -> `callback(error, null)`.
- `isFailed(channel) = channel && !channel.subscribed && !channel.subscriptionPending`. `acquireChannel`: existing channel that `isFailed` -> `pusher.subscribe(name)`; otherwise unchanged.
- On client creation: `stopAuthListener = onAuthEvent(msg => msg?.type === "refreshed" && resubscribeFailed())`; `resubscribeFailed` walks `channelRefs` keys on the existing instance only (never `getPusherClient()`), resubscribing `isFailed` ones.
- `disconnectPusher`: call and clear `stopAuthListener` before `disconnect()`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run __tests__/realtime/pusherAuth.test.js __tests__/chat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pusherClient.js __tests__/realtime/pusherAuth.test.js
git commit -m "fix(realtime): channel auth refreshes an expired access state; failed channels resubscribe"
```

---

### Task 3: Beams token provider through the helper

**Files:**
- Modify: `lib/beamsClient.js` (`bind`, drop the now-unused `sdk` module variable if nothing else reads it)
- Modify test: `__tests__/notifications/beamsClient.test.js` (replace the three `TokenProvider` assertions at lines 82-83, 126, 179; mock `@/lib/authRefresh` with `fetchWithAuthRetry: vi.fn()`)

**Interfaces:**
- Consumes: `fetchWithAuthRetry(input, init): Promise<Response>` (Task 1).
- Produces: none new. `enableWebPush`, `disableWebPush`, `resumeWebPush`, `stopWebPush` unchanged.

- [ ] **Step 1: Update and add tests**

Replace `expect(TokenProvider)...` / `expect.any(TokenProvider)` with `expect(sdk.setUserId).toHaveBeenCalledWith("P1", expect.objectContaining({ fetchToken: expect.any(Function) }))`.

```js
it("fetches the Beams token through the auth retry helper", async () => {
    permission = "granted";
    fetchWithAuthRetry.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "t" }) });
    sdk.setUserId.mockImplementation(async (id, provider) => provider.fetchToken(id));
    await client.enableWebPush("P 1");
    expect(fetchWithAuthRetry).toHaveBeenCalledWith("/api/pusher/beams-auth?user_id=P%201", expect.objectContaining({ method: "GET" }));
});
it("a token request that still fails throws with its status", ...) // 401 -> enableWebPush rejects with { status: 401 }, flag not set
it("resumeWebPush rebinds after an expired access state", ...)    // helper resolves 200 -> setUserId resolved, no console.error
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run __tests__/notifications/beamsClient.test.js`
Expected: FAIL — `fetchWithAuthRetry` not called / provider is a `TokenProvider`.

- [ ] **Step 3: Implement in `lib/beamsClient.js`**

Module-level `tokenProvider = { fetchToken: async (userId) => … }`: `fetchWithAuthRetry(\`${TOKEN_URL}?user_id=${encodeURIComponent(userId)}\`, { method: "GET" })`; non-2xx throws `Object.assign(new Error(\`Beams token request failed (${res.status})\`), { status: res.status })`; else returns `res.json()`. `bind` passes `tokenProvider` to `client.setUserId`. Update the file's top JSDoc with one line on why (expired access after idle).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run __tests__/notifications __tests__/auth/signOutWebPush.test.js`
Expected: PASS.

- [ ] **Step 5: Full suite + lint**

Run: `npm test` then `npx eslint lib/authRefresh.js lib/pusherClient.js lib/beamsClient.js`
Expected: all tests pass; no lint errors.

- [ ] **Step 6: Manual check in Chrome**

`npm run dev`, sign in, turn web push on, wait past the access window (or temporarily lower it locally, not committed), reload. Network tab: `/api/pusher/auth` and `/api/pusher/beams-auth` may show one 401 each, followed by one `/api/auth/refresh` and a 200 retry; no `subscription_error` in the console; a progress event from another tab still reaches this tab.

- [ ] **Step 7: Commit**

```bash
git add lib/beamsClient.js __tests__/notifications/beamsClient.test.js
git commit -m "fix(push): Beams token request refreshes an expired access state and retries once"
```
