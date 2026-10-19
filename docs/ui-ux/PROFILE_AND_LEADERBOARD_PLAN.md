# Public profile (`/profile/[id]`) and leaderboard (`/ranking`): UI/UX plan

Status: **implemented locally (2026-10-19), not deployed.** Migration `20261019_001` is applied to the local database only. See §8 for what differs from this plan.
Builds on: [UI_UX_MASTER_PLAN.md](UI_UX_MASTER_PLAN.md) (D-01 approved: keep the current visual language), [`docs/ranking-plan.md`](../ranking-plan.md) (rank rules, data model, API), [DESIGN_SYSTEM_SPEC.md](DESIGN_SYSTEM_SPEC.md) (tokens, type scale).
Unblocks: decision **D-07** (public profiles) and **D-05** (ranking UI), roadmap item **R4-3**.

Facts are marked **[F]** (checked in the code on 2026-10-19). Everything else is a proposal.

---

## 1. Starting point

| Area | Current state |
|---|---|
| Own profile | **[F]** `/profile` (`app/profile/page.jsx`, `components/profile/profilePage.jsx`) is PRIVATE. Sections: header, activity (courses by status), languages, `ExpProgress`, `ExperienceSection` (level ladder). |
| Public identity data | **[F]** `db/social.db.js#getUsersSocial` already exposes `public_id AS id`, `username`, `image`, `nickname`, `exp_level AS level`, `levelTitle` for active users (used by `/contact`). |
| User lookup | **[F]** `db/user.db.js:58` finds a user by `public_id` **or** `id::text`. A public route must only accept `public_id` / `username`, never the internal id. |
| Links to other people | **[F]** Removed in Phase 0b (QW-2, `commentItem.jsx`) because `/profile/{user_id}` used the internal id and the route did not exist. |
| Ranking | **[F]** Nothing built. `profile.info.rank` exists but is unused; `docs/ranking-plan.md` §5 drops it. No `/ranking` route, no `RankBadge`. |
| Shared widgets | **[F]** `components/ui/level.jsx`: `levelProgress`, `LevelBadge`, `ExpProgress`, `LevelPointsChip`, `announceRewards`, `LevelUpDialog`. |
| Sidebar | **[F]** `components/ui/dashboard.jsx` `NAVIGATION`: Workspace / Resources / Community (Contacts). |
| Anti-cheat | **[F]** Production has no `CODE_RUNNER_URL`; coding results are reported by the browser (ranking-plan §9). |

## 2. Guidelines applied

From the `ui-ux-pro-max` UX and shadcn guidelines, plus WCAG 2.2 AA:

- Tabular data uses a real `<table>` with `<thead>`/`<tbody>` and `scope="col"`, not a div grid. On narrow screens, switch to a card list instead of a wide table that breaks the layout.
- Show the viewer where they stand: the pinned "you" row is the single most useful element of a leaderboard.
- Ranking must never depend on colour alone. Every tier shows a text label; the top 3 also show the position number.
- Respect `prefers-reduced-motion` for any rank-up or podium motion.
- Privacy by default: public surfaces show only what the person chose to show, and never email, orders, points balance or sessions.
- Every async surface has loading, empty, error and "not available" states (see the state matrix in [QA_AND_ACCESSIBILITY.md](QA_AND_ACCESSIBILITY.md)).

---

## 3. Public profile `/profile/[id]`

### 3.1 Goals

1. Let learners recognise each other (comment authors, contacts, leaderboard rows) without exposing private data.
2. Reuse the own-profile layout, so there is one profile design, not two.

### 3.2 URL and identity

| Rule | Detail |
|---|---|
| Key | `/profile/[username]` (readable, shareable). Fallback: `public_id`. Never the internal `users.id`. |
| Own profile | `/profile/[my username]` redirects to `/profile` (keeps one editable surface). |
| Not found | Unknown, deleted, locked or hidden user: `notFound()` → `app/not-found.jsx` (same 404 for all, so a hidden profile cannot be told apart from a missing one). |
| Access | PUBLIC route (readable signed out), `robots: noindex` until the privacy switch has been live for a while. |
| Metadata | `generateMetadata` → `"{nickname or username} | CodeDev"`. Avoids the hard-coded `<title>` issue on this route. |

