// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-2-3",
    title: "TTL & stale-while-revalidate",
    slug: { _type: "slug", current: "ttl-stale-while-revalidate" },
    description:
        "The weekly leaderboard is cached for 60 seconds, and every minute one unlucky learner waits two seconds while forty others pile the same query onto the database. Raising the TTL made the leaderboard ten minutes old; a quick stale-while-revalidate patch fixed the waiting but still sent forty queries. Learn the three ages of a cached value (fresh, stale, expired), choose maxAge and the stale window from what users can tolerate, start exactly one revalidation per key, keep serving stale data when the origin fails, and know when stale is not acceptable at all.",
    estimatedTime: 25,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "The weekly leaderboard at https://app.codedev.test/leaderboard is cached on the server for 60 seconds, because its query sums a week of EXP and takes about 2 seconds. The latency chart of GET /api/leaderboard shows p50 at 35 ms and p99 at 2.3 s, with a spike every minute; at the 09:00 peak the database shows 40 identical leaderboard queries running at once. A first fix raised the TTL to 600 seconds and brought tickets the next day: \"I finished three lessons and my EXP on the leaderboard did not move for ten minutes.\"",
    },

    content: [
        h2("1. The incident: one cliff every 60 seconds"),
        p("The leaderboard data function used the same small cache wrapper as the rest of the app:"),
        code("typescript", `
// lib/leaderboard.ts
export async function getWeeklyLeaderboard() {
  return cached("leaderboard:weekly", 60, () => db.weeklyLeaderboard());   // ~2 s query
}`, "before"),
        p("A plain TTL has a cliff. For 60 seconds every request is a fast hit. At second 60 the value is gone, and the next request waits for the full 2-second query. At the 09:00 peak, about 20 requests arrive per second, so in the 2 seconds that query takes, 40 more requests find the cache empty and start the same query. The database runs 40 copies of its most expensive query, and 40 learners wait."),
        code("text", `
09:00:59.981  cache HIT   leaderboard:weekly  age=59.98s
09:01:00.004  cache MISS  leaderboard:weekly  -> db query started (1)
09:01:00.051  cache MISS  leaderboard:weekly  -> db query started (2)
...
09:01:01.962  cache MISS  leaderboard:weekly  -> db query started (40)
09:01:02.137  db query (1) done in 2133 ms
09:01:04.402  db query (40) done in 2440 ms   (slower: 40 copies share the CPU)`, "server log at the 09:00 peak"),
        p("Raising the TTL to 600 s made the cliff ten times rarer and the leaderboard ten minutes old. Learners noticed within a day: the leaderboard is the page they open right after finishing a lesson."),
        p("A second patch tried stale-while-revalidate: if the value is older than 60 s, return it anyway and refresh it in the background. The waiting stopped. The database chart did not change:"),
        code("text", `
09:01:00.004  cache STALE leaderboard:weekly  age=60.00s -> background refresh started
09:01:00.051  cache STALE leaderboard:weekly  age=60.05s -> background refresh started
...
09:01:01.962  cache STALE leaderboard:weekly  age=61.96s -> background refresh started   (40 in total)`, "server log after the second patch"),
        p("Every stale request started its own refresh, because nothing remembered that one was already running. Stale-while-revalidate removes the **waiting**; it does not remove the **load** unless the refresh is started once per key."),

        h2("2. The core idea: three ages of a cached value"),
        p("A cached value is not just \"there\" or \"gone\". It moves through three states as it ages, and each state answers a request differently:"),
        code("text", `
age of the value     state     answer the request with      and also
0 .. maxAge          fresh     the stored value (HIT)        nothing
maxAge .. +window    stale     the stored value (STALE)      start one background revalidation for the key
beyond               expired   wait for a fetch (MISS)       share that fetch with everyone else who waits`, "fresh, stale, expired"),
        p("**maxAge** is how old a value may be before anyone should care: the freshness promise. **staleWhileRevalidate** is the window after that in which an answer that is a bit old is better than making a user wait. After the window the value is too old to show, and the request waits for fresh data. The age counts from when the value was **fetched** (when the fetch completed), not from when someone asked for it."),
        p("Two rules make the stale state safe for the origin, and they are the part people forget:"),
        bullets([
            "**One fetch per key at a time.** Requests that need a fresh value while a fetch for that key is running share it: stale requests do not start another, and waiting requests join it instead of starting their own. This is called request coalescing or single flight, and it is what turns 40 queries into one.",
            "**A failed revalidation keeps the old value.** If the refresh fails, the stale value stays and keeps being served until the window ends (\"stale-if-error\"); the next stale request tries again. Only when the window is over does a failure reach the user. A background refresh that throws must be caught: nobody is awaiting it.",
        ]),
        h3("Choosing the numbers"),
        p("The numbers are product decisions written in seconds. Ask three questions per resource, and write the answers next to the cache call:"),
        numbered([
            "**How old may it be before someone notices or is harmed?** That is maxAge. For the weekly leaderboard, a minute.",
            "**How long would we rather show slightly old data than a spinner?** That is the stale window. For the leaderboard, five minutes: a ranking from three minutes ago beats a 2-second wait.",
            "**During an outage, how long would we rather show old data than an error?** That is stale-if-error. In the challenge it ends with the stale window; real caches let you set it separately (an hour for the leaderboard would be reasonable).",
        ]),
        h3("When stale is not acceptable"),
        p("Stale-while-revalidate is a promise that old data is harmless for a while. Do not make that promise when it is false:"),
        bullets([
            "**Right after the user's own write.** \"I finished a lesson and my EXP did not move\" is a read-your-own-writes problem. No TTL fixes it well; revalidate the affected data when the write happens (lesson 3.1), or show the user's own numbers from their personal data (lesson 3.3).",
            "**Decisions that must be current**: a price at checkout, whether a course is still free, whether a user still has access. Read those fresh, at the moment of the decision.",
            "**Per-user data in a shared cache.** A stale window does nothing for a key that mixes users; lesson 2.2 is a key problem, not a freshness problem.",
            "**Cheap queries.** If the origin answers in 10 ms, a cache with three states is complexity you do not need.",
        ]),
        h3("The same idea in HTTP and in Next.js"),
        p("The CDN can do the same thing for public responses, with RFC 5861's extensions to Cache-Control:"),
        code("typescript", `
// app/api/leaderboard/route.ts - public data, the same for every learner
return Response.json(leaderboard, {
  headers: {
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600",
  },
});`, "route.ts"),
        p("For the CDN, `s-maxage=60` is maxAge, `stale-while-revalidate=300` is the window, and `stale-if-error=3600` lets it serve an old copy for an hour when the origin answers with an error. Support for these two extensions differs between CDNs, and so does whether they coalesce the background requests: check your vendor's documentation and test it with `curl` (watch `age` and the hit header around second 60)."),
        p("Next.js has the same model built in for rendered pages and cached data, under different names per version. In the App Router, a route segment with `export const revalidate = 60` is regenerated in the background: the first request after 60 seconds still gets the cached version and triggers the regeneration. With Cache Components (Next.js 16), `cacheLife` profiles describe the same three ages with `stale`, `revalidate` and `expire`. The names, defaults and exact behaviour change between versions: check the Next.js caching docs for yours before you rely on a detail."),

        challenge("chal_quiz_nrc_231"),

        h2("3. Worked example: the leaderboard on a timeline"),
        p("Before writing any cache, write the expected behaviour as a timeline. It is the specification and, almost line for line, the test. With maxAge 60, a stale window of 120, and a leaderboard query that takes 2 s (and fails once):"),
        code("text", `
t (s)   request              state of the stored value           answer                 fetches started
0       leaderboard          none                                waits, gets v1 at t=2  1
30      leaderboard          v1, age 28                          HIT v1                 0
70      leaderboard          v1, age 68                          STALE v1 at once       1  (fails at t=72)
71      leaderboard x 40     v1, age 69, refresh running         STALE v1 at once       0
75      leaderboard          v1, age 73, nothing running         STALE v1 at once       1  (v2 at t=77)
80      leaderboard          v2, age 3                           HIT v2                 0
260     leaderboard          v2, age 183 (past 60 + 120)         waits, gets v3         1`, "expected behaviour"),
        p("Read the row at t=71: forty requests, forty instant answers, zero new queries. The row at t=75 is stale-if-error at work: the refresh at t=70 failed, the old value is still served, and the next stale request tries again. The last row is the end of the window: v2 is too old to show, so the request waits."),
        p("Each row becomes an assertion when the cache takes its clock and its fetcher as parameters, so a test can move time and script the origin instead of sleeping:"),
        code("typescript", `
test("forty stale requests start one revalidation", async () => {
  const clock = fakeClock(0);
  const origin = scriptedOrigin({ leaderboard: [{ value: "v1", takes: 2 }, { value: "v2", takes: 2 }] });
  const cache = new SwrCache(60, 120, clock, origin);

  await clock.run(cache.get("leaderboard"));          // MISS, v1 at t=2
  clock.set(100);
  const answers = await Promise.all(Array.from({ length: 40 }, () => cache.get("leaderboard")));

  expect(answers.every((a) => a.status === "STALE" && a.value === "v1")).toBe(true);
  expect(origin.fetches("leaderboard")).toBe(2);       // the first MISS + one revalidation
});`, "swrCache.test.ts"),

        h2("4. How to verify"),
        bullets([
            "**Unit tests on a fake clock**, one per row of the timeline, with the boundaries: age exactly maxAge (stale, not fresh), age exactly maxAge + window (expired), a fetch that completes at the same second a request arrives, concurrent misses, a failed refresh followed by another stale request.",
            "**Count origin calls, not just answers.** The second patch in the incident returned the right values and still sent 40 queries. Every test should assert how many fetches were started.",
            "**In production, read the cache log and the database.** After the deploy, the log should show STALE answers with one \"refresh started\" per key per minute, the p99 of `/api/leaderboard` should fall to the p50, and the database should show one leaderboard query per minute at the peak.",
            "**For the CDN, curl around the boundary.** Request the route at age 59, 61 and 61.5: the age header keeps growing past 60 while the response stays fast, then resets once the background refresh has landed.",
        ]),

        h2("5. Common mistakes"),
        bullets([
            "**Fixing a stampede with a longer TTL.** It moves the cliff further away and makes the data older. Spot it: a TTL change in a pull request whose title mentions latency or load.",
            "**Stale-while-revalidate without single flight.** Users stop waiting, the origin still gets one query per request. Spot it: count origin calls in a test with concurrent stale requests, or look for N identical \"refresh started\" lines in the log.",
            "**Dating the value from the start of the fetch.** With a 2-second query, the value is born 2 seconds \"old\" and expires early. Spot it: a test where a fetch takes a while and a request arrives just before maxAge after its completion.",
            "**Dropping the old value when a refresh fails.** The next request becomes a MISS that waits for a failing origin, which is exactly when you wanted the stale value. Spot it: a test with a failing origin during the stale window; also an unhandled rejection in the logs from a refresh nobody awaited.",
            "**Serving stale data where stale is wrong.** Access checks, prices at checkout, the user's own just-written progress. Spot it: for each cached resource, ask \"what happens if this is 5 minutes old?\" and write the answer next to the cache call.",
        ]),

        h2("6. Practice: build the cache"),
        p("The challenge gives you a fake clock in seconds and a scripted origin: the n-th fetch of a key gets the n-th scripted answer (a value or an error) after a given number of seconds. You write `SwrCache` with a maxAge and a stale window. For each request the runner prints the status (HIT, STALE or MISS), the value or error that was served, how many fetches that request started and when it was answered, and at the end how many fetches each key needed."),
        challenge("chal_coding_nrc_232"),

        h2("7. Summary"),
        numbered([
            "A cached value is fresh, stale or expired by its age since it was fetched: fresh answers at once, stale answers at once and revalidates in the background, expired waits.",
            "Stale-while-revalidate removes waiting; single flight (one fetch per key, shared by everyone who needs it) removes the load, and keeping the old value when a refresh fails gives you stale-if-error.",
            "maxAge and the stale window are product decisions; do not serve stale data after a user's own write or for decisions that must be current, and verify with fake-clock tests that count origin calls.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 5861, HTTP Cache-Control Extensions for Stale Content: stale-while-revalidate and stale-if-error",
            "Next.js documentation: Caching and Revalidating - nextjs.org/docs/app/getting-started/caching-and-revalidating (time-based revalidation and cacheLife; check the version selector)",
            "MDN: Cache-Control - developer.mozilla.org/docs/Web/HTTP/Headers/Cache-Control",
        ]),
        callout("tip", "Self-practice (not graded): write the freshness table",
            "For five cached resources of an app you know, write maxAge, the stale window and stale-if-error in seconds, and next to each number the user-facing reason (\"a ranking a minute old is fine\", \"a price must be current at checkout: not cached\"). Mark the resources that a user's own write changes, and note how each of those gets fresh after the write."),
    ],
});
