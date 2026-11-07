# Beams Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each new `profile.notification` row is also sent as a browser push (Pusher Beams) to the devices where the user turned push on. A push is not shown while a tab of the site has focus.

**Architecture:** A server-only `lib/beams.js` calls the Beams REST API with `fetch` and signs Beams Tokens with `jose`. It mirrors `lib/pusher.js`: awaited, 3 s timeout, never throws. `notify` and the announcement batch call it next to the existing Channels publish. On the browser side, `lib/beamsClient.js` lazily loads `@pusher/push-notifications-web`. It binds the device to the user's public id through `/api/pusher/beams-auth`, and a Settings switch drives it.

**Tech Stack:** Next.js 16 (app router), next-auth 4, `jose` 6, `@pusher/push-notifications-web` 1.x, Inngest, vitest 5 (node; jsdom per file).

**Spec:** `docs/superpowers/specs/2026-11-07-beams-web-push-design.md`

## Global Constraints

- Env vars:
  - `BEAMS_INSTANCE_ID` (server) and `NEXT_PUBLIC_BEAMS_INSTANCE_ID` (client) both hold the Instance ID.
  - `BEAMS_SECRET_KEY` holds the Primary key. It is server only: never `NEXT_PUBLIC_`, never committed, never logged.
- Beams base URL: `https://{instanceId}.pushnotifications.pusher.com`. Auth header: `Authorization: Bearer {BEAMS_SECRET_KEY}`.
- Publish path: `POST /publish_api/v1/instances/{id}/publishes/users`.
  - At most 1000 users per request.
  - User id: non-empty, at most 164 characters.
- Delete path: `DELETE /user_api/v1/instances/{id}/users/{encodeURIComponent(userId)}`. This is the Node SDK's path; the docs give `/customer_api/v1/...`. Confirm it against the real instance in Task 8.
- Beams Token:
  - HS256 signed with `BEAMS_SECRET_KEY`.
  - Claims: `sub = userId`, `iss = https://{instanceId}.pushnotifications.pusher.com`, `iat`, `exp = iat + 24h`.
  - Response body: `{ "token": "<jwt>" }`.
- Payload: `web.time_to_live = 86400` and `web.notification = { title, body, deep_link, hide_notification_if_site_has_focus: true }`.
  - `deep_link` = `new URL(link || "/notifications", NEXTAUTH_URL origin).href`.
  - No `data` key.
- Every server Beams call is awaited, uses `AbortSignal.timeout(3000)`, never throws, and returns a boolean.
- Missing Beams env:
  - Server: warn once, then no-op.
  - Client: the Settings switch shows "Not supported on this browser."
- Copy is English, as in the rest of the app.
- Tests never call Beams. `vitest.config.mjs` blanks `BEAMS_*`, and tests use `vi.stubEnv` plus a mocked `fetch`.
- The working tree holds unrelated uncommitted changes. Each commit stages only that task's files. Commit only if the user has approved commits for this run.

## Review Focus

1. **Beams down or slow while a learner redeems a course.** `notify` still returns the row. The push failure is logged, never thrown. Pinned in Task 3 (`push failure does not fail notify`).
2. **A retried announcement batch** (Inngest replays a step, 0 rows inserted) sends no second push. Pinned in Task 4 (`a replayed batch pushes nobody`).
3. **Two people share one browser.** B signing in after A turned push on must not get A's pushes, and B is not opted in. Pinned in Task 6 (`resume for another user stops the old binding and does not opt in`).
4. **The user blocks notifications in browser settings after turning push on.** Resume is a no-op, and Settings shows "Blocked in your browser settings." Pinned in Task 6 (`resume does nothing without granted permission`) and Task 7 (`shows blocked state`).
5. **A notification with no `link`** (or a malformed user id) still produces a valid absolute `deep_link`. Bad ids are dropped before the request. Pinned in Task 1 (`deep_link falls back to /notifications`, `drops empty and over-long ids`).

---

### Task 1: `lib/beams.js` server client

