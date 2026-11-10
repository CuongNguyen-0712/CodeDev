# Blog UI: findings and improvement plan

Measured on 2026-11-10 in a real browser, signed in as a test learner, at 1440 and 375 px in light
and dark, on `/blog`, `/blog/[slug]`, `/blog/me` and `/blog/new`, and compared with `/course` and
`/roadmap`. Figures come from `getBoundingClientRect` and axe-core 4.10 (WCAG 2.2 AA). The admin
review queue (`/admin/blog`) needs an admin session with 2FA and was read in code only.

Another session had uncommitted edits in nine `components/blog/*` files when this was written.
The plan below changes the same files, so it starts after that work is committed.

## Measurements

| Page | Title size | Title top | Column left edge | Column width |
|---|---|---|---|---|
| `/course` | 36 px | 96 px | 267 px | 1152 px (`max-w-6xl`) |
| `/roadmap` | 30 px | 96 px | 267 px | 1152 px (`max-w-6xl`) |
| `/blog` | 36 px | 88 px | 355 px | 976 px (`max-w-[61rem]`) |
| `/blog/[slug]` | 44 px | 144 px | 363 px | 960 px (`max-w-[60rem]`) |
| `/blog/me` | 36 px | 88 px | 459 px | 768 px (`max-w-3xl`) |
| `/blog/new` | 36 px | 88 px | 459 px | 768 px (`max-w-3xl`) |

Measured at 1440 with the sidebar open. On a phone, the first post card on `/blog` starts at 312 px.

## Sound today

- axe: 0 violations on every blog page in both themes and at both widths.
- No sideways scroll at 375; code blocks scroll inside themselves.
- Feed cards have one link stretched over the card, 40 px action buttons, and a fixed 16:9 cover
  box, so the feed does not jump while images load.
- The post page has a 40rem reading column (17 px text), a table of contents from xl, and
  BlogPosting JSON-LD.

## Findings

1. **The column jumps between blog pages.** Four pages use three widths and three left edges, and
   none match Course or Roadmap. Going from the feed to a post or to My posts, the title moves
   sideways by 8 to 104 px.
2. **Titles sit at different heights and sizes.** The post title starts 56 px lower than the feed
   title because of a "← Blog" button above it. The navbar breadcrumb already shows "Blog". Roadmap's
   title is 30 px where the Course and Blog titles are 36 px.
3. **The breadcrumb says "Details" on every blog subpage**, including My posts, Write a post, Edit
   and each post. The navbar labels any second segment "Details" (`components/ui/navbar.jsx:116`).
4. **Headings run backwards under a post.** The "More about sql" heading is 18 px, but the related
   card titles under it are 20 px. The "Comments (0)" heading is 18 px too, smaller than the body's
   own h2 (24 px).
5. **On a phone the feed starts low.** The title, the description, the Write and My posts buttons
   and the topic row come before the first post, which starts at 312 px of an 812 px screen.
6. **Topics come from the loaded page only.** The topic list is built from the first 10 posts
   (`blog.jsx`), so a topic used only by older posts never appears.
7. **Images in a post have no frame.** An image renders at its natural size with no border, no
   background and no caption. A small one floats mid-column like a coloured chip; the seeded 40 px
   image showed as a purple pill.
8. **Comments look different from course comments.** The blog shows a large boxed "No comments
   yet" panel. The course discussion shows a compact empty line, and its items use another avatar
   size, time format and action style.
9. **My posts has no way back to the feed** other than the breadcrumb. Its rows show status, date
   and counts, but no excerpt, so drafts are told apart by title only.
10. **The editor is bare.** The title field has no placeholder and no length counter. Markdown has
    no syntax help. Preview replaces the text instead of sitting beside it on wide screens.

## Plan, in order

Each step is one commit and is measured at 1440 and 375 in both themes, with axe and an overflow
check.

**Status 2026-11-10: steps 1-3 done.** Course, Roadmap, the feed, a post, My posts and Write a post
now all start their title 88 px from the top and 291 px from the left at 1440. On a 375 px phone
they all start 72 px from the top and 16 px from the left, at 30 px. The breadcrumbs read "Blog > Post",
"Blog > My posts" and "Blog > Write a post". Under a post, both section headings are 20 px and the
related card titles 17 px. axe found 0 violations and nothing scrolls sideways on any of these
pages, in light and dark.

**Status 2026-11-10, later: steps 4-9 done, plus the blog textareas.**

