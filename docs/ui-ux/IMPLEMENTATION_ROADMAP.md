# Implementation roadmap

Part of the CodeDev UI/UX plan. Master document: [UI_UX_MASTER_PLAN.md](./UI_UX_MASTER_PLAN.md).

Effort is in person-days (d) for one engineer familiar with the codebase. Issue IDs refer to [CURRENT_STATE_AUDIT.md](./CURRENT_STATE_AUDIT.md); CI-xx to [COMPONENT_INVENTORY.md](./COMPONENT_INVENTORY.md).

The phases follow the brief, reordered after the audit: the audit found a broken feedback path and missing error boundaries, so those move to a first "Phase 0b" before the foundations work. Phase 0 (discovery) is complete with this document set.

## Quick wins (≤ 0.5 d each, no design decision needed)

| ID | Task | Files | Effort | Verification |
|---|---|---|---|---|
| QW-1 | Fix lesson-complete rewards (UX-101): return `data` from `useCourseSubmitLesson`, read `rewards.courseCompleted` | `mutations/course.mutation.js`, `components/learning/[id]/lessons.jsx` | 0.5 | Unit test on the unwrap; complete a lesson and see the "+N points · +N EXP" toast and level-up dialog |
| QW-2 | Remove the broken `/profile/${user_id}` link (UX-103) | `components/course/params/commentItem.jsx:79` | 0.25 | Comment author renders as text |
| QW-3 | Hide the Python file fallback (UX-108) | `components/learning/[id]/challenges/codingChallenge.jsx:337` | 0.25 | Only `solution.js` appears |
| QW-4 | Complete breadcrumb labels (UX-208) | `components/ui/navbar.jsx` | 0.1 | Orders, Admin, Onboarding labels |
| QW-5 | Page metadata for `/`, `/blog`, `/contact`, `/help` (UX-211) | `app/*/page.jsx` | 0.25 | Tab titles |
| QW-6 | Syntax-highlight the landing sample (UX-209) | `components/index.js` | 0.25 | Visual check, axe contrast |
| QW-7 | Wrap admin `Forbidden` in `HomeLayout` (UX-109, part 1) | `app/admin/page.jsx` | 0.1 | Denied user keeps navigation |
| QW-8 | Unify the 768 px boundary (UX-302) | `contexts/appContext.jsx` | 0.25 | Resize across 767/768/769 |
| QW-9 | Explain empty courses inline instead of a toast (UX-111) | `components/learning/course.jsx` | 0.25 | Course with 0 lessons |

## Phase 0b: Stability (1 week)

| ID | Priority | Scope | Affected files | Depends on | Effort | Risk | Definition of Done | Verification |
|---|---|---|---|---|---|---|---|---|
| R0-1 | P0 | Quick wins QW-1 to QW-9 | see above | none | 2.5 | Low | All merged with tests where logic changed | Unit tests; manual check per row |
| R0-2 | P0 | Route error boundaries (UX-102): `app/error.js`, `app/global-error.js`, `app/not-found.js` using `PageError` / `pageNotFound`; call `notFound()` for missing courses and roadmaps | `app/`, `components/ui/error.jsx`, `course/params/previewPage.jsx`, `roadmap/[id]/*` | none | 1.5 | Medium (must not intercept auth redirects) | A thrown render error shows the CodeDev error page with retry; unknown course returns 404 | Throw in a test page; visit `/course/does-not-exist` |

## Phase 1: Design foundations (1 week)

| ID | Priority | Scope | Affected files | Depends on | Effort | Risk | DoD | Verification |
|---|---|---|---|---|---|---|---|---|
| R1-1 | P1 | Token clean-up (DS-02) and lint guard for `text-primary` (DS-03) | `app/globals.css`, ESLint config or a grep check in CI | D-05 | 0.5 | Low | Unused tokens removed or documented; CI fails on bare `text-primary` | CI run |
| R1-2 | P1 | Layout widths: three container sizes, footer aligned (UX-201) | page components, `ui/footer.jsx` | D-10 | 1 | Low | Each page uses one of three widths | Screenshot diff at 1280/1440 |
| R1-3 | P1 | Typography: h1 standard, remove off-scale sizes outside the editor (UX-206, UX-212) | listed files | none | 1 | Low | 0 `text-[10px]/[11px]` outside the editor chrome | grep + audit script |
| R1-4 | P2 | Document decisions in this folder; add a "Rules for new UI" checklist to the PR template | `docs/ui-ux/*`, `.github/` | none | 0.5 | Low | PR template has the checklist | Review |

## Phase 2: Shared application shell (1.5 weeks)

| ID | Priority | Scope | Affected files | Depends on | Effort | Risk | DoD | Verification |
|---|---|---|---|---|---|---|---|---|
| R2-1 | P1 | Sidebar state without post-hydration flip (UX-301) | `contexts/appContext.jsx`, `components/layouts/homeLayout.jsx`, sidebar cookie | none | 1 | Medium (SSR state) | No visible sidebar jump on reload | CLS measured before/after |
| R2-2 | P1 | Shell-preserving loading fallback (UX-106) | `components/ui/loading.jsx`, 22 `app/**/page.jsx` | R0-2 | 1.5 | Medium | Navbar and sidebar stay visible while a page suspends | Throttled navigation recording |
| R2-3 | P2 | Shared `PageHeaderBar` for `DefaultLayout` pages (UX-202) | `studyingPage.jsx`, `roadmapDetailsPage.jsx`, `previewPage.jsx` | D-10 | 1 | Low | One component, three call sites | Visual check |
| R2-4 | P1 | Shared states: `Empty`, `ErrorReload`, `Alert` primitive (UX-204, UX-205, CI-04) | about 30 call sites | none | 3 | Low | 0 bespoke empty/error blocks | grep for dashed-border empty markup |
| R2-5 | P1 | Toast vs inline errors (UX-207, UX-404) | `settingsPage.jsx`, `ui/feedback.jsx`, `courseAdmin.jsx`, `ui/alert.jsx` | R2-4 | 1 | Low | Blocking errors visible inline until fixed | Keyboard + screen reader check |
| R2-6 | P2 | Notification centre (UX-107) | new API + `components/ui/notifications*`, navbar | **D-04**, backend | 5-8 | High (new feature) | Only after approval | E2E flow G |