### 3.3 What is shown (privacy contract)

| Data | Public | Notes |
|---|---|---|
| Avatar, username, nickname | Yes | Already public via `getUsersSocial`. |
| Level, level title, EXP bar | Yes | `LevelBadge` + `ExpProgress` (read-only). |
| Ranks (overall / EXP / points) | Yes, when ranking is enabled | `RankBadge` ×3 (§4.6). Hidden when the person opted out of the leaderboard. |
| Courses completed / in progress (titles) | Opt-in | Default **off**: learning history can be sensitive. Show counts only when off. |
| Languages share | Opt-in | Same switch as courses. |
| Member since | Yes | Month and year only. |
| Email, points balance, orders, sessions, settings | **Never** | |

New settings in `/settings` › Privacy (one row each, `Switch` + description):

- "Show my profile to other learners" (default on). Off: profile 404s for others, and the comment author name is not a link.
- "Show my courses and languages on my profile" (default off).
- "Show me on the leaderboard" (default on; ranking-plan §7).

### 3.4 Layout

Reuse the `profilePage.jsx` sections. Extract the header and stat cards into a shared `ProfileHeader` / `ProfileStats` that both routes import (no duplicated component).

```
Desktop (≥1024)                                   Mobile (<768)
┌───────────────────────────────────────────┐     ┌─────────────────────┐
│ [avatar 80]  Nickname          [Level 7]  │     │ [avatar 64] Nickname│
│              @username · since Mar 2026   │     │ @username  [Lv 7]   │
│              EXP ███████░░ 1,240 / 1,900  │     │ EXP ██████░░        │
├──────────────┬──────────────┬─────────────┤     ├─────────────────────┤
│ Overall      │ EXP rank     │ Points rank │     │ Ranks (stacked)     │
│ Elite  #12   │ Developer #8 │ Gold  #20   │     │ Overall  Elite  #12 │
├──────────────┴──────────────┴─────────────┤     │ EXP      Dev    #8  │
│ Completed 4 · In progress 2 · Solved 37   │     │ Points   Gold   #20 │
├───────────────────────────┬───────────────┤     ├─────────────────────┤
│ Courses (opt-in)          │ Languages     │     │ Stats 2×2 grid      │
└───────────────────────────┴───────────────┘     │ Courses / Languages │
                                                   └─────────────────────┘
```

- Content width: **wide** (D-02). The header is a single `section` with `h1` = display name.
- Viewer actions (signed in, not self): none in v1. "Add friend" waits for the D-06 community decision; do not add a dead button.
- Own profile `/profile` gains a "View public profile" link and a privacy summary line ("Visible to other learners · courses hidden") linking to Settings.

### 3.5 States

| State | UI |
|---|---|
| Loading | Server-rendered; skeleton only for the client-fetched rank block (`aria-busy`). |
| Not found / hidden / locked | `notFound()` (identical response). |
| Ranking not public (§4.8 gate) or user opted out | Rank row hidden, no placeholder. |
| No activity yet | "No completed courses yet" as muted text, not an empty card. |
| Error loading ranks | Compact `ErrorReload` inside the rank card; the rest of the page still renders. |

### 3.6 Entry points (restores what QW-2 removed)

- Comment author name and avatar → `/profile/{username}` (`commentItem.jsx`).
- `/contact` cards → profile.
- Leaderboard rows → profile.
- Each link has an accessible name that includes the person ("View profile of Linh").

### 3.7 Backend dependencies (approval-gated, not UI work)

- A server-only `getPublicProfile(username)` (and, if a client needs it, `GET /api/user/public/[username]`) returning **only** the §3.3 fields, filtered by the privacy flags. Lookup by `username` or `public_id`; must not accept `id::text`, so do not reuse the `user.db.js:58` query as-is.
- `profile.info.show_profile` (default true) and `show_learning` (default false), plus a settings endpoint.
- Rate limit the public endpoint (username enumeration).

