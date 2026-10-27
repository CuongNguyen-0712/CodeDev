# Current state audit

Part of the CodeDev UI/UX plan. Master document: [UI_UX_MASTER_PLAN.md](./UI_UX_MASTER_PLAN.md).

Date: 2026-10-19. Branch: `develop` (working tree, including uncommitted changes).

## 1. Method and evidence

| Source | What it covers |
|---|---|
| Code reading (3 parallel read-only passes + spot checks) | Routes, layouts, components, flows A-I, data fetching, forms, tests. Every finding below cites a file. |
| Automated audit, signed out (Playwright + axe-core 4.x, WCAG 2.2 AA tags) | 20 routes × 5 widths (320, 375, 768, 1280, 1440); axe at 375 and 1280 in light and dark; horizontal overflow; text under 12 px; console errors. |
| Automated audit, signed in (browser pane + axe-core) | `/home`, `/learning`, `/profile`, `/settings`, `/orders`, `/onboarding` at the same widths. Dark mode re-measured on freshly loaded pages (toggling `.dark` mid-page produced stale results). |
| Contrast maths | `contrast.py` from the UI/UX kit and the WCAG luminance formula for every token pair recorded in `app/globals.css`. |

Not done: manual screen-reader testing (NVDA/VoiceOver), real iOS/Android devices, usability sessions, performance profiling.

### 1.1 Baseline after the 2026-10-19 fixes

| Metric | Value | Scope |
|---|---|---|
| axe WCAG 2.2 AA violations, light | 0 | 12 public routes reachable signed out, 375 + 1280 px |
| axe colour-contrast violations, dark | 0 | same |
| Pages with horizontal overflow | 0 / 100 page-width combinations | 20 routes × 5 widths |
| Text nodes under 12 px | 0 | public routes (the dense editor chrome is a documented exception) |
| Console errors | 1 (expected 404 on `/no-such-page`) | public routes |
| Signed-in pages | 0 overflow at 5 widths; remaining axe items fixed and re-measured (see section 6) | 6 routes |

Fixed earlier in the same session (for traceability): dark-mode primary text contrast (`--primary-ink`), level label contrast (`--xp`), account trigger and `/home` stat names (WCAG 2.5.3), focusable level list, editor gutter contrast, 11 px labels, `/contact` and `/profile` signed-out 401s (now `PRIVATE` routes), "0.0" ratings.

### 1.2 Status on 2026-10-26

Re-checked against the working tree. Already shipped: QW-1 to QW-9 (UX-101, 103, 108, 109 part 1, 111, 208, 209, 211, 302) and R0-2 (`app/error.jsx`, `app/global-error.jsx`, `app/not-found.jsx`).

Fixed in this pass:

- UX-401: admin `window.confirm` / `window.prompt` replaced by `components/admin/confirmDialog.jsx` (AlertDialog; optional labelled reason field with an inline error under 5 characters instead of silently ignoring the answer). Used for archive, remove price, revoke access and refund.
- UX-301: the sidebar now starts expanded on the server and the client, so the desktop default no longer jumps after hydration. Users who collapsed it still see one collapse on load (cookie read on the server would make every route dynamic).
- `/course` and `/roadmap` no longer show "0 courses" / "0 roadmaps" beside a load error.

Second pass the same day, with production data restored locally and a local test account (axe-core 4.10 WCAG 2.2 AA + best-practice, overflow and under-12 px checks at 1280 and 375 px, signed out and signed in, including onboarding and the lesson workspace):

- Premium price tag: `aria-label` on a role-less span with `aria-hidden` children hid the price from screen readers; now visually hidden text (`commerce/priceTag.jsx`).
- Sidebar: `role="navigation"` so its label applies and it is a landmark (axe `region` on every shell page).
- 404 for unmatched URLs (`app/global-not-found.jsx`) now runs the theme script (`lib/themeScript.js`, shared with the root layout); it was always light.
- Onboarding: upcoming step labels failed contrast (`text-muted-foreground/70`); review list was an invalid `<dl>`; page had no `<main>` (same for mock checkout).
- Loading placeholders: `role="status"` so their `aria-label` is announced (settings, profile, ranking, onboarding, lesson, purchase actions).
- DefaultLayout scroller is a `<div>`, so page headers are banner landmarks; lesson code blocks are labelled groups, not same-named regions; the workspace has one `<h1>` (the lesson).
- UX-212: no text under 12 px outside the code editor (profile level table, field hints and errors, syllabus, quiz, preview badge, code language chip).
- UX-105 (part): after sign-up the Sign in tab opens with the new username filled in (no auth change).