**Files:**
- Create: `lib/beams.js`
- Create: `__tests__/notifications/beams.test.js`
- Modify: `vitest.config.mjs` (add `BEAMS_INSTANCE_ID: ""`, `BEAMS_SECRET_KEY: ""` to `test.env`)
- Modify: `.env.example` (below the `# --- Realtime (Pusher)` block: `# --- Web push (Pusher Beams)` with the three empty keys and a comment that `BEAMS_SECRET_KEY` is the Primary key, server only)
- Modify: `docs/environments.md` (one row or paragraph for the three Beams vars next to the Pusher ones)

**Interfaces:**
- Produces:
  - `beamsToken(userId: string): Promise<{ token: string } | null>`: null when not configured.
  - `pushToUsers(userIds: string[], { title: string, body: string, link?: string|null }): Promise<boolean>`
  - `deleteBeamsUser(userId: string): Promise<boolean>`
  - `beamsConfigured(): boolean`

- [ ] **Step 1: Write the failing tests** in `__tests__/notifications/beams.test.js`. Setup:
  - `vi.stubEnv("BEAMS_INSTANCE_ID", "inst")`, `vi.stubEnv("BEAMS_SECRET_KEY", "s".repeat(32))`.
  - `globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 }))`.
  - Import the module fresh per test with `vi.resetModules()`.

  Tests:
  - `pushes one request per 1000 users`: 2001 ids → 3 `fetch` calls. Call 1 URL is `https://inst.pushnotifications.pusher.com/publish_api/v1/instances/inst/publishes/users`, method `POST`, header `Authorization: Bearer sss…`, body `users.length === 1000`. Call 3 has `users.length === 1`.
  - `sends the web notification payload`: body equals `{ users: ["P1"], web: { time_to_live: 86400, notification: { title: "Course unlocked", body: "You now…", deep_link: "http://localhost:3000/course/c1", hide_notification_if_site_has_focus: true } } }`.
  - `deep_link falls back to /notifications`: `link: null` → `"http://localhost:3000/notifications"`.
  - `drops empty and over-long ids`: `["", "x".repeat(165), "P1"]` → one call with `users: ["P1"]`. `[""]` → no call, returns `false`.
  - `returns false and never throws on HTTP error or timeout`: fetch resolves `status: 500` → `false`. Fetch rejects with `new DOMException("t", "TimeoutError")` → `false`. Each call passes a `signal`.
  - `is a no-op without config`: `vi.stubEnv("BEAMS_SECRET_KEY", "")` → `pushToUsers` returns `false`, `fetch` not called, `beamsToken` returns `null`, `beamsConfigured()` false.
  - `signs a Beams Token`: `jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"], issuer: "https://inst.pushnotifications.pusher.com", subject: "P1" })` succeeds, and `exp - iat === 86400`.
  - `deletes a user by encoded id`: `deleteBeamsUser("a b")` → `DELETE https://inst.pushnotifications.pusher.com/user_api/v1/instances/inst/users/a%20b`, returns `true`. A 404 response → `false`.

- [ ] **Step 2: Run** `npx vitest run __tests__/notifications/beams.test.js`. Expected: FAIL, cannot resolve `@/lib/beams`.

- [ ] **Step 3: Implement `lib/beams.js`.**
  - Read env on every call, not at import, so tests can stub it.
  - Warn once when not configured, as `getPusherServer` does.
  - The origin comes from `process.env.NEXTAUTH_URL`.
  - Sign with `new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuer(iss).setIssuedAt().setExpirationTime("24h")`.
  - Send chunks one after another. Return `true` only if every chunk got a 2xx.
  - Log failures as `[Beams] ...` with `error?.message` only, never the key.
  - Header comment: one line on why it is awaited (same reason as `publish` in `lib/pusher.js`).

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Commit**: `git add lib/beams.js __tests__/notifications/beams.test.js vitest.config.mjs .env.example docs/environments.md` and `git commit -m "feat: Beams server client for web push (publish to users, token, delete user)"`.

### Task 2: Beams Token endpoint

