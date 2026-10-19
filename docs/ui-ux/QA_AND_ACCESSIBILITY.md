# QA, accessibility and responsive standards

Part of the CodeDev UI/UX plan. Master document: [UI_UX_MASTER_PLAN.md](./UI_UX_MASTER_PLAN.md).

Target: **WCAG 2.2 AA** for every route, light and dark themes, at 320-1440 px.

## 1. Automated checks (can run in CI)

| Check | Tool | Threshold | Status |
|---|---|---|---|
| WCAG 2.2 AA rules | axe-core (already in `node_modules`) driven by Playwright | 0 violations on every route, light + dark, at 375 and 1280 px | Run manually on 2026-10-19 (0 on public routes after fixes). No CI job yet. |
| Horizontal overflow | Playwright: `document.documentElement.scrollWidth - innerWidth` | 0 at 320, 375, 768, 1280, 1440 | 0 / 100 combinations (public), 0 on 6 signed-in routes. |
| Minimum text size | DOM scan for text nodes under 12 px | 0 outside the editor chrome exception | 0 on public routes. |
| Token contrast | WCAG luminance maths over `app/globals.css` pairs | Text ≥ 4.5:1, large text and UI ≥ 3:1 | Pairs documented in `app/globals.css` comments. |
| Hardcoded colours | `grep` for hex/rgb literals and raw palette classes in `components/` | 0 outside `components/templates` | 0. |
| `text-primary` misuse | `grep -E "text-primary([^-]|$)"` | 0 (use `text-primary-ink`) | 0. |
| Console errors | Playwright console listener | 0 on page load (excluding deliberate 404 tests) | 0. |
| Unit / integration | Vitest (`npm test`) | Green | 14 node-side files exist; no UI tests. |

**Gotcha found during the audit**: toggling `.dark` on an already rendered page makes axe report stale colours (elements with `transition: all` have not finished). Measure dark mode by setting `localStorage.theme = "dark"` and reloading.

## 2. Manual checks (per release)

| Area | Procedure | Pass criteria |
|---|---|---|
| Keyboard | Tab through each priority flow (A-G in [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md)) without a mouse | Every action reachable; focus always visible; no trap except inside open dialogs; Esc closes overlays and returns focus to the trigger |
| Screen reader | NVDA + Firefox on Windows, VoiceOver + Safari on iOS: sign in, open a lesson, run and submit code, redeem a course | Page titles announced; live regions announce run/submit results once; form errors announced on submit |
| Zoom and reflow | Browser zoom 200 % at 1280 px; 400 % (equivalent to 320 px) | No loss of content or function; no horizontal scroll except code and tables |
| Text spacing | WCAG 1.4.12 bookmarklet | No clipped text |
| Reduced motion | OS setting on | No animated level-up confetti or slide transitions beyond fades |
| Touch | Real phone (iOS Safari, Android Chrome) | No accidental zoom on input focus; targets ≥ 24 px, primary ≥ 44 px; editor caret aligned with text |

## 3. Component-level acceptance criteria

| Component | Criteria |
|---|---|
| Buttons | Accessible name starts with the visible label (2.5.3); disabled buttons have a visible reason when the user is blocked. |
| Forms | Label for every field; errors inline with `aria-invalid` + `aria-describedby`; first invalid field focused on submit; server errors in a `role="alert"` region. |
| Dialogs and sheets | Focus moves in on open and returns on close; title and description present (visually hidden is fine). |
| Tabs | Arrow-key navigation; selected tab exposed; panels labelled. |
| Live updates | Run/submit output in `aria-live="polite"`; result banners `role="status"`; no double announcements. |
| Scroll containers | Focusable (`tabIndex=0`) with a label when they scroll on their own (axe `scrollable-region-focusable`). |
| Colour | No information by colour alone (status badges carry text or icons). |

## 4. Responsive acceptance criteria

| Layout | 320-639 | 640-1023 | ≥ 1024 |
|---|---|---|---|
| Shell | Sidebar Sheet; account bottom Sheet | Sheet below 768, icon rail or full sidebar above | Full sidebar; Ctrl/Cmd+B toggles |
| Lists (`/course`, `/learning`, `/roadmap`) | 1 column; filters in a Sheet | 2 columns | 2-3 columns, `max-w-6xl` |
| Detail (`/course/[id]`) | Aside first, full-width cover | Cover and info side by side | Sticky 18 rem aside |
| Learning (`/learning/[id]`) | Syllabus Sheet; editor edge to edge, 16 px text; icon tabs | Syllabus Sheet | Fixed syllabus aside |
| Tables (admin, orders ledger) | Scroll inside their own container | same | full |
| Dialogs | Full-width with margins (`max-w-[calc(100%-2rem)]`) | centred | centred |

## 5. Notification and toast rules

| Rule | Current | Status |
|---|---|---|
| One toast region | `AppToaster` in `contexts/providers.jsx` | Met |
| No duplicates | `options.id` replaces a toast (rewards) | Met for rewards; generic toasts have no id |
| Toasts survive navigation consistently | Sonner region lives in the root providers, so timers continue across client navigation | Met; verify after any provider change |
| Important information never only in a toast | Order completion, access granted, form errors | Partly met: settings avatar and admin price errors are toast-only (UX-207); there is no persistent inbox (UX-107) |
| Status mapping | HTTP status → type (`components/ui/alert.jsx:21-32`) | Blocking 4xx shows as warning (UX-404) |

## 6. Test strategy (proposal)

| Layer | Tool | Scope | Effort |
|---|---|---|---|
| Unit | Vitest (existing) | Pure helpers: reward unwrap (UX-101), list filters, formatters | 1 d |
| Component | Vitest + Testing Library + jsdom (new dev dependencies) | `ui/input`, `ErrorReload`, `PurchaseActions` states, editor edit helpers | 3 d |
| Accessibility + overflow | Playwright + axe-core (Playwright is not a project dependency yet) | Every route, 2 widths, light + dark, signed out and with a seeded test user | 2 d |
| Visual regression | Playwright screenshots | Shell, course card, lesson page, editor at 375 / 1280 | 2 d |
| E2E | Playwright | Flows A, B, C, F with the mock payment provider | 4 d |

New dev dependencies (Testing Library, jsdom, Playwright) need approval (D-11). The audit scripts used for this report live outside the repository (session scratchpad) and can be ported into `scripts/` or `__tests__/e2e/`.