Result: 0 axe violations on every route checked. Not changed: the beginner level icon (two signal bars) reads like a stray "." at 12 px. The test `__tests__/auth/accountPurge.test.js` fails within 7 days before a DST change when the local PostgreSQL time zone observes DST (`+ 7 days` = 169 h); production runs in UTC.

Still open: UX-104 (auth, gated), UX-105 auto sign-in (D-08), UX-106, UX-107 (gated), UX-110, UX-112, UX-201 to UX-207, UX-303, UX-402 to UX-404, UX-501 to UX-503.

## 2. Architecture snapshot

- Next.js 16 App Router, React 19, JavaScript. Tailwind v4 (no preflight; a reset subset in `app/globals.css`) and shadcn/ui copies in `components/shadcn`.
- Two layouts: `HomeLayout` (sidebar + navbar + footer) and `DefaultLayout` (bare scroll section). Toasts mounted once (`contexts/providers.jsx`).
- Access control in `proxy.js` from `auth/route/*.route.js` (`GUEST`, `PUBLIC`, `PRIVATE`, `PROTECTED`). Onboarding redirect is a server check in `app/home/page.jsx:23-26`.
- Server state through React Query with presets in `lib/queryTimes.js`; reads through API routes (`clients/*`) and server actions (`lib/actionResult.js` with `callWithAuthRetry`).
- Realtime through Pusher: `private-user-*` (session, progress, rewards, profile) and `course-*` (comments).
- Tests: Vitest, 14 files, all node-side (services, integration). No component, accessibility, e2e or visual tests.

## 3. Findings

Severity: **Critical** blocks a core task or loses data; **High** breaks feedback or recovery in a core flow; **Medium** causes confusion, inconsistency or an accessibility gap; **Low** is polish. Effort is in person-days (d).

### 3.1 Flow and feedback

| ID | Route / component | Current behaviour | Problem and user impact | Sev. | Recommendation | Effort | Dependencies / risk |
|---|---|---|---|---|---|---|---|
| UX-101 | `/learning/[id]`, `components/learning/[id]/lessons.jsx:34-37`; `mutations/course.mutation.js:18-20,123-125` | `useCourseSubmitLesson` resolves to `{ success, data }`; the component passes that wrapper to `announceRewards` and reads `rewards.courseCompleted` | Completing a lesson never shows "+N points · +N EXP", never opens the level-up dialog, and never says "Course completed". The main gamification loop is silent. | **High** | Unwrap in the mutation (return `data`) as the challenge mutations do (`mutations/challenge.mutation.js:20,53`). Add a unit test. | 0.5 | None. Pure client fix. |
| UX-102 | `app/` | No `error.js`, `global-error.js`, `loading.js` or `not-found.js`; no ErrorBoundary. `PageError` (`components/ui/error.jsx`) has 0 uses | An uncaught render error shows the framework error screen with no way back into the app. | **High** | Add `app/error.js` and `app/global-error.js` using `PageError` (retry + home link), and `not-found.js` using `pageNotFound`. | 1 | Must not swallow auth redirects. |
| UX-103 | `components/course/params/commentItem.jsx:79` | Comment author links to `/profile/${user_id}` | Route does not exist (only `/profile`), so the link always 404s. | Medium | Remove the link until public profiles exist, or render plain text (product decision D-07). | 0.25 | |
| UX-104 | `proxy.js:53-61` | Signed-out users are sent to `/auth` without a return URL | After signing in, users land on `/home`, not the course or lesson they opened. Breaks deep links from shares and emails. | Medium | Add `callbackUrl` (same-origin only) and honour it after login and OAuth. | 1 | Auth behaviour change: needs approval (constraint: no auth changes in visual work). |
| UX-105 | `components/auth/signup.jsx:105-110` | Successful sign-up shows a toast and switches to the login tab | An extra step at the top of the funnel; the user retypes credentials. | Medium | Product decision D-08: auto sign-in after sign-up, or keep and pre-fill the username. | 0.5 | Auth change. |
| UX-106 | all 22 `app/**/page.jsx` | `<Suspense fallback={<LoadingRedirect/>}>` renders a full-viewport spinner | The shell disappears on every suspending navigation; layout jumps when content returns. | Medium | Shell-preserving skeleton fallback inside the layout (or route `loading.js`). | 1.5 | Touches every page file. |
| UX-107 | app-wide | No persistent notification inbox; Sonner toasts only. Reward toasts from realtime show only when the tab is hidden (`components/realtime/userRealtimeBridge.jsx:71-84`); `PROGRESS_UPDATED` shows nothing | Information that matters later (order completed, access granted, level reached elsewhere) exists only as a 4-8 s toast. | Medium | Keep toasts for confirmations. A notification centre is a product proposal (D-04), planned in `docs/development-plan.md` §3.2. | 5-8 | Backend table `profile.notification` exists per the plan doc; API and UI do not. |
| UX-108 | `components/learning/[id]/challenges/codingChallenge.jsx:337` | Editor file name falls back to `main.py` for Python | Only JavaScript runs (`docs/sandbox.md`, `lib/challenges/runner.js`), so a Python label promises something that cannot work. | Medium | Show only languages the runner supports; hide the Python fallback until a runner exists. | 0.25 | |
| UX-109 | `app/admin/page.jsx:35`, `components/ui/navbar.jsx` | `/admin` renders `<Forbidden/>` without the shell; no UI link to `/admin` | Admins must type the URL; a denied user sees a page without navigation. | Low | Wrap `Forbidden` in `HomeLayout`; show an Admin menu item when `/api/user/me` exposes the permission (backend change, D-09). | 0.5 + backend | |
| UX-110 | `components/commerce/purchaseActions.jsx:164-191` | "Buy" goes straight to checkout; "Redeem" opens a confirmation dialog | Two purchase paths behave differently. | Low | Acceptable while the provider shows its own confirmation page. Revisit when a real provider (PayOS/Stripe, undecided) is chosen. | 0 | Payment provider decision. |
| UX-111 | `components/learning/course.jsx:112-115` | Opening a course with 0 lessons shows only a toast | Dead end with transient feedback. | Low | Disable the action and explain inline ("No lessons published yet"). | 0.25 | |
| UX-112 | `components/contact/contactPage.jsx` | Search-only list of learners with no actions; friends/teams APIs (`app/api/get/getMyFriends`, `getSocial`, `post/postCreateTeam`) have no UI | "Community" promises more than it delivers. | Low | Rename the page "Find learners" or hide until the community scope is decided (D-06). | 0.25 | Product scope. |