**Files:**
- Create: `app/api/pusher/beams-auth/route.js`
- Create: `__tests__/notifications/beamsAuthRoute.test.js`

**Interfaces:**
- Consumes: `beamsToken(userId)` from Task 1.
- Produces: `GET /api/pusher/beams-auth?user_id=<publicId>` → 200 `{ token }` | 401 | 403 | 503. Task 6 points the `TokenProvider` at this URL.

- [ ] **Step 1: Write the failing tests.** Mock `@/lib/session`, `@/lib/requestGuard`, `@/lib/rateLimit` (with `rateLimiters.realtime`) the way `__tests__/notifications/notificationsRoute.test.js` does, and mock `@/lib/beams` `beamsToken`. Tests:
  - `is 401 signed out`.
  - `is 403 for another user's id`: session user `P1`, `?user_id=P2` → 403, `beamsToken` not called.
  - `returns the token for the session user`: `?user_id=P1` → 200, JSON `{ token: "jwt" }`, header `Cache-Control: no-store`.
  - `is 503 when Beams is not configured`: `beamsToken` resolves `null` → 503.

- [ ] **Step 2: Run** `npx vitest run __tests__/notifications/beamsAuthRoute.test.js`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `GET`** with `apiRoute` and `{ context: "api/pusher/beams-auth", limiter: rateLimiters.realtime }`, the pattern of `app/api/pusher/auth/route.js`.
  - Read `user_id` from `new URL(req.url).searchParams`.
  - Return `NextResponse.json(await beamsToken(userId), { headers: { "Cache-Control": "no-store" } })`, the bare Beams shape without the envelope.
  - Docblock: the TokenProvider sends a GET with `user_id` and the same-origin cookies.

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Commit**: `feat: Beams Token endpoint for the signed-in user`.

### Task 3: Push every new inbox row

**Files:**
- Modify: `services/notification.service.js` (`notify`)
- Modify: `__tests__/notifications/notificationService.test.js`
- Modify, adding the mock only: every test that imports `notification.service` without mocking it. Find them with `grep -rln "notification.service\|notifyCourse\|notifyRewards" __tests__`, then add `vi.mock("@/lib/beams", () => ({ pushToUsers: vi.fn(async () => true) }))` where `@/lib/pusher` is already mocked. Example: `__tests__/notifications/producers.test.js`.

**Interfaces:**
- Consumes: `pushToUsers` from Task 1.
- Produces: no new exports. `notify` keeps its signature and return value.

- [ ] **Step 1: Write the failing tests** in `notificationService.test.js` (add a `pushToUsers` mock next to `publishToUser`):
  - `pushes the new row to the user's devices`: the row is written → `pushToUsers` called with `(["u1"], { title: "Level 2 reached", body: "x", link: null })`.
  - `does not push an already-notified fact`: `insert` returns `{ rows: [] }` → `pushToUsers` not called.
  - `push failure does not fail notify`: `pushToUsers` resolves `false` → `notify` still returns the row. `pushToUsers` rejects → `notify` returns the row, not null. The publish and the push are independent, so wrap the push in a `.catch` that logs.
  - Extend `waits for the publish before resolving` so it also holds `pushToUsers` pending and asserts `settled === false` until both resolve.

- [ ] **Step 2: Run** `npx vitest run __tests__/notifications`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** In `notify`, after the row exists: `await Promise.all([publishToUser(...), pushToUsers([userId], { title, body: message, link }).catch(log)])`. Add the mock to the other test files that import the service.

- [ ] **Step 4: Run** `npx vitest run __tests__/notifications`. Expected: all PASS.

- [ ] **Step 5: Commit**: `feat: push new inbox rows through Beams`.

### Task 4: Push announcement copies per batch

**Files:**
- Modify: `db/announcement.db.js` (`deliverBatch`)
- Modify: `services/announcement.service.js` (`deliverBatch`, `deliver`)
- Modify: `__tests__/notifications/announcementService.test.js`
- Modify: `__tests__/notifications/announcement.integration.test.js`

