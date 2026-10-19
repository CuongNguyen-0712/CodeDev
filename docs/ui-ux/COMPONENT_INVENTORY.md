# Component inventory and reuse strategy

Part of the CodeDev UI/UX plan. Master document: [UI_UX_MASTER_PLAN.md](./UI_UX_MASTER_PLAN.md).

Status: **audit + proposal**. Counts come from `grep` over `app/`, `components/`, `contexts/`, `hooks/`, `lib/` on the `develop` working tree (2026-10-19). `.claude/worktrees` is excluded.

Legend for the "Decision" column:

- **Keep**: used correctly, no change.
- **Adopt**: exists but is bypassed by hand-written markup; migrate call sites to it.
- **Extend**: add a variant or prop; do not fork.
- **Remove**: unused; delete or keep only with a documented reason.
- **Proposal**: does not exist yet; needs approval before it is built.

## 1. Layers

| Layer | Folder | Owns | Rule |
|---|---|---|---|
| Primitives | `components/shadcn/` | Radix-based shadcn/ui copies (Button, Dialog, Tabs...) | Styled only with tokens. Change a primitive only to fix it for every caller. |
| App composites | `components/ui/` | Shell (navbar, sidebar, footer), shared states (loading, error, forbidden, 404), form wrappers, level/EXP widgets, logo, toasts | Built from primitives. No feature logic. |
| Feature components | `components/<feature>/` | Page and domain UI (course, learning, commerce...) | May import `ui/` and `shadcn/`, never the reverse. |
| Layouts | `components/layouts/` | `HomeLayout` (sidebar shell), `DefaultLayout` (bare scroll) | One layout per page type (see [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md)). |

## 2. Primitives (`components/shadcn`)

| Component | Importers | Decision | Notes |
|---|---|---|---|
| button | 56 | Keep | Sizes `xs/sm/default/lg/icon*`. `xs` and `icon-xs` are 24 px: allowed only in dense desktop toolbars (editor), never as the only control on touch screens. |
| skeleton | 29 | Keep | 147 uses. |
| badge | 25 | Keep | Variants used for status (success, primary, outline...). |
| field | 8 | Keep | Base of `ui/input.jsx`. |
| progress | 8 | **Adopt** | Three hand-rolled `role="progressbar"` divs bypass it: `components/ui/navbar.jsx:256`, `components/ui/level.jsx:70`, `components/home/overview.js:175`. |
| tooltip | 8 | Keep | |
| avatar | 7 | Keep | |
| separator, tabs, table, spinner, label, sheet, kbd, dialog, sidebar, collapsible, select, dropdown-menu, breadcrumb, alert-dialog, checkbox, empty, popover, input-group, radio-group, scroll-area, sonner, textarea, toggle-group, input | 1-7 each | Keep | `empty` is used in only 2 files (section 5). `collapsible` is bypassed in 3 places (section 4). |
| toggle | 0 direct | Keep | Used through `toggle-group`. |
| card | **0** | **Adopt or Remove** | 42 hand-styled `bg-card` containers. Decision D-03 in the master plan. |
| switch | **0** | Remove (or adopt in Settings) | No boolean setting uses it today. |
| alert | not installed | **Proposal** | `components/auth/authAlert.jsx:44` and copy-pasted destructive banners (`commerce/mockCheckoutPage.jsx:104`, `commerce/redeemDialog.jsx:118,147`) would share one `Alert` primitive. |

## 3. App composites (`components/ui`)

