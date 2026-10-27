// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-3-2",
    title: "Spot the AI mistake: the course page that never updates",
    slug: { _type: "slug", current: "spot-the-ai-mistake-course-page-never-updates" },
    description:
        "An AI assistant was asked to \"cache the course page so it is fast\". It did, with a tag and a one-hour lifetime, and the instructor's edits stopped showing up: one action expired a tag that no entry carried, the other expired nothing. Learn why a cache without an invalidation plan is a stale-data bug waiting to happen, why a mistyped tag fails silently, how to find every writer of cached data, when to use updateTag instead of revalidateTag, and how to review AI-generated caching code with a write-then-read test.",
    estimatedTime: 20,

    scenario: {
        role: "Full-stack developer and code reviewer, CodeDev catalog team",
        problem:
            "At 09:00 an instructor lowered the price of \"Next.js Rendering & Caching\" from 249,000 VND to 199,000 VND for a one-week promotion. Until about 10:00, https://app.codedev.test/course/nextjs-rendering-caching still showed 249,000 VND, while checkout, which reads the price from the database, charged 199,000 VND. Support received tickets about \"a different price at checkout\", and the instructor reported that title changes also took up to an hour to appear. The only recent change to the course page was a caching pull request written with an AI coding assistant and approved because the page became fast and looked right.",
    },

    content: [
        h2("1. The incident: fast, and an hour behind"),
        p("The request to the assistant was one line: \"Cache the course page so it is fast.\" This is the diff it produced and the reviewer approved:"),
        code("typescript", `
// lib/catalog.ts
import { cacheLife, cacheTag } from "next/cache";

export async function getCourse(id: string) {
  "use cache";
  cacheTag(\`course:\${id}\`);
  cacheLife("hours");
  return db.course.findUnique({ where: { id }, include: { lessons: true } });
}

// app/instructor/courses/[id]/actions.ts  (unchanged lines folded)
"use server";
export async function saveCourseDetails(id: string, data: DetailsForm) {
  await db.course.update({ where: { id }, data });
  updateTag(\`course-\${id}\`);
}

export async function changeCoursePrice(id: string, price: number) {
  await db.course.update({ where: { id }, data: { price } });
}`, "the AI's pull request"),
        p("Everything in it looks reasonable on its own. The read is tagged, the lifetime is explicit, one action even expires a tag. In review the page loaded in 40 ms instead of 600 ms, and the reviewer approved. Nobody saved a course and then opened its page."),
        p("Two mistakes hide in plain sight. The details action expires `course-42`, but the data was stored under `course:42`. The price action expires nothing at all. Both actions write to the database successfully, and the page keeps serving the cached copy until `cacheLife(\"hours\")` lets it go, roughly an hour later."),

        h2("2. Reproduce it and read the evidence"),
        p("On a preview deployment, put a miss log inside `getCourse` (the body runs only on a cache miss), then save a price and open the page:"),
        code("text", `
09:00:05  POST /instructor/courses/42           changeCoursePrice 42 -> 199000   (200)
09:00:07  GET  /course/nextjs-rendering-caching  page shows 249000 VND   (no [cache miss] line)
09:00:31  POST /instructor/courses/42           saveCourseDetails 42 title=...   (200)
09:00:33  GET  /course/nextjs-rendering-caching  page shows the old title (no [cache miss] line)
09:58:40  GET  /course/nextjs-rendering-caching  [cache miss] getCourse 42   page still old once
09:58:52  GET  /course/nextjs-rendering-caching  page shows 199000 VND and the new title`, "preview server log"),
        p("No miss after either save: the cache never heard about them. The update arrives only when the one-hour lifetime runs out, and even then the first visitor gets the stale copy while the fresh one is built in the background. Now compare the tag strings across the codebase:"),
        code("bash", `
$ grep -rnE "(cacheTag|updateTag|revalidateTag)\\(" app lib
lib/catalog.ts:6:                            cacheTag(\`course:\${id}\`);
app/instructor/courses/[id]/actions.ts:6:    updateTag(\`course-\${id}\`);`, "terminal"),
        p("One reader, three writers of course data (the two actions and the admin import script, which this grep does not even find because it calls neither function), and one tag call whose string does not match. The checkout page was correct all along: it reads the price from the database. That is exactly why learners saw two different prices."),

        h2("3. Core idea: every cache needs an answer to \"when is this wrong?\""),
        p("\"Make it fast\" is half a requirement. A cache trades freshness for speed, and the other half of the requirement is how stale each piece of data may be and what makes it stale. For a course page the answer is clear: the course changes when an instructor saves, and a price must never be an hour old because checkout does not use the cache. The assistant was not told that, so it picked a plausible lifetime and moved on. That is the pattern to watch for in generated caching code: the read side is complete, the write side is missing or half-done."),
        h3("Why a wrong tag fails silently"),
        p("A cache tag is just a string. Nothing checks that the string passed to `updateTag` or `revalidateTag` was ever passed to `cacheTag`, and expiring a tag that no entry carries is not an error: it expires nothing and returns. `course:42` and `course-42` are as unrelated as `course:42` and `banana`. There is no warning in the build, no log line at runtime and no failing type check, unless you build one."),
        p("The cheapest protection is to spell every tag in exactly one place and give it a type, so a hand-typed variant stands out in review and a wrong shape fails to compile:"),
        code("typescript", `
// lib/cache-tags.ts
export type CourseTag = \`course:\${string}\`;
export const courseTag = (id: string): CourseTag => \`course:\${id}\`;

// reader                               // writers
cacheTag(courseTag(id));                updateTag(courseTag(id));`, "one helper for readers and writers"),
        h3("Which function after a save?"),
        bullets([
            "**`updateTag(tag)`** (Next.js 16, Server Actions only) expires the entries at once; the next request waits for fresh data. Use it when the person who saved will look at the result: the instructor dashboard.",
            "**`revalidateTag(tag, \"max\")`** marks the entries stale; the next request still gets the old content while a fresh copy is built (stale-while-revalidate). Use it for background events, such as a webhook from the billing system, where one more stale view is acceptable.",
            "**Neither**, if the value must never be stale where it is used. Checkout reads the price from the database on purpose, and that is the right design: the cache is for display, and money is decided on fresh data.",
        ]),
        callout("warning", "Check the API of your version",
            "updateTag and the two-argument revalidateTag(tag, profile) are Next.js 16 APIs; Next.js 15 had revalidateTag(tag) only. Fetch-based tagging, fetch(url, { next: { tags } }), and unstable_cache also exist. Read the caching guide for the version in your package.json before you copy a fix."),
        h3("When not to cache the page data at all"),
        p("If the data changes on almost every request, or the page is already fast enough, a cache adds an invalidation problem without a measurable benefit. Measure first: the course page took 600 ms because of a slow lessons query, and an index might have fixed it without any staleness at all. Caching is the right tool here because the data is read thousands of times per edit, but only together with a write-side plan."),

        challenge("chal_quiz_nrc_321"),

        h2("4. Reviewing AI-generated caching code"),
        p("An assistant can add a cache in seconds. It cannot know your write paths unless you tell it, and the result looks finished either way. You are the one who has to prove the data stays correct. For every cached read in a diff, answer these:"),
        numbered([
            "**What is the key, what are the tags, what is the lifetime?** Write them down. A cached read with no tag can only be refreshed by time or by path.",
            "**Who writes this data?** Grep for the table, not for the cache API: `grep -rn \"db.course.update\\|db.course.upsert\" app lib scripts`. Every hit needs a revalidation call, or a written reason why a stale copy is acceptable for that lifetime.",
            "**Do the tag strings match?** Every writer should call the same helper as the reader. A template literal that builds a tag outside the helper is a review comment.",
            "**Does the person who saved need to see the change?** Then `updateTag` in the Server Action, not `revalidateTag(tag, \"max\")`.",
            "**Where is the test that writes and then reads?** The incident survived review because nobody saved and then looked. Ask the assistant for that test in the same prompt, and run it.",
        ]),
        p("A better prompt would have carried the missing half: \"Cache getCourse for the course page. Instructors edit courses in saveCourseDetails and changeCoursePrice; after a save the instructor must see the change on the next request. Use one tag helper for readers and writers, and add a test that saves and then reads.\""),
        p("Now review the assistant's code yourself. The starter contains a model of the Next.js data cache on a fake clock: `cached(...)` with tags and a lifetime, `updateTag` that expires at once and `revalidateTag(tag, \"max\")` that marks entries stale. The runner reads the course page, saves titles and prices and moves the clock. The public tests pass on the assistant's code, exactly as the review did: reads are cached. The hidden tests save and then read."),
        challenge("chal_coding_nrc_322"),

        h2("5. How to verify the fix"),
        bullets([
            "**A write-then-read test for every writer.** Read (MISS), read (HIT), save, read: the next read must be a MISS with the new value, and a read of another course must still be a HIT. A fix that clears the whole cache passes the first half and fails the second.",
            "**Miss logs on a preview.** Save a price and reload once: exactly one `[cache miss] getCourse 42`, and the page shows the new price on that first reload.",
            "**A price consistency check.** Compare the price on the course page with the price returned by the checkout endpoint for the same course after an edit. They must match on the first reload.",
            "**A grep in CI.** Fail the build when `cacheTag(`, `updateTag(` or `revalidateTag(` is called with a template literal outside `lib/cache-tags.ts`.",
        ]),
        code("typescript", `
// catalog.test.ts - Vitest, against a test database
test("a saved price is visible on the next read of the course page", async () => {
  await getCourse("42");                                  // fill the cache
  await changeCoursePrice("42", 199000);
  const course = await getCourse("42");
  expect(course?.price).toBe(199000);
});`, "the test the pull request did not have"),
        p("Running this test needs a test setup where the cache and the server action behave as in production, which in a Next.js app usually means an end-to-end test against `next build && next start` (Playwright is common). The challenge model lets you check the same logic in milliseconds."),

        h2("6. Common mistakes"),
        bullets([
            "**Tags typed by hand in two places.** `course:${id}` in the reader, `course-${id}` in the writer. Spot it: grep every tag call and compare the strings, or use one helper.",
            "**A writer with no revalidation at all.** Usually the second or third write path: a price action, an admin import, a cron job. Spot it: grep for the database update, not for the cache API.",
            "**revalidateTag where the editor needs read-your-own-writes.** The editor reloads and sees the old value once. Spot it: the page is right on the second reload but not the first.",
            "**Fixing it by clearing everything.** `revalidatePath(\"/\", \"layout\")` or a cache with no lifetime at all. Spot it: unrelated pages miss after every save, and database load rises.",
            "**Approving a cache without a staleness requirement.** Spot it: the prompt or the pull request says \"fast\" but not \"how stale may this be, and what changes it\".",
        ]),

        h2("7. Summary"),
        numbered([
            "A cache is only half a design until every writer of the cached data revalidates it; \"make it fast\" without a freshness requirement produces a page that is fast and wrong.",
            "Tags are unchecked strings: a mismatch expires nothing, silently. Build tags with one typed helper shared by readers and writers.",
            "Use updateTag in Server Actions when the editor must see the change at once, revalidateTag(tag, \"max\") for background events, and prove both with a write-then-read test that also checks unrelated data stays cached.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js documentation: Caching and Revalidating - nextjs.org/docs/app/getting-started/caching-and-revalidating",
            "Next.js API reference: cacheTag, cacheLife, updateTag and revalidateTag (next/cache)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one cached read in a project you work on. Grep for every place that writes the same table, check that each one revalidates the same tag string, and write the save-then-read test. Then ask an AI assistant to add caching to another read, give it the write paths and the freshness requirement in the prompt, and compare its answer with the one you get from \"make it fast\"."),
    ],
});
