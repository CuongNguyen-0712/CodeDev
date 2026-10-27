# Design system specification

Part of the CodeDev UI/UX plan. Master document: [UI_UX_MASTER_PLAN.md](./UI_UX_MASTER_PLAN.md).

Source of truth in code: `app/globals.css` (tokens, `@theme inline` mapping, base layer), `app/fonts.js` (next/font), `components/shadcn/*` (primitives). This document describes what exists, then what is proposed. Items marked **Proposal** need approval before implementation.

## 1. Design principles

| Principle | What it means in CodeDev | Check |
|---|---|---|
| Clarity over decoration | Flat surfaces, hairline borders, one accent colour. Decoration only in the brand mark. | No gradients or heavy shadows on content surfaces. |
| One next action | Each view section has at most one primary (filled violet) button. | Page review in the master plan, section 7. |
| Developer-friendly density | Monospace for numbers, code and identifiers (`font-mono tabular`); compact tables; editor-style dark surfaces for code. | |
| Predictable navigation | Same shell, breadcrumb rules and back behaviour on every signed-in page. | [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md). |
| Immediate, durable feedback | Every action shows a pending state; results that need action stay on screen inline; toasts only confirm. | [QA_AND_ACCESSIBILITY.md](./QA_AND_ACCESSIBILITY.md), section 5. |
| Responsive by default | Phone layouts are designed (Sheets, stacked panels, edge-to-edge editor), not scaled down. | Section 9. |
| Accessible by default | WCAG 2.2 AA; contrast pairs are documented next to the tokens. | |
| Reuse before create | Extend shadcn primitives and `components/ui`; never fork. | [COMPONENT_INVENTORY.md](./COMPONENT_INVENTORY.md). |

## 2. Colour tokens

### 2.1 Architecture (exists)

1. **Semantic tokens** are CSS custom properties on `:root` (light) and `.dark` (dark) in `app/globals.css`.
2. `@theme inline` maps each one to a Tailwind colour (`--color-primary: var(--primary)`), and `--color-*: initial` removes Tailwind's default palette, so components can only use tokens. Verified: zero hex literals and zero raw palette classes (such as `bg-blue-500`) in `components/` outside the email templates.
3. Dark mode is class based: `@custom-variant dark (&:where(.dark, .dark *))`, toggled by `contexts/themeContext.jsx` (stored in `localStorage.theme`, defaulting to `prefers-color-scheme`).

### 2.2 Semantic tokens (current values)

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
| Page background | `background` | `#FFFFFF` | `#100E15` | Page surface |
| Secondary background | `canvas` | `#F7F6FA` | `#0E0C12` | Lesson quotes (`styles/learning/[id]/lesson.css`); no Tailwind utility use |
| Surface | `card` / `popover` | `#FFFFFF` | `#1D1A26` / `#24202E` | Panels, menus (dark: each step lighter, card 1.12:1 and popover 1.21:1 against the page) |
| Text primary | `foreground` | `#17141F` | `#EEEBF4` | Body |
| Text muted | `muted-foreground` | `#605B6E` | `#ABA5BB` | Supporting text (dark: 7.2:1 on card) |
| Neutral fill | `muted` = `secondary` = `accent` | `#F1EFF6` | `#221E2C` / `#24202E` / `#2D2839` | Skeletons, hovers, secondary buttons |
| Brand action fill | `primary` / `primary-hover` / `primary-foreground` | `#7C3AED` / `#6D28D9` / `#FFFFFF` | same | Primary buttons |
| Brand as text | `primary-ink` | `#7C3AED` | `#A78BFA` | Links, active labels, icons (`text-primary-ink`, never `text-primary`) |
| Brand tint | `primary-soft` / `primary-soft-foreground` / `primary-border` | `#F3EEFF` / `#6D28D9` / `#DDD0FB` | `#231B35` / `#C4B5FD` / `#3A2C5C` | Selected rows, soft badges |
| Lines | `border` / `input` / `ring` | `#E5E2EC` / `#8B859A` / `#7C3AED` | `#3D3749` / `#7A7390` / `#A78BFA` | Hairlines (decorative) / control borders (3:1) / focus |
| Status | `success`, `warning`, `destructive`, `info` (each with `-foreground`, `-soft`) | `#15803D`, `#B45309`, `#C42840`, `#2563EB` | `#2EA063`, `#FBBF24`, `#F87171`, `#3B82F6` | Status text, badges, banners |
| Gamification | `xp` / `xp-soft`, `streak` / `streak-soft` | `#A3480A` / `#FEF3C7`, `#C2410C` / `#FFF7ED` | `#FBBF24` / `#2B210C`, `#F97316` / `#2B180C` | EXP and level; streak is unused |
| Sidebar | `sidebar*` (8 tokens) | | | Shell sidebar |
| Code surfaces | `editor*` (11), `syntax-*` (12), `editor-scrollbar-*` | violet ink + Dracula | same | Editor, terminal, lesson code |
| Brand mark | `logo-start` / `logo-mid` / `logo-end` | orange to violet | lifted under `.dark` and `.logo-on-dark` | `components/ui/logo.jsx`, favicon |
| Chrome | `scrollbar-thumb*`, `overlay` | | | Scrollbars, modal backdrop |