| Component | Purpose | Importers | Decision |
|---|---|---|---|
| `loading.jsx` | `LoadingRedirect` (full viewport) and `LoadingContent` (inline) | 22 | **Extend**: every page uses `LoadingRedirect` as its Suspense fallback, which hides the shell while a page suspends. Add a shell-preserving page skeleton (roadmap R2-03). |
| `error.jsx` | `ErrorReload` (inline retry), `PageError` (full page) | 23 | Keep `ErrorReload`. `PageError` has **0 uses**: wire it to route `error.js` files (R2-02) or delete. |
| `forbidden.jsx` | 403 | 2 | Keep. `/admin` renders it without the shell (`app/admin/page.jsx:35`): wrap it in `HomeLayout`. |
| `pageNotFound.jsx` | 404 | 1 (`app/global-not-found.jsx`) | Keep. No component calls `notFound()`; course and roadmap "not found" render inline instead. |
| `level.jsx` | Level badge, EXP chip, `ExpProgress`, `announceRewards`, `LevelUpDialog` | 10 | Extend: use shadcn `Progress` inside `ExpProgress`. |
| `input.jsx` | `InputGroup` / `TextAreaGroup` (label, error, `aria-invalid`, `aria-describedby`) | 5 | Keep. Standard for every form field ([DESIGN_SYSTEM_SPEC.md](./DESIGN_SYSTEM_SPEC.md), section 7). |
| `searchBar.jsx` | Search + filters (Popover desktop, Sheet mobile) | 4 | Keep. Single source for list filtering. |
| `navbar.jsx`, `dashboard.jsx`, `footer.jsx` | Shell | 1-2 | Keep. Footer uses `max-w-[1440px]`; pages use `max-w-6xl` (Design System Spec, section 4). |
| `feedback.jsx` | Feedback dialog opened by `?modal=feedback` | 1 | Keep. |
| `alert.jsx` | Sonner bridge `notify` + `AppToaster` | 3 | Keep. Only toast system; mounted once in `contexts/providers.jsx`. |
| `logo.jsx` | Brand mark and wordmark | 4 | Keep. |
| `portableTextRenderer.jsx` | Sanity lesson body | 1 | Keep. |

## 4. Hand-rolled duplicates to consolidate

| ID | Duplicate | Where | Replace with | Effort |
|---|---|---|---|---|
| CI-01 | Native `<select>` | `components/admin/accessAdmin.jsx:220`, `components/admin/courseAdmin.jsx:320` (the same file already imports shadcn `Select`) | shadcn `Select` | 0.5 d |
| CI-02 | Custom progress bars | `ui/navbar.jsx:256`, `ui/level.jsx:70`, `home/overview.js:175` | shadcn `Progress` (token colour via `className`) | 0.5 d |
| CI-03 | Custom expand/collapse with `aria-expanded` | `home/learning.js:360`, `learning/[id]/challenges/codingChallenge.jsx:352`, `learning/[id]/challenges/submissionHistory.jsx:157` | shadcn `Collapsible` | 1 d |
| CI-04 | Inline alert banners | `components/auth/authAlert.jsx:44`, `commerce/mockCheckoutPage.jsx:104`, `commerce/redeemDialog.jsx:118,147` | New `Alert` primitive (Proposal) | 1 d |
| CI-05 | `window.confirm` / `window.prompt` | `admin/courseAdmin.jsx:207` (archive), `admin/accessAdmin.jsx:158-176` (revoke reason) | `AlertDialog` / `Dialog` with a validated field | 1 d |
| CI-06 | Raw data fetching with a `useState` queue + `useEffect` | `components/contact/contactPage.jsx:69-174` | `useInfiniteQuery` + query keys, as in `learning/learningPage.jsx` | 1 d |
| CI-07 | Hand-styled panels (`rounded-lg border bg-card`) | 42 occurrences | `Card` if adopted (decision D-03) | 2 d (only if adopted) |

## 5. Shared states

