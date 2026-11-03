# Admin and learner dashboard: next UI/UX steps

State on 2026-11-02, after the admin UI pass (findings, colour, phone layouts, loading states, motion) and
the learner home and sidebar sizing. Everything below was seen in the browser at 1440, 768 and 375 px in
light and dark, or is named as not seen yet.

What already holds: no admin screen scrolls sideways at 375 or 768 px (content column under 672 px drops
secondary columns), axe reports 0 WCAG 2.2 AA issues on the measured screens in both themes, every list
screen opens with a finding from its data, loading states keep the card frame.

## Status (2026-11-03)

Done: 1 (row actions carry their row, `RowAction target`), 4 (Needs attention ends on "Open System"),
5 (permission filter; a sticky role header is not possible inside the sideways-scrolling table and was
left out), 6 (search on Catalog and Courses kept in the URL, on a course's Challenges in the page; no
column sort yet), 7 (Run, Course and User detail findings; Access and Settings keep their description),
8 (public learner pages measured at 768 px beside the open sidebar and at 375 px: no sideways scroll,
axe 0; signed-in pages still to measure), 10 (command palette, Ctrl/Cmd+K and a Search button),
11 (chart readout: peak by default, hovered or arrow-key day otherwise), 12 (empty states for Orders,
Audit, Access).

Open: 2 (flows not yet seen in a browser, now including the palette, list search, chart readout and the
new findings), 3 (sessions dropping in local work), 9 (compact recommendation cards, needs a signed-in
home), 13 (motion seen with the window in view), 14 (PRODUCT.md / DESIGN.md need the product owner's
answers through impeccable `init`).

## P0: correctness and access

1. **Row actions need the item in their name.** A table has many buttons named only "Rename", "Delete",
   "Edit", "Manage", "Refund", "Revoke", "Retry", "Resolve". A screen-reader user hears ten identical
   "Rename" buttons. Give `RowAction` an optional `target` and use `aria-label={`${label} ${target}`}`
   (for example "Rename Angular"); the visible word stays as it is.
2. **Flows not yet seen in a browser.** Open and use, on a phone and on desktop:
   the course Manage dialog (skill weights now use `Select`), Grant access (course `Select`), the Refund,
   Revoke, Retry and Resolve confirmations (fixed-height reason field), 2FA enrolment with the QR code and
   the recovery-code screen (codes now one per cell, numbered, one line each), the step-up dialog.
3. **Sessions drop during local work.** The browser was signed out several times within one sitting (access
   state lasts 15 min, `AUTH_ACCESS_TOKEN_TTL_SECONDS`). Check that the refresh runs before admin requests
   and that a dropped session returns to the same admin page after sign-in, not to `/home`.

## P1: layout and flow

4. **Overview, Needs attention.** At 1440 px the card is stretched to the chart's height with blank space
   under two rows. Pin a "Open System" footer link to its bottom, or let the row end at its content.
5. **Roles & permissions.** About 3,600 px tall on desktop. Add a filter box (by permission or resource),
   keep the role header row visible while scrolling, and collapse resources by default.
6. **Long lists.** Catalog (60+ categories), Courses and Challenges have no search or sort. Add a search
   field above each table and sort on the name and count columns; keep the URL as the filter state as the
   other screens do.
7. **Detail screens without a finding.** User, Run and Course detail, Access and Settings still show a
   description, not a fact from their data (for example "3 active sessions, last sign-in 2 h ago", "Failed
   2 of 5 tests, timed out on test 3", "2 publish checks open").
8. **Learner pages beside the sidebar.** The sidebar tokens changed (its own ground in both themes) and the
   phone sheet is narrower. Re-measure the learner pages (Course, Roadmap, Learning, Ranking, Settings) at
   768 px with the sidebar open; move their phone rules to container queries where the content column is
   what matters, as the admin and home now do.
9. **Recommendation cards on Home.** Tall cover image plus a bullet list per card; on a phone each card is
   most of the screen. Try a compact variant: smaller cover, one-line reason, the rest on the course page.

## P2: polish

10. **Command palette** (Ctrl/Cmd+K) for admin navigation and "find a user", already listed in the admin plan.
11. **Chart.** Bars carry a `<title>` only; add a focusable bar or a visible value on hover and focus, and
    check the bar colour against the dark card.
12. **Empty states with a next step.** Orders ("no course bought yet": link to Courses), Challenges with no
    attempts, Dead letters when empty.
13. **Motion check with the window in view.** The fade, row arrival and bar growth were confirmed in CSS
    only (the pane was hidden); watch them once and once with reduced motion on.
14. **Write PRODUCT.md and DESIGN.md** (impeccable `init` / `document`) from the shipped admin and home, so
    later passes follow one recorded system instead of re-deriving it.

## How to check each step

- Measure at 1440, 768 (sidebar open) and 375 px, light and dark: no sideways scroll on the page or inside
  a table, axe 0 issues on `#admin-main` or `#container`.
- Run `npx eslint components/admin components/home`, the impeccable detector on the changed folders and
  `npx vitest run __tests__/admin`.