Measured contrast pairs are recorded as comments above each block in `app/globals.css`, for example `primary-foreground on primary 5.70:1`, `primary-ink on background (dark) 6.88:1`, `xp on xp-soft 5.41:1`.

### 2.3 Normalisation proposals

| ID | Finding | Proposal | Risk |
|---|---|---|---|
| DS-01 | `secondary`, `muted`, `accent` share the same light value. | Keep all three: shadcn components expect these names. Document them as aliases; do not give them new meanings. | None |
| DS-02 | `streak`, `streak-soft`, `primary-border` have no Tailwind usage; `canvas` is used only from CSS. | Remove `streak*` until a streak feature is approved (decision D-05). Keep `canvas` and `primary-border`. | Low |
| DS-03 | Dark `primary` (`#7C3AED`) fails as text on dark surfaces (3.0-3.3:1). | Rule already in place with `primary-ink`. Add a lint check that rejects bare `text-primary`. | Low |
| DS-04 | `xp` (light `#A3480A`) is close to `warning` (`#B45309`). | Accept: EXP is a reward colour, warning a status colour; they never style the same element. | Low |
| DS-05 | Status tokens have no `-ink` split in dark mode. | Not needed: every dark status colour reads at least 6:1 on dark surfaces. | None |

### 2.4 Interaction states

| State | Implementation |
|---|---|
| Hover | `hover:bg-accent` (neutral), `hover:bg-primary-hover` (primary), `hover:bg-destructive-soft` (destructive outline) |
| Active / selected | `bg-primary-soft text-primary-ink`; sidebar `data-[active=true]:bg-primary-soft/70 text-primary-ink`; `aria-current` |
| Focus | 2 px outline in `--ring` with 2 px offset (base layer), shadcn `focus-visible:ring-[3px] ring-ring/50` |
| Disabled | `disabled:opacity-50` + `pointer-events-none`; always paired with a reason in text or a tooltip when the user cannot proceed |
| Invalid | `aria-invalid` gives a destructive border and message |

## 3. Typography

| Item | Value (exists) |
|---|---|
| UI font | Plus Jakarta Sans via next/font (`--font-plus-jakarta`, subsets latin + vietnamese, weights 400/500/600/700), with a size-adjusted Arial fallback face |
| Code font | JetBrains Mono (`--font-jetbrains-mono`, 400/500), monospace fallback stack, `adjustFontFallback: false` so code keeps its columns while loading |
| Stacks | `--font-body`, `--font-code` in `app/globals.css`; each `var()` carries its own default |

Scale in use (Tailwind defaults): `text-sm` 267 uses, `text-xs` 187, `text-base` 29, `text-lg` 17, `text-xl` 7, `text-2xl` 9, `text-3xl` 20, `text-4xl` 20. Weights: `font-semibold` 131, `font-medium` 111.

### 3.1 Hierarchy

| Role | Class | Notes |
|---|---|---|
| Page title (h1) | `text-3xl sm:text-4xl font-semibold tracking-tight text-balance` | Already used on most pages. Deviations to fix: `/admin` `text-2xl`, `/orders/[id]` and `/checkout/mock/*` `text-xl`, course not-found `text-sm` (UX-206). The landing (`/`) and `/about` heroes may stay larger. |
| Section title (h2) | `text-base font-semibold` | |
| Card title (h3) | `text-sm font-semibold` | |
| Body | `text-sm` in the app; `text-base leading-relaxed` for lesson prose and descriptions | Lesson prose in `styles/learning/[id]/lesson.css`. |
| Supporting text and labels | `text-xs text-muted-foreground` | 12 px is the minimum for readable text. |
| Numbers, code, IDs | `font-mono tabular` | |
| Editor chrome | 13 px canvas (16 px at ≤425 px wide), 11 px status bar, `leading-6` | **Documented exception.** Elsewhere `text-[10px]` / `text-[11px]` become `text-xs`. 30 arbitrary sizes remain, mostly in `studyingPage.jsx`, `codingChallenge.jsx`, `codeEditor.jsx`, `ui/input.jsx`. |

## 4. Spacing and layout