**Interfaces:**
- Consumes: `pushToUsers` from Task 1. `announcement` from `startSending` has `{ id, title, body, link, audience }`.
- Produces:
  - `announcementDb.deliverBatch(...)` → `{ lastId, selected, inserted, userIds: string[] }`. `userIds` holds the public ids of the rows just inserted.
  - `announcementService.deliverBatch(announcement, afterId)` → `{ lastId, selected, inserted }`. `userIds` is stripped so the Inngest step output stays small. `jobs/announcement.js` is unchanged.

- [ ] **Step 1: Write the failing tests.**
  - Integration (`announcement.integration.test.js`, the existing "copies once" case): `first.userIds` sorted equals `[a.publicId, b.publicId]` sorted, and `again.userIds` equals `[]`.
  - Unit (`announcementService.test.js`, mock `@/lib/beams`):
    - `pushes each batch's new recipients`: `db.deliverBatch` resolves `{ lastId: "9", selected: 2, inserted: 2, userIds: ["P1", "P2"] }` → `announcementService.deliverBatch(announcement, "0")` resolves `{ lastId: "9", selected: 2, inserted: 2 }`, and `pushToUsers` was called with `(["P1", "P2"], { title: "Maintenance", body: "Down at 22:00", link: null })`.
    - `a replayed batch pushes nobody`: `userIds: []` → `pushToUsers` not called.
    - The existing `deliver` test: `deliver` now goes through `announcementService.deliverBatch`. The assertion `db.deliverBatch` `toHaveBeenNthCalledWith(2, { announcement, afterId: "100", limit: BATCH })` stays.

- [ ] **Step 2: Run** `npx vitest run __tests__/notifications/announcementService.test.js __tests__/notifications/announcement.integration.test.js`. Expected: new assertions FAIL. The integration file needs `DATABASE_URL`; it is skipped where the repo skips it.

- [ ] **Step 3: Implement.**
  - DB: add to the final `SELECT` `(SELECT COALESCE(array_agg(u.public_id ORDER BY u.id), '{}') FROM ins JOIN identity.users u ON u.id = ins.user_id) AS user_ids`, and return `userIds: rows[0]?.user_ids ?? []`.
  - Service:
    - `deliverBatch` calls the db, pushes when `userIds.length`, and returns the batch without `userIds`.
    - `deliver` calls `announcementService.deliverBatch` instead of the db directly.
    - `link` passes through as stored; an empty string becomes `null`.

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Commit**: `feat: push admin announcements to recipients batch by batch`.

### Task 5: Drop a user's devices when a session is revoked remotely

**Files:**
- Modify: `services/authOutbox.service.js` (`"session.revoked"` handler)
- Create: `__tests__/auth/outboxBeams.test.js`

**Interfaces:**
- Consumes: `deleteBeamsUser` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests.** Unit test through `processAuthOutbox({ ids: [1] })` with these mocks:
  - `@/db/session.db`: `claimOutbox` returns one row `{ id: 1, event_type: "session.revoked", attempts, payload: { userId: "P1", sessionIds: ["s1"], reason } }`; `completeOutbox`, `failOutbox`.
  - `@/lib/cache`: `redis.setOrThrow`.
  - `@/lib/pusher`: `publishToUser`.
  - `@/lib/beams`: `deleteBeamsUser`.
  - `@/lib/inngest`: `inngest.send`, `outboxViaInngest: () => false`.
  - `@/db/emailToken.db` and `@/db/deadLetter.db`: empty objects.

  Tests:
  - `remote revoke removes the user's push devices once`: `reason: "revoked"`, `attempts: 1` → `deleteBeamsUser` called with `"P1"`.
  - `a plain logout keeps them`: `reason: "logout"` → not called.
  - `a retry does not delete again`: `attempts: 2` → not called.
  - `a Beams failure does not fail the event`: `deleteBeamsUser` resolves `false` → result `{ processed: 1, failed: 0 }`.