| State | Standard component | Current coverage | Gap |
|---|---|---|---|
| Page loading | `LoadingRedirect` (Suspense fallback on all 22 pages) | 100 % | Hides the shell and gives no layout preview. |
| Section loading | `Skeleton` | 147 uses / 29 files | Good. |
| Inline error + retry | `ErrorReload` | 31 call sites / 23 files | 9 bespoke error blocks: `admin/accessAdmin.jsx:184`, `commerce/ordersPage.jsx:41`, `commerce/purchaseActions.jsx:117,136`, `commerce/redeemDialog.jsx:118`, `learning/[id]/challenges/submissionHistory.jsx:63,123`, `profile/experienceSection.jsx:51`, `course/coursePage.jsx:201`, `course/params/previewPage.jsx:298`. |
| Route error | none | no `error.js` / `global-error.js` in `app/` | An uncaught render error shows the Next.js default screen. |
| Empty | shadcn `Empty` | 2 files (`blog/blog.jsx:29`, `commerce/ordersPage.jsx:81,209`) | About 20 bespoke empty blocks with the same dashed-border pattern (list in [CURRENT_STATE_AUDIT.md](./CURRENT_STATE_AUDIT.md), UX-205). |
| Forbidden / not found | `Forbidden`, `pageNotFound` | 403 route + admin; 404 global only | Course and roadmap not-found render a `text-sm` heading inline (`previewPage.jsx:298`). |

## 6. Component specifications

Each entry: purpose, variants, states, keyboard, responsive behaviour, reuse rule. "Exists" means the component is already in the codebase; "Proposal" needs approval.

### 6.1 Core controls

| Component | Variants | States | Keyboard | Responsive | Reuse |
|---|---|---|---|---|---|
| Button (exists) | default (primary), outline, secondary, ghost, destructive, link; sizes xs, sm, default, lg, icon, icon-xs, icon-sm | hover, focus-visible ring, active, disabled, loading (spinner + label change, e.g. "Saving...") | Enter/Space; visible focus ring (`--ring`) | At least 44 px tall on touch for primary actions (`h-11` in mobile sheets) | One primary button per view section. Destructive actions use `destructive` everywhere, including confirm dialogs. |
| Input / Textarea via `InputGroup` (exists) | text, password with reveal, search, textarea with counter | default, focus, invalid (`aria-invalid`, message linked by `aria-describedby`), disabled, read-only | Native | 16 px font at ≤425 px wide (prevents iOS focus zoom, `app/globals.css`) | Every form field goes through `ui/input.jsx`; no bare `<input>`. |
| Select (exists) | single | open, focus, disabled, invalid | Radix listbox keys | Popover on touch | Replaces native `<select>` (CI-01). |
| Checkbox / Radio group (exist) | | checked, indeterminate (checkbox), disabled, invalid | Space toggles; arrows move in a radio group | | Onboarding choice fields already follow this pattern. |
| Tabs (exists) | `line` (underline), default | active, focus, disabled | Arrow keys, Home/End (Radix) | Tab strips scroll horizontally; below `sm` show icon + count with an sr-only label (editor output panel pattern) | |
| Breadcrumb (exists) | | current page `aria-current` | | Truncates | `navbar.jsx:104`. `SECTION_LABELS` misses `orders`, `admin`, `onboarding` and keeps a stale `connect`. |
| Dropdown menu (exists) | | open, item focus, destructive item | Arrows, typeahead, Esc | Replaced by a bottom Sheet below 768 px (account menu pattern) | |
| Dialog / Alert dialog / Sheet (exist) | dialog, alert-dialog (confirm), sheet left/bottom | open, closing | Focus trap, Esc, focus returns to the trigger | Sheets for navigation and menus on phones; dialogs stay centred | Confirm every irreversible or attempt-consuming action (reset code, restore submission, withdraw, archive). |
| Tooltip / Popover (exist) | | | Tooltip on focus and hover; Popover closes on Esc | A tooltip never carries information that touch users need | |
| Toast (exists, Sonner) | success, info, warning, error (mapped from status in `ui/alert.jsx:21-32`) | | Region announced politely | | Transient confirmation only. Never the only place for an error that needs action ([QA_AND_ACCESSIBILITY.md](./QA_AND_ACCESSIBILITY.md)). |
| Alert / banner (Proposal) | info, success, warning, destructive | | `role="status"` or `role="alert"` by severity | Full width | Replaces CI-04. |
| Table + pagination (exists) | | empty, loading rows, error row | | Below `md`, tables scroll inside their own container | Admin only today. |
| Progress (exists) | default; colour via token class (`bg-xp` for EXP) | value | Accessible name and `aria-valuenow` | | Replaces CI-02. |
| Badge (exists) | default, primary, secondary, outline, success, warning, destructive | | | | Status always pairs colour with text or an icon. |
| Skeleton (exists) | | | `aria-busy` on the container | Mirrors the final layout | |
| Empty (exists) | icon + title + description + action | | | | Migrate bespoke empty blocks (UX-205). |
| Error (`ErrorReload`, exists) | inline | | Retry button focusable | | Migrate the 9 bespoke error blocks. |

