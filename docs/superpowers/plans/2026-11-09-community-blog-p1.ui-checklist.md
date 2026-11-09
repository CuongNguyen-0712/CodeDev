# UI checklist: community blog P1 (list, post page, editor, admin queue)

Sized as new pages: whole phase. Followed by Tasks 8-10. Counts are from this repo, read directly (about 14 files opened, 6 searches; skill files words.md/checklist.md/values not opened, so values come from the existing blog page and shadcn tokens).

## Reference (level 7, chosen)
- Public pages: `app/(shell)/blog/page.jsx` + `components/blog/blog.jsx` (existing shell page) and `app/course/[id]/page.jsx` for the dynamic-route data flow.
- Admin queue: `components/admin/announcements/announcementsPage.jsx` (infinite list, STATUS badge map, PageHeader, RowAction, ConfirmDialog, `retryTransient`).
- Kind: public list/detail (server-rendered) vs admin list (client, React Query).

## Public list `/blog`
- Holder: `(shell)` layout supplies HomeLayout + Footer; page root is `mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10`.
- Header: `<header>` with `<h1 text-3xl font-semibold tracking-tight sm:text-4xl>` and `<p text-sm text-muted-foreground max-w-[60ch]>` (kept from current blog.jsx).
- Empty state: shadcn `Empty*` with `border`, `EmptyMedia variant="icon"`, h2 inside `EmptyTitle`, `Button asChild` + `Link` (kept as is).
- Tag chips: `Badge variant="outline"` as `Link` (asChild); active tag `variant="primary"`.
- Cards: link-wrapped article, `rounded-lg border bg-card`, hover `hover:bg-accent`, title `h2`; theme tokens only (`text-foreground`, `text-muted-foreground`, `border`), no raw colours.
- Author: shadcn `Avatar` + `AvatarImage src={image || undefined} alt=""` + `AvatarFallback bg-primary-soft text-primary-soft-foreground` (as commentItem).
- Load more: client island, `useInfiniteQuery` from `blogQueries.list`, shadcn `Button variant="outline"`, `Spinner` while fetching, error shown inline text; data via client/keys/queries trio.
- Primary action: shadcn `Button asChild` + `Link` to `/blog/new`.

## Post page `/blog/[slug]`
- Server component, `export const instant = false`, `await params` outside Suspense, `notFound()` when null (course page).
- Same page root width pattern but reading column `max-w-3xl`; `<article>`, single `h1`, meta line (author link `/profile/<id>`, `<time>`, reading minutes, tag badges).
- Body: `<BlogMarkdown>` (renders lesson image/code classes already); the only `dangerouslySetInnerHTML` is the JSON-LD script.
- Dates: `Intl.DateTimeFormat("en", { dateStyle: "medium" })`, in UTC so server output is stable.

## Editor (Task 9)
- Page root as above, shadcn `Field`/`Input`/`Textarea` (components/shadcn/field.jsx), validation through `lib/validate.js` style used by forms, preview via `BlogMarkdown` with `NEXT_PUBLIC_MEDIA_ORIGINS`.
- Submit `Button`, disabled while pending; failures through `useApp().showAlert`.
- Cursor/hover: buttons and links come from shadcn so cursor and hover are inherited.

## Admin queue (Task 10)
- Follow announcementsPage: `PageHeader`, `useInfiniteQuery` with `QUERY_TIMES.live` + `retry: retryTransient`, status via a `STATUS` map of `Badge` variants (success/warning/info/muted), `RowAction`, `ConfirmDialog` for hide/reject, `Skeleton` loading, formatters from `components/admin/ui/format`.

## Shared decisions
- Data layer trio: `clients/*.client.js` (apiClient), `keys/*.keys.js` (array keys under `['blog']`), `queries/*.query.js` (spreads `QUERY_TIMES.*`; list uses `initialPageParam: null`, `getNextPageParam: nextCursor || undefined`).
- Cache timings: public lists use `QUERY_TIMES.catalog`.
- Copy in English; icons from `react-icons/lu`.
- New copy to review: "Write a post", "Load more", "All posts", "Could not load more posts. Try again.", "min read".
