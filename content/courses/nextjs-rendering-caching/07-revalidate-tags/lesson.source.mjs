// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-3-1",
    title: "Revalidation by tag & path after an edit",
    slug: { _type: "slug", current: "revalidation-by-tag-and-path" },
    description:
        "An instructor moved a course from React to Testing: the Testing page showed it at once, the React page kept it for hours, and the hotfix that revalidated the whole site after every save multiplied database load by fifteen. Learn to name cached data with tags, write down which page reads which tag, map every domain event to the smallest set of tags and paths it makes wrong, choose between revalidateTag, updateTag and revalidatePath in Next.js 16, and prove the mapping with a table-driven test.",
    estimatedTime: 20,

    scenario: {
        role: "Full-stack developer, CodeDev catalog team",
        problem:
            "On Monday an instructor moved \"Testing React Apps\" from the React category to the new Testing category. The page https://app.codedev.test/courses?category=testing showed the course within seconds, but the React category page kept listing it until the next day, and learners who clicked it from there landed on a course tagged Testing. A teammate shipped a hotfix that calls revalidatePath(\"/\", \"layout\") after every save in the instructor dashboard. The React page was fixed, and the next morning the database dashboard showed catalog queries up fifteen times on an ordinary day of edits.",
    },

    content: [
        h2("1. The incident: one edit, two wrong answers"),
        p("The catalog data on CodeDev is cached and tagged. The course page reads `course:<id>`, the catalog `/courses` reads `courses:list`, and each category page reads `courses:category:<category>`. This is the server action that saved the category change:"),
        code("typescript", `
// app/instructor/courses/[id]/actions.ts - as shipped
"use server";
import { updateTag } from "next/cache";

export async function changeCategory(courseId: string, category: string) {
  await db.course.update({ where: { id: courseId }, data: { category } });
  updateTag(\`course:\${courseId}\`);
  updateTag(\`courses:category:\${category}\`);   // the new category only
}`, "actions.ts (first version)"),
        p("Read it as the cache sees it. Three cached entries showed the course before the edit: the course data, the React category cards and the catalog cards. The action expired two things: the course data and the cards of the **new** category, which did not show the course yet. The React cards still held the course, and nothing told them otherwise. They stayed until their time-based revalidation ran the next day."),
        p("The hotfix went the other way:"),
        code("typescript", `
// "fix": refresh everything after every save
await db.course.update({ where: { id: courseId }, data: patch });
revalidatePath("/", "layout");`, "actions.ts (hotfix)"),
        p("`revalidatePath(\"/\", \"layout\")` targets the root layout, which every page shares, so every cached page and the data behind them are refreshed on their next visit. Instructors save often: a typo fix in one lesson description now forced the catalog, all category pages and every course page to be rebuilt from the database. Correct, and much more expensive than it needed to be."),

        h2("2. Reproduce it and read the evidence"),
        p("A function marked `\"use cache\"` runs its body only on a cache miss, so a log line inside the body is a miss counter. The catalog team added one to each data function on a preview deployment:"),
        code("typescript", `
// lib/catalog.ts
import { cacheLife, cacheTag } from "next/cache";

export async function getCategoryCards(category: string) {
  "use cache";
  cacheTag(\`courses:category:\${category}\`);
  cacheLife("days");
  console.log(\`[cache miss] getCategoryCards \${category}\`);   // runs only when the cache misses
  return db.course.findMany({ where: { category, published: true }, select: cardFields });
}`, "lib/catalog.ts"),
        p("Then they moved course 88 from React to Testing in the preview and opened both category pages. With the first version of the action, the log shows a miss for Testing only:"),
        code("text", `
10:02:11  POST /instructor/courses/88   changeCategory 88 -> testing
10:02:15  GET  /courses?category=testing  [cache miss] getCategoryCards testing
10:02:19  GET  /courses?category=react    (no miss: served from the cache, still lists course 88)`, "preview server log"),
        p("With the hotfix, the same single edit was followed by a miss on every data function the next pages needed. The production numbers told the same story in aggregate:"),
        code("text", `
catalog queries per hour   before hotfix   after hotfix
getCourse                       310            4 870
getCategoryCards                 95            1 420
getCatalogCards                  40              610`, "database dashboard, weekday 09:00-10:00"),
        p("Both versions fail the same test, from opposite sides. The goal is **no more and no less**: every cached entry that shows the changed data is refreshed, and nothing else is."),

        h2("3. Core idea: tags name data, events name changes"),
        p("A cache tag is a label you attach to a cached entry when you store it. Later, one call with that label marks every entry that carries it as out of date, wherever it is used: in a page, a layout or another cached function. You do not need to know which URLs show the data. You need to know **which data the edit changed**."),
        p("That turns revalidation into two small tables you write down once:"),
        numbered([
            "**Who reads what.** For each cached read: its tag and the fields it shows. Course data `course:<id>` holds everything about one course. Cards `courses:list` and `courses:category:<c>` hold title, price, slug, category and instructor name of **published** courses. The instructor's name lives under `instructor:<id>`.",
            "**What each event changes.** For each domain event: which fields changed, for which course or instructor, and whether those fields appear in a read from table 1.",
        ]),
        p("Tags are compared as whole strings. There is no prefix, wildcard or hierarchy between them, whatever the names suggest. An entry is expired when one of the tags it was **stored with** is expired, so if one entry must be reachable from two events, store it with both tags."),
        p("Joining the tables gives the targets. A description edit changes a field only course data shows, so it needs `course:<id>` and nothing else. A category move changes a card field and moves the course between two category lists: the old one must drop it and the new one must add it. An unpublished draft is not on any card, so editing it never touches a list."),
        h3("Tags or paths?"),
        p("`revalidatePath(path)` refreshes what is cached for one URL (or, with `\"layout\"`, a layout and everything under it). Use it when the problem is the **URL**, not one piece of data:"),
        bullets([
            "A URL starts or stops existing: a course is published or unpublished, or its slug changes (the old URL must stop serving the page, and a 404 cached for the new one must go).",
            "Part of a page comes from a read that has no tag. On CodeDev, the category sidebar of `/courses` (categories with course counts) is an older query without a tag, so anything that changes the counts also revalidates `/courses`. Adding a tag to that query later would remove the need.",
        ]),
        p("Everything else is better with tags: one call reaches every page that uses the data, including pages you add next year."),
        h3("Next.js 16: three functions"),
        bullets([
            "**`updateTag(tag)`**: Server Actions only. Expires the entries now, so the next request waits for fresh data. Use it when the person who made the edit must see it right away (read-your-own-writes), like the instructor saving the form.",
            "**`revalidateTag(tag, \"max\")`**: Server Actions and Route Handlers. Marks the entries stale: the next visitor may still get the old content once while a fresh copy is built in the background (stale-while-revalidate). Fine for a webhook from the billing system that changed a price.",
            "**`revalidatePath(path, type?)`**: for the URL cases above.",
        ]),
        callout("warning", "Caching APIs change between versions",
            "In Next.js 15 and earlier, `revalidateTag(tag)` took one argument and there was no `updateTag`; in Next.js 16 the one-argument form is deprecated and `\"use cache\"` with `cacheTag` and `cacheLife` requires the Cache Components option in next.config. `fetch(url, { next: { tags: [...] } })` also tags a cached fetch. Check the caching guide for the exact version in your package.json before you copy code from a blog post."),
        h3("When not to revalidate on events"),
        bullets([
            "**Data that changes on a schedule, and may be a little late.** A leaderboard that refreshes every 5 minutes is fine with a time-based lifetime (lesson 2.3). Event plumbing for it is extra code with no visible benefit.",
            "**Per-user data.** Enrollment, progress and personal prices should not be in a shared cache at all, so there is nothing to revalidate (lesson 3.3).",
            "**Panic flushes.** `revalidatePath(\"/\", \"layout\")` is a reasonable one-off after a bad deploy or a data migration. As the default after every save it turns the cache off while still paying for it.",
        ]),

        challenge("chal_quiz_nrc_311"),

        h2("4. Worked example: tag the reads, then fix the action"),
        p("Start from the read side. Every cached function names its tags, and the tags follow one convention written in one place, so the reader and the writer cannot drift apart:"),
        code("typescript", `
// lib/cache-tags.ts - the only place that spells a tag
export const tags = {
  course: (id: string) => \`course:\${id}\`,
  catalog: () => "courses:list",
  category: (c: string) => \`courses:category:\${c}\`,
  instructor: (id: string) => \`instructor:\${id}\`,
};

// lib/catalog.ts
export async function getCourse(id: string) {
  "use cache";
  cacheTag(tags.course(id));
  return db.course.findUnique({ where: { id }, include: { lessons: true } });
}

export async function getCatalogCards() {
  "use cache";
  cacheTag(tags.catalog());
  return db.course.findMany({ where: { published: true }, select: cardFields });
}`, "lib/cache-tags.ts and lib/catalog.ts"),
        p("Then the write side. The action reads the course **before** the update, because the old category and the old slug are exactly what the old cache entries were stored under:"),
        code("typescript", `
"use server";
import { revalidatePath, updateTag } from "next/cache";
import { tags } from "@/lib/cache-tags";

export async function changeCategory(courseId: string, category: string) {
  const before = await db.course.findUniqueOrThrow({ where: { id: courseId } });
  if (before.category === category) return;                 // nothing changed: nothing to revalidate

  await db.course.update({ where: { id: courseId }, data: { category } });

  updateTag(tags.course(courseId));
  if (before.published) {
    updateTag(tags.catalog());                              // the card shows the category
    updateTag(tags.category(before.category));              // drop it from the old list
    updateTag(tags.category(category));                     // add it to the new list
    revalidatePath("/courses");                             // the untagged sidebar counts
  }
}`, "actions.ts (fixed)"),
        p("Writing this by hand in every action works for one event. With six event types it becomes easy to forget one case, which is how the incident happened. A better shape is one pure function that takes the catalog state and the event and returns the tags and paths, and thin actions that call it and then call `updateTag`, `revalidateTag` or `revalidatePath` for each result. A pure function can be tested with a table of events without a server, a database or Next.js."),
        p("That is the challenge. You get the read-side conventions, the course catalog before each event and six event types, including the instructor rename that touches only the cards of their **published** courses, and the form save that sends fields which did not really change."),
        challenge("chal_coding_nrc_312"),

        h2("5. How to verify"),
        bullets([
            "**A table-driven unit test of the mapping.** One row per event type, plus the boring rows: a draft course, an unchanged value, an unknown course. Assert the exact tag list, not \"contains\": an extra tag is a cost bug, a missing one is a correctness bug.",
            "**Miss counters on a preview.** Make one edit, then open every page that shows the course and one that does not. Each page that shows it should log one miss; the unrelated page should log none.",
            "**A query-count budget in monitoring.** After the fix, catalog queries per hour on the dashboard went back to roughly the numbers before the hotfix. Keep that panel: a future \"refresh everything\" shows up there first.",
            "**curl after the edit.** `curl -s https://app.codedev.test/courses?category=react | grep -c \"Testing React Apps\"` prints 0 once the old category has dropped the course.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Revalidating only the new value.** Category, slug or instructor moves need the old value too. Spot it: the action never reads the record before updating it.",
            "**Revalidating everything.** `revalidatePath(\"/\", \"layout\")` in a save handler. Spot it: query counts jump after an ordinary day of edits.",
            "**Tag strings typed by hand in two places.** `course-42` in the action and `course:42` in the reader never match, and nothing reports it (lesson 3.2). Spot it: grep for template literals that build tags outside one helper.",
            "**Treating every submitted field as a change.** Forms send the whole object. Compare with the stored value first, or an edit that changed nothing still refreshes lists. Spot it: misses after a save without changes.",
            "**Forgetting drafts are not listed.** Edits to an unpublished course do not need list tags. Spot it: list misses while instructors work on drafts.",
        ]),

        h2("7. Summary"),
        numbered([
            "Tag cached reads with names for the data they hold, and write down which tag shows which fields.",
            "For each event, revalidate exactly the tags whose data changed, including the old category, slug or list the item leaves; use paths when a URL appears or disappears or a read has no tag.",
            "In Next.js 16 use updateTag in Server Actions when the editor must see the change at once, revalidateTag(tag, \"max\") for background events, and test the event-to-tags mapping as a pure function.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js documentation: Caching and Revalidating - nextjs.org/docs/app/getting-started/caching-and-revalidating",
            "Next.js API reference: cacheTag, updateTag, revalidateTag and revalidatePath (next/cache)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every cached read in a Next.js project you work on with its tag and the fields it shows, then list every mutation with the tags it revalidates. Look for reads with no tag and mutations with no revalidation, and add a miss log to one cached function to watch what an edit really refreshes."),
    ],
});
