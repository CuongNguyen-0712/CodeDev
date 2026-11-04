# Learner UI: findings and next steps

Measured on 2026-11-04 in a real browser at 1440 and 375 px, signed out, after commit 103fbe7a.
Every figure below comes from `getBoundingClientRect` and axe-core 4.10 (WCAG 2.2 AA) on the page's
scroller; "footer at the bottom" means the footer's bottom edge equals the scroller's scroll height.

## Fixed in this pass

**Footer squeezed into the page (every shell page taller than one screen).** `app/(shell)` pages
scroll inside `#container`, a column flexbox of fixed height. Commit 1779d183 gave each page
`min-h-dvh` so the footer starts below the fold, but that utility replaces the flex item's
content-based minimum height, so a page taller than a screen was shrunk to one screen (flex-shrink)
and the rest of its content was laid out under the footer. On `/` the footer sat at 780 px with
2,300 px of page below it; `/course`, `/about` and `/roadmap` had the same shape. The scroller's
children now keep `shrink-0` ([homeLayout.jsx](../../components/layouts/homeLayout.jsx)).

After the fix, on `/`, `/course`, `/roadmap`, `/about`, `/blog`, `/help` at 1440 and 375: footer at
the bottom, 0 px gap, no sideways scroll, axe 0.

## Checked and sound

- `/course/[id]`, `/roadmap/[id]`, `/auth` at 1440 and 375: no sideways scroll, axe 0. These use the
  full-height `DefaultLayout` and have no site footer; the course page ends on its purchase bar.
- Admin screens: see `ADMIN_AND_DASHBOARD_NEXT.md` (status 2026-11-03).

## Found, not fixed

1. **Dev server reload loop.** With `next dev --turbopack` (Next 16.4.3, Cache Components on) the
   first page opened after a fresh start reloaded itself every 300–500 ms for as long as it stayed
   open, on `/`, `/help` and every other route tried, from the Claude browser pane and from a separate
   Chrome. The dev log showed `✓ Compiled in 2ms` after each request; the client's HMR handshake then
   sees a newer HMR version than the one its page was served with and Next sends `reloadPage`
   ("HMR hash mismatch"). Two cold restarts did not clear it; a restart triggered by touching
   `next.config.js` did, and pages have been stable since. Left open: what emits a Turbopack update
   on every request after a cold start (candidates: Cache Components in dev, the proxy's existence
   check, `output: 'standalone'`). Reproduce with a cold `next dev` and one open tab; the machine
   thrashes within minutes (the dev process reached 2.3 GB).
2. **Signed-in shell pages not measured**: `/home`, `/learning`, `/profile`, `/settings`, `/orders`,
   `/ranking`, `/contact` need a session. The footer fix is in the shared layout, so it applies to
   them, but their own content was not seen.
3. **Detail pages end without the site footer.** `/roadmap/[id]` stops at its last stage; `/course/[id]`
   at the purchase bar. Decide whether these keep the "tool" layout or get the footer like the shell.
4. **Footer absent while a page streams.** On `/course` the footer was missing for a moment while the
   list streamed (the layout's footer arrives with the page's RSC payload). Harmless once loaded; worth
   a look if the catalog ever stalls.

## Next steps, in order

1. Sign in once and run the same footer, overflow and axe pass on the seven signed-in shell pages.
2. Find the per-request Turbopack update behind the reload loop (bisect `cacheComponents` with the
   `"use cache"` callers stubbed, then the proxy), so a cold `next dev` is usable without a config touch.
3. Decide the footer on detail pages (3 above) and apply it in `DefaultLayout` if wanted.
4. Keep `components/layouts/homeLayout.jsx` as the one place for page-height rules; a page that needs
   its own scroller (learning workspace) uses `DefaultLayout`, never `min-h-dvh` on its own root.