- [ ] **Step 2: Run** `npx vitest run __tests__/auth/outboxBeams.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** Inside the existing `if (attempts === 1 && payload.userId)` block, after `publishToUser`: `if (payload.reason !== "logout") await deleteBeamsUser(payload.userId);`. Add a one-line comment: the other devices bind again on their next page load.

- [ ] **Step 4: Run** `npx vitest run __tests__/auth/outboxBeams.test.js __tests__/auth/outboxDelivery.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**: `feat: revoking a session remotely removes the user's push devices`.

### Task 6: Browser client: service worker, device binding, sign-out

**Files:**
- Modify: `package.json` / `package-lock.json`: keep `"@pusher/push-notifications-web": "^1.1.0"` in `dependencies`. Restore only that line from the working-tree removal (`npm install @pusher/push-notifications-web@^1.1.0`). Leave the other uncommitted dependency edits as they are.
- Create: `public/service-worker.js`, containing exactly `importScripts("https://js.pusher.com/beams/service-worker.js");`
- Create: `lib/beamsClient.js`
- Modify: `lib/authNavigation.js`: add `setWebPushStop(fn)` next to `setRealtimeDisconnect`, and call it in `dropClientState` after `disconnectRealtime?.()`.
- Modify: `components/realtime/userRealtimeBridge.jsx`: add `useEffect(() => { if (userId) resumeWebPush(userId); }, [userId])`.
- Create: `__tests__/notifications/beamsClient.test.js` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `/api/pusher/beams-auth` (Task 2).
- Produces (all `"use client"`, safe to import during SSR):
  - `webPushState(userId): "unsupported" | "blocked" | "on" | "off"`. `on` means permission `granted` and the flag `webpush:{userId}` is set.
  - `enableWebPush(userId): Promise<"on" | "blocked" | "off">`: `"off"` when the prompt is dismissed.
  - `disableWebPush(userId): Promise<void>`
  - `resumeWebPush(userId): Promise<void>`
  - `stopWebPush(): Promise<void>`

- [ ] **Step 1: Write the failing tests.**
  - Setup:
    - `vi.mock("@pusher/push-notifications-web", ...)` with a `Client` class whose `start`, `setUserId`, `getUserId`, `stop` are spies, plus a `TokenProvider` spy.
    - Stub `window.Notification` (`permission`, `requestPermission`), `navigator.serviceWorker`, `window.PushManager`.
    - `vi.stubEnv("NEXT_PUBLIC_BEAMS_INSTANCE_ID", "inst")`.
  - Tests:
    - `unsupported without the instance id or PushManager` → `webPushState` returns `"unsupported"`.
    - `enable asks permission, binds the device and sets the flag`: `requestPermission` → `"granted"`. Then `start` is called, and `setUserId` is called with `("P1", tokenProvider)`. The `TokenProvider` got `{ url: "/api/pusher/beams-auth" }`. `localStorage["webpush:P1"] === "1"`. The result is `"on"`.
    - `enable when denied` → `"blocked"`, no `start`, no flag.
    - `disable stops and clears the flag` → `stop` called, flag removed, `webPushState` returns `"off"`.
    - `resume does nothing without granted permission`: flag set, permission `"denied"` → `start` not called.
    - `resume for another user stops the old binding and does not opt in`: `getUserId` returns `"P1"`, no flag for `P2` → `resumeWebPush("P2")` calls `stop` and not `setUserId`.
    - `resume rebinds the opted-in user`: flag for `P1`, permission granted → `start`, then `setUserId("P1", …)`.
    - `stopWebPush keeps the flag` → `stop` called, flag still `"1"`.
    - `storage errors do not throw`: `localStorage.getItem` throws → `webPushState` returns `"off"`.