| Item | Current | Rule |
|---|---|---|
| Spacing scale | Tailwind 4 px scale (`--spacing: 0.25rem`) | Section gaps `gap-6` / `gap-10`, card padding `p-4`, compact rows `px-4 py-2.5`. |
| Page padding | `px-4 pt-6 pb-10 sm:px-6 lg:pt-10` on most pages | Standard for every `HomeLayout` page. Deviations: admin `py-6 md:px-6`, studying `px-5 sm:px-8`, roadmap detail `py-6 lg:py-8`, landing `pt-8 pb-12 lg:pt-14`. |
| Content width | `max-w-6xl` (12 pages), `max-w-4xl` (help, settings), `max-w-3xl` (onboarding, lesson, roadmap detail), `max-w-2xl` (order status), `max-w-lg` (mock checkout); footer `max-w-[1440px]` | **Proposal**: three widths. **Wide** `max-w-6xl` for lists and dashboards; **form** `max-w-3xl` for settings, onboarding, help, order status; **reading** `max-w-3xl` with `max-w-[70ch]` text for lessons. Footer aligns to `max-w-6xl`. |
| Grids | Ad hoc per page | Card grids `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`. Detail pages `lg:grid-cols-[minmax(0,1fr)_18rem]`, with the aside first on phones. |
| Breakpoints | Tailwind `sm 640`, `md 768`, `lg 1024`, `xl 1280`; shell mobile breakpoint 768 (`hooks/use-mobile.js`) | Keep. Fix the 768 px boundary mismatch: `contexts/appContext.jsx:21` uses `>= 768`, `:31` uses `<= 768`, `use-mobile` uses `< 768` (UX-302). |
| Header | Sticky `h-12`, blurred background (`navbar.jsx`) | Keep. `DefaultLayout` pages (studying, roadmap detail, course detail) draw their own `h-12` bar; **Proposal**: one shared `PageHeaderBar`. |
| Sidebar | `collapsible="icon"` (16 rem / 3 rem rail), Ctrl/Cmd+B, Sheet below 768 px | Keep. Remove the post-hydration open/close flip (UX-301). |

## 5. Radius, borders, elevation, motion

| Item | Current | Rule |
|---|---|---|
| Radius | `--radius: 0.5rem`; `rounded-md` 113 uses, `rounded-lg` 105, `rounded-full` 33 | Controls `rounded-md`; panels and cards `rounded-lg`; avatars and pills `rounded-full`. `rounded-xl` / `rounded-2xl` only for sheets and the account summary. |
| Borders | `border` token | Decorative only. Control borders use `input` (3:1). |
| Shadows | `shadow-xs` 16, `shadow` 11, `shadow-sm` 6, `shadow-lg` 5 | `shadow-xs` on raised controls, `shadow-sm` on editor panels, `shadow-lg` only on overlays. |
| Motion | `tw-animate-css`, about 150 ms transitions; `prefers-reduced-motion` honoured in the base layer | Avoid `transition-all` on layout containers: the `DefaultLayout` section uses it, which delays theme switching. |

## 6. Iconography

`react-icons/lu` (Lucide) only. Decorative icons get `aria-hidden="true"`; icon-only buttons get an accessible name. No emoji in the UI (email templates updated with project logo badge and clean copy; audit UX-210).

## 7. Forms

| Rule | Status |
|---|---|
| Every field uses `components/ui/input.jsx` (`InputGroup`, `TextAreaGroup`) with a visible label | Login, signup, comments and feedback follow it. Admin forms use bare `Input` and native `select`. |
| Field errors inline under the field (`aria-invalid` + `aria-describedby`); a toast only in addition | Settings avatar (`settingsPage.jsx:141-173`) and admin price (`courseAdmin.jsx:213-216`) report errors only by toast (UX-207). |
| Server errors inline in a form-level alert (`role="alert"`) | Auth (`AuthAlert`), onboarding and the redeem dialog do this. Feedback and the settings profile use a toast only. |
| Destructive confirmation through `AlertDialog` | Admin uses `window.confirm` / `window.prompt` (CI-05). |
| Validation schema | zod in auth forms; others validate by hand. **Proposal**: zod for every form that posts user input. |

## 8. Code surfaces

The editor, terminal panel, lesson code blocks and the landing sample share the `editor*` and `syntax-*` tokens and `lib/syntaxTheme.js` (Prism via `react-syntax-highlighter`). The landing sample (`components/index.js`) is not syntax-highlighted yet (UX-209).

## 9. Responsive rules

| Width | Shell | Content |
|---|---|---|
| < 640 (phones) | Sidebar in a left Sheet; account menu in a bottom Sheet | One column; detail asides first; editor edge to edge with 16 px text; tab labels collapse to icons |
| 640-1023 (tablet) | Sidebar Sheet below 768, icon rail or full above | Two-column card grids; course detail cover and info side by side |
| ≥ 1024 (laptop) | Full sidebar | Detail pages get a sticky 18 rem aside; the syllabus is a fixed aside |
| ≥ 1440 (large) | Same | Content capped at `max-w-6xl`; no stretched line lengths |

Touch targets: at least 24 × 24 px everywhere (WCAG 2.5.8) and at least 44 px for primary actions and list rows on touch layouts.