---

## 4. Leaderboard `/ranking`

### 4.1 Goals

1. Motivate steady learning without shaming low ranks.
2. Always answer "where am I, and what is my next step?".

### 4.2 Information architecture

- Sidebar › **Community**: add "Leaderboard" (`LuTrophy`), access `auth`. The Community group becomes Contacts + Leaderboard.
- Route `/ranking`, PRIVATE in v1 (signed-in only): limits scraping and fits the "own rank first" fallback.
- Query state in the URL: `/ranking?board=overall|exp|points&period=all|30d` (shareable, back button works; same approach as `listFilters`).

### 4.3 Page anatomy

```
┌ h1 Leaderboard ───────────────────────────────── [All time | 30 days] ┐
│ Tabs:  Overall · EXP · Points               (role=tablist, arrow keys) │
├────────────────────────────────────────────────────────────────────────┤
│ Your standing card                                                     │
│  #128 · Elite (Overall) · 3,240 pts   ███████░░  760 to Master         │
│  "How is this calculated?" (Popover: formula from ranking-plan §3.3)   │
├────────────────────────────────────────────────────────────────────────┤
│ Top 3 podium (cards, 2-1-3 order on ≥768, stacked 1-2-3 on mobile)     │
├────────────────────────────────────────────────────────────────────────┤
│ Table  #  | Learner            | Tier        | Score                   │
│        4  | (avatar) nickname  | Elite       | 9,120                   │
│        …  (positions 4–50)                                             │
│ ────────────── pinned row when the viewer is outside the top 50 ────── │
│      128  | (avatar) You       | Elite       | 3,240                   │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Table and list rules

| Rule | Detail |
|---|---|
| Semantics (≥768) | shadcn `Table`: `<caption class="sr-only">Top 50 learners, overall, all time</caption>`, `th scope="col"`; the position cell is `th scope="row"`. |
| Mobile (<768) | Ordered list `<ol>` of rows (position, avatar, name, tier, score on two lines). No horizontal scroll. |
| Numbers | `tabular-nums`, right-aligned score, thousands separators via `Intl.NumberFormat`. |
| Viewer row | `bg-primary-soft` + "You" label + `aria-current="true"`; sticky at the bottom of the scroll container when outside the visible range. |
| Top 3 | Medal icon **and** the number; tier colour only as a 4px accent, label always in text. No gold-on-white text (fails contrast); use `--xp` / `--warning` tokens with their `-foreground` pairs. |
| Row target | The whole row is one link to the profile (min height 44px), visible focus ring. |
| Ties | Distinct positions: the learner who reached the score first ranks higher, then id (ranking-plan §4). |
| Long names | `truncate` with `title`; never wrap into the score column. |
| Size | Top 50 only, no pagination in v1. |

### 4.5 Your standing card

- Tier, position, score, progress to the next tier (`RankProgress`), and one line of next-step copy: "Finish 2 challenges to reach Master" when computable, otherwise "760 points to Master".
- Not ranked yet (score 0): "Complete a lesson to join the leaderboard" + button to `/learning`.
- Opted out: "You are hidden from the leaderboard" + link to Settings. The board still shows others.

### 4.6 Shared components (in `components/ui/level.jsx`, next to `LevelBadge`)

| Component | Props | Notes |
|---|---|---|
| `RankBadge` | `board`, `tier`, `size` | Icon + tier name; colours from existing tokens (`primary`, `xp`, `warning`, `success`, `info`, `muted`). No new palette. |
| `RankProgress` | `score`, `current`, `next` | Uses the shadcn `Progress` primitive (R4-2), `aria-valuetext="760 points to Master"`. |
| `RankRow` | `entry`, `isViewer` | Used by the table, the mobile list and the pinned row (one source). |

Tier names: English in the UI, matching the rest of the English UI. Points: Bronze, Silver, Gold, Platinum, Diamond, Legend. Overall: Rookie, Learner, Practitioner, Elite, Master, Legend. Ranking-plan §11 lists this as an open choice.

### 4.7 Other surfaces (ranking-plan §8)

| Surface | Change |
|---|---|
| `/home` | Small "Rank" card next to the level card: overall tier, `#N`, link "See leaderboard". |
| `/profile` and `/profile/[id]` | Rank block (§3.4). |
| `/contact` | `RankBadge` (overall) next to `LevelBadge`. |
| Rewards | Toast only on rank-up (`announceRewards` handles `rankUp`); the level-up dialog stays the main moment. |