- [ ] **Step 2: Run** `npx vitest run __tests__/notifications/beamsClient.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement `lib/beamsClient.js`.**
  - One lazily created `Client({ instanceId })` from a dynamic `import("@pusher/push-notifications-web")`.
  - Register `stopWebPush` with `setWebPushStop` when the client is first created, as `lib/pusherClient.js` does for the socket.
  - Every `localStorage` access goes through try/catch.
  - All exported functions swallow SDK errors (log `[Beams Client]`). The exception is `enableWebPush`, which rethrows so Settings can show the error.
  - Then make the `authNavigation` and bridge edits listed under Files.

- [ ] **Step 4: Run** `npx vitest run __tests__/notifications/beamsClient.test.js __tests__/auth`. Expected: PASS.

- [ ] **Step 5: Run** `npm run build`. Expected: success, and `/service-worker.js` is served from `public/`.

- [ ] **Step 6: Commit**: `feat: bind the browser to the user for Beams web push, stop on sign out`.

### Task 7: Settings switch "Browser notifications"

UI work. Follow `ui-consistency:adjusting` → `implementing` → `verifying`. The decisions below are fixed; placement details and components come from those skills, with `privacySection.jsx` (it uses `Switch`) as the nearest pattern.

**Files:**
- Create: `components/settings/webPushSection.jsx`
- Modify: `components/settings/settingsPage.jsx`: a new `SettingsSection` with `id="settings-notifications"`, `title="Browser notifications"`, `description="Get a notification on this device when CodeDev is not open."`, placed after "Learning preferences".
- Create: `__tests__/settings/webPushSection.test.jsx` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `webPushState`, `enableWebPush`, `disableWebPush` (Task 6); `useSession` for the public id; `useApp().showAlert`.

Fixed copy and behaviour:

| State | Switch | Text |
|---|---|---|
| `unsupported` | disabled, off | "Not supported on this browser." |
| `blocked` | disabled, off | "Blocked in your browser settings." |
| `on` | on | "This device gets a notification when CodeDev is not open." |
| `off` | off | "Turn on to get notifications on this device." |
| pending | disabled + spinner | unchanged text |

- Read the state in a `useEffect` after mount (avoids an SSR mismatch).
- An error from `enableWebPush` → `showAlert(500, "Could not turn on browser notifications")`, and the state is read again.

- [ ] **Step 1: Run `ui-consistency:adjusting`** for this section and keep its checklist.

- [ ] **Step 2: Write the failing tests** (mock `@/lib/beamsClient`, `next-auth/react`, `@/contexts/appContext`):
  - `shows unsupported state`.
  - `shows blocked state`: the switch is disabled and the text is "Blocked in your browser settings.".
  - `turning on calls enableWebPush with the public id and shows on`.
  - `turning off calls disableWebPush`.
  - `an enable error shows an alert and leaves the switch off`.
  - The switch has an accessible name, "Browser notifications".

- [ ] **Step 3: Run** `npx vitest run __tests__/settings/webPushSection.test.jsx`. Expected: FAIL.

- [ ] **Step 4: Implement** `webPushSection.jsx` and the `settingsPage.jsx` section.

- [ ] **Step 5: Run** the same command. Expected: PASS.

- [ ] **Step 6: Run `ui-consistency:verifying`.** Check `/settings` in the browser at 1024 and 375 px, light and dark, axe 0, and fix what it reports.

- [ ] **Step 7: Commit**: `feat: Browser notifications switch in settings`.

### Task 8: End-to-end check against a real Beams instance

**Files:**
- Modify: `docs/notification-plan.md`: section 0 gets a "Web push" row pointing at the spec. If Step 2 shows that `/customer_api` is the working delete path, update `lib/beams.js`, its test, and the spec's 5.1.

- [ ] **Step 1:** The user puts the three Beams vars in `.env.local`. Run `next dev` through `preview_start`.
- [ ] **Step 2:** Run steps 1–6 of spec section 9.
  - Delete path: after a remote revoke, confirm in the Beams debug console that the user's device is gone.
  - If it is still there, switch to `/customer_api/v1/instances/{id}/users/{id}`, then rerun Task 1's tests and this step.
- [ ] **Step 3:** Run `npx vitest run`. Expected: everything PASS. Integration files skip or pass as usual.
- [ ] **Step 4: Commit**: `docs: web push status in notification plan`.