## Phase 3: Core learning experience (1 week)

| ID | Priority | Scope | Affected files | Depends on | Effort | Risk | DoD | Verification |
|---|---|---|---|---|---|---|---|---|
| R3-1 | P1 | Dashboard "next action" card: first item is the most recent in-progress lesson with one primary "Continue" button | `components/home/*` | none | 1.5 | Low | One primary action above the fold at 375 px | Usability check, screenshot |
| R3-2 | P2 | Course detail: learning outcomes and prerequisites block if the data exists (Sanity / DB), otherwise propose fields | `course/params/previewPage.jsx` | content model | 1 | Medium (data may be missing) | Shown when data exists; no empty headings | Course with and without data |
| R3-3 | P2 | Previous/next lesson keyboard shortcuts with a visible hint (UX-402) | `studyingPage.jsx`, `lessons.jsx` | none | 0.5 | Low | `Alt+←/→` works outside text fields | Keyboard test |
| R3-4 | P2 | "Draft saved on this device" wording (flow E) | `codingChallenge.jsx` draft chip | none | 0.25 | Low | Copy explains local storage | Review |
| R3-5 | P2 | Contacts page on React Query (CI-06, UX-501) and rename per D-06 | `contact/contactPage.jsx` | D-06 | 1 | Low | Same behaviour, cached | Manual + network panel |

## Phase 4: Coding and gamification (1 week)

| ID | Priority | Scope | Affected files | Depends on | Effort | Risk | DoD | Verification |
|---|---|---|---|---|---|---|---|---|
| R4-1 | P2 | Touch-size editor controls (UX-303) | `codeEditor.jsx`, `submissionHistory.jsx` | none | 0.5 | Low | ≥ 32 px on touch layouts | Phone check |
| R4-2 | P2 | Primitive swaps: Progress, Collapsible (CI-02, CI-03) | `ui/level.jsx`, `navbar.jsx`, `overview.js`, `learning.js`, `codingChallenge.jsx`, `submissionHistory.jsx` | none | 1.5 | Low | No hand-written `role="progressbar"` | grep |
| R4-3 | P3 | Achievements / milestones / ranking surfaces, public profile: tasks PR-1..4 and RK-1..6 in [PROFILE_AND_LEADERBOARD_PLAN.md](PROFILE_AND_LEADERBOARD_PLAN.md) | new | **D-05**, **D-07**, `docs/ranking-plan.md` | ≈ 12.5 (≈ 8.5 UI + 4 backend) | High | Only after approval | |

## Phase 5: Onboarding and monetisation (1 week)

| ID | Priority | Scope | Affected files | Depends on | Effort | Risk | DoD | Verification |
|---|---|---|---|---|---|---|---|---|
| R5-1 | P2 | Return URL after sign-in (UX-104) | `proxy.js`, auth callbacks | **D-12** (auth change) | 1 | Medium | Deep link survives sign-in; only same-origin targets | E2E |
| R5-2 | P2 | Sign-up → automatic sign-in → onboarding (UX-105) | `components/auth/signup.jsx` | **D-08** | 0.5 | Medium | One fewer step | E2E flow A |
| R5-3 | P2 | Admin dialogs instead of `window.confirm/prompt`, native selects replaced (CI-01, CI-05, UX-401) | `components/admin/*` | none | 1.5 | Low | Reasons validated inline | Keyboard + screen reader |
| R5-4 | P3 | Money purchase confirmation step when a real provider is chosen (UX-110) | `purchaseActions.jsx` | payment provider decision | 0.5 | Low | | |

## Phase 6: Quality assurance (ongoing, set up in 1 week)

| ID | Priority | Scope | Depends on | Effort | DoD |
|---|---|---|---|---|---|
| R6-1 | P1 | Port the audit script (axe + overflow + tiny text) into the repo and CI | D-11 | 2 | CI job fails on any new violation |
| R6-2 | P2 | Component tests for forms and purchase states | D-11 | 3 | Tests for `ui/input`, `PurchaseActions`, `RedeemDialog` |
| R6-3 | P2 | Visual regression of shell, card, lesson, editor | D-11 | 2 | Baseline screenshots committed |
| R6-4 | P2 | E2E flows A, B, C, F with a seeded throwaway user (never the real admin; see the SessionRevoked finding) | D-11 | 4 | Green on CI |
| R6-5 | P3 | Usability sessions (5 learners) on flows A, C, E | product | 3 | Findings logged as issues |

## Totals

| Bucket | Effort |
|---|---|
| Quick wins + stability (Phase 0b) | 4 d |
| Foundations + shell (Phases 1-2, without the notification centre R2-6) | 10.5 d |
| Learning, coding, admin (Phases 3-5, without the gated R4-3, R5-1, R5-2, R5-4) | 8 d |
| QA infrastructure (Phase 6) | 14 d |
| **Total without gated features** | **≈ 37 person-days** |
| Gated (notification centre 5-8 d, auth changes 1.5 d, money confirmation 0.5 d, gamification surfaces TBD) | 7-10 d + TBD |