### 4.8 States and gating

| State | UI |
|---|---|
| Loading | Skeleton: standing card + 10 rows, `aria-busy`. Tabs stay interactive. |
| Empty board (new period) | "No one has scored in the last 30 days yet. Be the first." + CTA. |
| Error | `ErrorReload` with retry; keep the standing card if it loaded. |
| **Public board gated** | Until production runs the server-side code runner (`CODE_RUNNER_URL`), `/ranking` shows only the standing card and the tier ladder, with the note "The public leaderboard opens soon". The sidebar item stays visible. One flag controls it (`RANKING_PUBLIC=true`). |
| Stale data | "Updated 3 min ago" under the tabs (Redis cache 5 min). |

### 4.9 Accessibility checklist

- Tabs: Radix `Tabs` (arrow-key navigation, `aria-selected`). The period selector is a `ToggleGroup` with a visible label.
- Changing tab or period announces the new caption through a polite live region.
- Contrast: every tier label ≥ 4.5:1 in light and dark (measure dark mode via `localStorage.theme` and a reload, not by toggling the class).
- Rank-up toast and podium motion respect `prefers-reduced-motion`.
- Text 12px minimum; no `text-[11px]`.

---

## 5. Implementation plan

Order follows the ranking-plan §10 batches. Backend tasks are listed for completeness and need separate approval (no DB or API change is part of the visual work).

| ID | Pri | Scope | Files | Depends on | Effort | Risk |
|---|---|---|---|---|---|---|
| PR-1 | P1 | Privacy flags + settings switches | migration, `settings/settingsPage.jsx`, settings action | D-07 approval | 1 d | Med (DB) |
| PR-2 | P1 | Public profile query and route | new service method, `app/profile/[id]/page.jsx`, route config | PR-1 | 1 d | Med (privacy) |
| PR-3 | P1 | Extract `ProfileHeader` / `ProfileStats`; build the public view | `components/profile/*` | PR-2 | 1.5 d | Low |
| PR-4 | P2 | Restore profile links (comments, contacts) | `commentItem.jsx`, `contact/*` | PR-2 | 0.5 d | Low |
| RK-1 | P1 | Ranking data model, backfill, reward hooks (ranking-plan §5, batch 1) | migrations, `post_points`, `awardChallengeRewards` | D-05 approval | 2-3 d | High |
| RK-2 | P1 | `/api/ranking`, `ranks` on `/api/user/me`, `rankUp` (batch 2) | new route, user service | RK-1 | 1.5 d | Med |
| RK-3 | P1 | `RankBadge`, `RankProgress`, `RankRow` | `components/ui/level.jsx` | RK-2 | 1 d | Low |
| RK-4 | P1 | `/ranking` page: tabs, period, standing card, podium, table/list, states | `app/ranking/page.jsx`, `components/ranking/*`, `dashboard.jsx`, route config | RK-3 | 2.5 d | Low |
| RK-5 | P2 | Rank on home, profile, contact; rank-up toast | `home/*`, `profile/*`, `contact/*`, `level.jsx` | RK-3 | 1 d | Low |
| RK-6 | P0 gate | Production code runner before `RANKING_PUBLIC=true` | infra | none | TBD | High |

Totals: profile ≈ 4 d, ranking UI ≈ 4.5 d, ranking backend ≈ 4 d. The public launch is gated on RK-6.

Tests (Vitest, node env, throwaway users only):

- The public profile service returns no email, points or orders, respects both privacy flags, and rejects internal `id` lookup.
- Ranking: position ties, a viewer outside the top 50 gets `me`, opted-out users are excluded, the period filter works.
- URL state parser for `board` / `period` (same style as `listFilters.test.js`).