### 6.2 Domain components

| Component | Where | Purpose | States | Keyboard / a11y | Responsive | Gaps |
|---|---|---|---|---|---|---|
| Course card | `components/course/courseItem.jsx` | Catalogue entry: logo, title, language/category, level, price tag, rating, recommended level, stats, instructor, Details action | loading skeleton, owned, enrolled, free, paid, points, no rating ("No ratings yet") | One Details button, no nested links | 1 column on phones, grid above | Price and ownership come from `commerce/priceTag` and `ownershipBadge`: keep a single source. |
| Course progress row | `components/learning/course.jsx` | My-learning list item | not started, in progress, completed, withdrawn, 0 lessons | Withdraw confirmed in an AlertDialog | Stacks on phones | A course with 0 lessons only shows a toast when opened (`course.jsx:112-115`). |
| Syllabus / lesson navigation | `components/learning/[id]/studyingPage.jsx` | Chapters (Collapsible) and lessons with status icons and Code/Quiz badges | locked, current, done, in progress | sr-only status text; the Sheet focuses the current lesson on open | `aside` at ≥1024 px, left Sheet below | No keyboard shortcut for previous/next lesson. |
| Lesson footer steps | `components/learning/[id]/lessons.jsx` | Mark complete, previous/next | blocked (challenges unresolved), saving, completed | Disabled state explained in text | 1 column on phones | Reward feedback bug (UX-101). |
| Challenge panel | `challengeSection.jsx`, `challenges/codingChallenge.jsx`, `challenges/quizChallenge.jsx` | Header (difficulty, points, EXP), body, attempts | passed, out of attempts, cooldown (quiz) | Tabs when there are several challenges | Edge-to-edge editor on phones | |
| Code editor controls | `challenges/codeEditor.jsx` | Toolbar (file, draft status, shortcuts, Format, Reset, Run, Submit), canvas, status bar | read-only while submitting; draft saving / saved / error | VS Code shortcuts; Esc then Tab leaves the editor | 16 px text at ≤425 px; height `clamp(15rem,50svh,36rem)` | `xs` / `icon-xs` buttons are 24 px on touch. |
| Submission result panel | `codingChallenge.jsx:448-601`, `submissionHistory.jsx` | Output, Tests (Input/Expected/Received), Console, History, result banner | running, passed, failed, error, timeout, expired | `aria-live="polite"` panel, `role="status"` banner | Tab labels collapse to icons below `sm` | The UI labels Python files (`main.py`, `codingChallenge.jsx:337`) although only JavaScript runs (`docs/sandbox.md`). |
| Level / EXP widgets | `components/ui/level.jsx` | Level badge, chip, progress, level-up dialog | loading, max level | Progress has a name | | The lesson-complete path never shows rewards (UX-101). |
| Price and purchase actions | `components/commerce/*` | Price tag, Buy, Redeem with points, owned state | free, paid, points, owned, insufficient points, pending order | The redeem dialog has an inline `role="alert"` | | Banners are hand-rolled (CI-04). |

## 7. Rules for new UI

1. Search `components/shadcn` and `components/ui` before writing markup. Extend with a variant; do not fork.
2. Feature folders never re-implement a state component (loading, empty, error, forbidden).
3. Colours, radii, shadows and spacing come from tokens and the Tailwind scale. No arbitrary `text-[Npx]` except the documented dense editor sizes ([DESIGN_SYSTEM_SPEC.md](./DESIGN_SYSTEM_SPEC.md), section 3).
4. Every interactive element has an accessible name that starts with its visible text (WCAG 2.5.3).