### 3.2 Consistency

| ID | Route / component | Current | Problem | Sev. | Recommendation | Effort |
|---|---|---|---|---|---|---|
| UX-201 | page containers | Six content widths (`max-w-6xl`, `4xl`, `3xl`, `2xl`, `lg`, footer `[1440px]`) | Pages feel like different products; the footer is wider than the content. | Medium | Three widths ([DESIGN_SYSTEM_SPEC.md](./DESIGN_SYSTEM_SPEC.md) §4). | 1 |
| UX-202 | `studyingPage.jsx:410`, `roadmapDetailsPage.jsx:253`, `previewPage.jsx:251` | Each `DefaultLayout` page draws its own `h-12` header bar | Three copies of back/title/actions markup. | Low | Shared `PageHeaderBar` (Proposal). | 1 |
| UX-203 | see [COMPONENT_INVENTORY.md](./COMPONENT_INVENTORY.md) §4 | Native selects, custom progress bars and collapsibles, inline banners, `window.confirm/prompt` | Inconsistent behaviour and keyboard support. | Medium | CI-01 to CI-06. | 5 |
| UX-204 | 9 call sites (inventory §5) | Bespoke error blocks | Different retry affordances. | Low | `ErrorReload`. | 1 |
| UX-205 | about 20 call sites (`course/coursePage.jsx:158`, `learning/learningPage.jsx:154`, `home/recommend.jsx:218`, `roadmap/roadmapPage.jsx:187`, `profile/profilePage.jsx:266`, `onboarding/onboardingPage.jsx:220,429,454`, `settings/preferencesSection.jsx:178,193`, admin tables...) | Same dashed-border empty markup copied | Drift in wording and actions. | Low | shadcn `Empty`. | 1.5 |
| UX-206 | `/admin` (`text-2xl`), `/orders/[id]` and `/checkout/mock/*` (`text-xl`), course not-found (`text-sm`, `previewPage.jsx:298`) | h1 sizes vary | Weak hierarchy on secondary pages. | Low | h1 standard (Design System §3.1). | 0.5 |
| UX-207 | `settings/settingsPage.jsx:141-173` (avatar), `admin/courseAdmin.jsx:213-216` (price), `ui/feedback.jsx` and settings profile (server errors) | Errors reported only by toast | Errors disappear after 4 s and are not tied to the field; screen-reader users may miss them. | Medium | Inline field or form-level alert; toast only in addition. | 1 |
| UX-208 | `components/ui/navbar.jsx` `SECTION_LABELS` | Missing `orders`, `admin`, `onboarding`; stale `connect` | Breadcrumb shows raw capitalised segments. | Low | Complete the map. | 0.1 |
| UX-209 | `components/index.js` | Landing code sample is plain text | Inconsistent with the editor and lessons (Dracula theme). | Low | Use `lib/syntaxTheme.js`. | 0.25 |
| UX-210 | `components/templates/*` | Resolved: brand badge logo asset (`logo.png`), `_CodeDev;` wordmark, and callout copy | Brand consistency in email restored. | Done | Updated copy and logo asset. | 0.5 |
| UX-211 | `/`, `/blog`, `/contact`, `/help` | No page metadata | Generic browser tab titles. | Low | `generateMetadata`. | 0.25 |
| UX-212 | 30 arbitrary `text-[10/11/13px]` | Mostly editor and studying page | Off-scale sizes outside the editor exception. | Low | `text-xs`, except the documented editor chrome. | 0.5 |