## 6. Acceptance criteria

1. `/profile/{username}` renders for a visible user, 404s identically for missing, hidden and locked users, and never includes email or wallet data in the HTML or RSC payload.
2. Comment authors and contacts link to the profile with a descriptive accessible name.
3. `/ranking` works at 375, 768 and 1280 px with no horizontal page scroll; table semantics pass axe; the viewer row is always visible.
4. Every tier label passes 4.5:1 in light and dark.
5. With `RANKING_PUBLIC` unset, no other learner's rank is visible anywhere.

## 7. Decisions needed

| ID | Question | Recommendation |
|---|---|---|
| D-07 | Build public profiles? | **Build** with the §3.3 privacy contract (replaces "remove links now"). |
| D-05 | Ranking UI? | **Build personal rank first** (RK-1..3, RK-5); open `/ranking` publicly only after RK-6. |
| D-13 | Profile URL key | `username` (fallback `public_id`). |
| D-14 | Course history public by default? | No (opt-in). |
| D-15 | `/ranking` for signed-out visitors? | No in v1. |
| D-16 | Tier names | English, as in §4.6. |

## 8. Implementation notes (2026-10-19)

Built:

| Area | Files |
|---|---|
| Migration: privacy switches on `profile.info`, `profile.rank_tier`, `public.ranking_scores(_since)` | `db/migrations/20261019_001_profile_privacy_ranking.sql` |
| Queries | `db/ranking.db.js`, `db/profile.db.js`; `showProfile` added to the comment queries (`db/course.db.js`) and Contacts (`db/social.db.js`) |
| Services / API | `services/ranking.service.js`, `services/profile.service.js`, `GET /api/ranking`, `GET /api/ranking/me`, `GET/PATCH /api/user/privacy` |
| Pages | `/profile/[id]` (public, 404 for missing / hidden / locked), `/ranking` (private), Settings › Privacy |
| Components | `RankBadge`, `RankProgress` (`components/ui/level.jsx`), `components/ranking/*`, `components/profile/publicProfilePage.jsx`; own profile shows ranks and a "Public profile" link; `/home` level card shows the overall rank |
| Links | Comment authors and Contacts link to `/profile/{username}` when that profile is visible |
| Rank-up toast | `RankUpWatcher` (root providers): `announceRewards` fires `codedev:rewards`, the ranks are refetched and each board whose tier rose gets a toast (`rankUps` in `lib/ranking.js`). Client-side: no `rankUp` field on the reward responses |
| Contacts | Overall `RankBadge` next to the level (only with `RANKING_PUBLIC=true`, only for learners on the leaderboard); fixed the list never loading (`response.data.success` on an already-unwrapped body) |
| Tests | `__tests__/ranking/ranking.test.js` (unit), `__tests__/ranking/ranking.integration.test.js` (throwaway users) |

Differences from this plan and `docs/ranking-plan.md`:

- **No cache columns.** Scores are computed from the EXP / points ledgers by `public.ranking_scores`, so `post_points` and `awardChallengeRewards` are unchanged. A pass counts as first try when the award came on the first quiz attempt or first code submission. Switch to cache columns when the leaderboard query gets slow.
- **EXP tiers** live in `profile.rank_tier` (`kind = 'exp'`, thresholds equal to the level groups) instead of a `rank_group` column on `profile.exp_level`.
- **Own ranks** come from `GET /api/ranking/me`, not a `ranks` block on `/api/user/me`.
- **Own public profile** is not redirected to `/profile`: it shows a "This is how other learners see your profile" banner, so learners can preview it.
- **Gate:** other learners' ranks (the `/ranking` table and ranks on public profiles) appear only with `RANKING_PUBLIC=true`. Leave it unset in production until the code runner grades coding challenges there (RK-6).
- Staff accounts (`admin.read`) and locked accounts are excluded from the boards.

Not done yet:

- Excluding test / unverified-email accounts from the boards.
- Dropping the unused `profile.info.rank` column.
- Production: run the migration (`npm run db:migrate:prod`), then `npm run db:compare` and `npm run db:export`.