- **Textareas.** All are fixed height and cannot be resized:
  - The editor body is `min(32rem, 60dvh)` tall and scrolls inside; the preview box is the same height.
  - The comment box is 80 px.
  - The appeal reason is 96 px.
  - Typing 80 lines into the editor leaves it 487 px tall on a 375 × 812 screen.
- **Step 4.** On a phone the first post now starts at 236 px (it was 312).
- **Step 5.** An image is framed with a 96 px minimum height, and its alt text is shown as the
  caption.
- **Step 6.** Correction to finding 8: the course discussion uses the same empty state as the blog.
  The real difference was the list frame, and the blog comments now sit in one bordered card with
  divided rows and the course's row padding.
- **Step 7.** My posts has a Blog button and a one-line excerpt per post. The query did not select
  the excerpt before.
- **Step 8.** The title has a placeholder and a 0/150 counter, and a Markdown help line sits under
  the body. Side-by-side Write and Preview was dropped: in the 48rem editor column each pane would
  be about 370 px, narrower than the post's 40rem column, so the preview would no longer show the
  published layout.
- **Step 9.** The topic filter lists the 12 most used tags of published posts, most used first. It
  is cached with the feed and covered by a PostgreSQL test.

The image inside the frame could not be checked: the local media server (`127.0.0.1:3010`) did not
answer during the check.

**Colour and contrast pass (same day).**

- **Editor.** The body field sat on the base input's `dark:bg-input/30`, a grey wash over the
  near-black page. Writing now happens in one composer on the card colour, with the Write/Preview
  toolbar, the text, and a footer giving Markdown help plus a word count and reading time. The
  focus ring wraps the whole composer. The title and tag fields use the same ground. The sticky
  action bar has a blur and a soft shadow above it.
- **Feed sidebar.** It is now two cards: "Share what you learned", with the reward line and both
  actions, and Topics. The current topic pill is solid violet, since the soft tint read as one more
  outline pill in dark mode. Each topic shows its number of published posts.
- **Checks.** axe 0 at 1440 and 375, in light and dark.

1. **One frame for every blog page.** Every blog page uses the shell frame Course and Roadmap use
   (`mx-auto w-full max-w-6xl px-4 sm:px-6 pt-6 lg:pt-10`), so the title starts at the same edge and
   height on all of them. Inside the frame:
   - The feed keeps its post column plus the 15rem sidebar.
   - The post keeps its 40rem reading column, now left-aligned, with the contents list beside it.
   - My posts and the editor use a 48rem column.

   Roadmap's title moves from 30 to 36 px to match.
   Done when the table above shows one left edge and one title top per width.
2. **Breadcrumb names.** In the navbar, `/blog/me` reads "My posts", `/blog/new` reads "Write a
   post", `/blog/edit/[id]` reads "Edit post" and `/blog/[slug]` reads "Post". The "← Blog" button
   above the post title goes, since the breadcrumb already links back. Done when no blog page shows
   "Details".
3. **Heading scale under a post.** The Comments and More posts headings become 20 px (`text-xl`),
   and compact related cards use 17 px titles. Done when no card title is larger than its section
   heading.
4. **Phone feed header.** Below `sm`, Write a post sits in the title row as a primary button and My
   posts becomes a link in the description line, so only the topic row stays above the feed. Done
   when the first card starts at or above 240 px on a 375 × 812 screen.
5. **Framed post images.** An image becomes a figure with a 1 px border, rounded corners, a muted
   background, a 96 px minimum height with the image centred, and its alt text as a caption. The
   same rule serves the editor's preview.
6. **Comments in the course style.** The blog uses the course discussion's comment item (avatar
   size, name, relative time, actions) and its compact empty state. The heart and like count stay,
   since they are the blog's own reaction. This touches `postComments.jsx` and
   `commentPage.jsx`/`commentItem.jsx`; shared parts move to one component.
7. **My posts.** Add a "Blog" link next to Write a post, and show the excerpt (one line) under each
   title. Rejected and hidden rows keep their coloured reason lines.
8. **Editor.**
   - The title gets a placeholder and a counter in the 120-character limit's style.
   - A one-line Markdown help line sits under the body.
   - From xl, Write and Preview show side by side.
   - The sticky action bar keeps Publish as the primary button.
9. **Topics from the server.** The feed asks for the most used topics (a small query on published
   posts), not the first page's tags. This is a data change and needs a test.

## Not covered

- The admin review queue (`/admin/blog`) was not measured. It gets the same overflow and axe pass
  in the next admin session.
- Feed performance, such as cover image sizes and the load-more cursor, is out of scope here.