### 3.3 Shell and responsive

| ID | Route / component | Current | Problem | Sev. | Recommendation | Effort |
|---|---|---|---|---|---|---|
| UX-301 | `contexts/appContext.jsx:15-28` | Sidebar state starts `false` on the server, then reads `localStorage` in an effect | On desktop the sidebar opens after hydration: visible layout shift on every full load. | Medium | Persist in a cookie read on the server (the shadcn sidebar convention) or render the stored state before paint. | 1 |
| UX-302 | `appContext.jsx:21` (`>= 768`), `:31` (`<= 768`), `hooks/use-mobile.js:3` (`< 768`) | Three boundary rules | At exactly 768 px the sidebar state disagrees with the layout mode. | Low | One helper based on `use-mobile`. | 0.25 |
| UX-303 | `challenges/codeEditor.jsx`, `submissionHistory.jsx` | `xs` / `icon-xs` buttons (24 px) | Meets WCAG 2.5.8 minimum but is small on touch. | Low | 32-44 px on touch layouts (`max-sm:` sizes). | 0.5 |

### 3.4 Accessibility (remaining)

| ID | Where | Issue | Sev. | Recommendation | Effort |
|---|---|---|---|---|---|
| UX-401 | `admin/courseAdmin.jsx:207`, `admin/accessAdmin.jsx:158-176`, `admin/ordersAdmin.jsx:31-41` | `window.confirm` / `window.prompt` (refund reason, revoke reason silently ignored when under 5 characters) | Medium | AlertDialog / Dialog with a labelled, validated field (CI-05). | 1 |
| UX-402 | `/learning/[id]` | No keyboard shortcut for previous / next lesson | Low | Optional `Alt+←/→` with a visible hint (Proposal). | 0.5 |
| UX-403 | custom progress bars and collapsibles (CI-02, CI-03) | Hand-written ARIA | Low | Primitives. | (in CI) |
| UX-404 | toasts | Status mapping by HTTP code (`ui/alert.jsx:21-32`): every non-200/0/500 status renders as a warning | Low | Map 4xx validation errors to "error" when they block the task. | 0.25 |

### 3.5 Data and state

| ID | Where | Issue | Sev. | Recommendation | Effort |
|---|---|---|---|---|---|
| UX-501 | `components/contact/contactPage.jsx:69-174` | Manual fetch queue outside React Query | Low | `useInfiniteQuery` (CI-06). | 1 |
| UX-502 | `queries/challenge.query.js:13-21`, `queries/premium.query.js:93-95` | Bypass the `lib/queryTimes.js` presets | Low | Use presets. | 0.25 |
| UX-503 | `settings/settingsPage.jsx:164,278`, `ui/feedback.jsx:60` | Server actions called directly, not through `useMutation` | Low | `useMutation` for pending/error state and cache invalidation. | 0.5 |

## 4. Things that work well (keep)

- Token-only colour system with documented contrast; no raw palette classes in components.
- One toast region, de-duplicated by `id` for rewards.
- Learning URL state: `?lesson=` with history, fallback to the last seen lesson, `#challenge-<id>` deep links.
- Coding workspace: Run vs Submit separation, sample vs hidden tests, attempts left, two-step submit with clear "attempt still counted" messaging, IndexedDB drafts with status chip, confirmation before reset/restore, submission history with restore.
- Onboarding: resumable steps, review with per-row edit, skip, inline errors with `role="alert"`, preferences editable later in Settings.
- Commerce: idempotent checkout and redeem, insufficient-balance messaging, order status polling, state-specific actions.
- Auth forms: zod validation, inline `aria-invalid` errors, in-form alert.

## 5. Not verified

- Behaviour with a real payment provider (only `mock` exists).
- Admin screens at phone widths.
- Screen-reader announcements of live regions (only checked that `aria-live` / roles exist).
- Performance (LCP/CLS) on production builds.
