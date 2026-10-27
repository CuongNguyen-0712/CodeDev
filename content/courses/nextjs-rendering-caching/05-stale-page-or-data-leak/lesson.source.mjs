// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-2-2",
    title: "Stale page or data leak? A dashboard that showed someone else's progress",
    slug: { _type: "slug", current: "stale-page-or-data-leak-dashboard" },
    description:
        "The morning after a release that cached the dashboard, learners report seeing another learner's name, lessons and streak, and it fixes itself after a minute. Work through the incident like the on-call engineer: read the support tickets, the response headers, the cached data function and the timeline, form a hypothesis, rule out a session mix-up in auth and a stale page, fix both caching layers without losing the public course cache, and prove it with a test that plays two learners through a CDN.",
    estimatedTime: 30,

    scenario: {
        role: "Full-stack developer on call, CodeDev learning platform",
        problem:
            "Tuesday 09:12. Support forwards ticket #5120 from the learner Lan: \"My dashboard says Welcome back, Minh, with 41 lessons done and a 19-day streak. I have done 3 lessons.\" Two more tickets follow within the hour. Monday's release cached the dashboard query on the server and added a Cache-Control header to the /api/dashboard route so the CDN could absorb the 09:00 traffic peak. Someone in the incident channel says it is probably the instructor's course edit at 08:55 showing a stale page; someone else suspects the new session library.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. It looks like a cache bug, and it is one, but it is also a **personal data incident**: names and learning progress were shown to the wrong people. That changes the order of work. First stop the exposure, then find the cause with evidence, then fix it in a way you can prove, and finally record who was affected."),
        p("Monday's release contained two small pull requests that each looked reasonable in review:"),
        code("text", `
PR #611  dashboard: cache the expensive progress query          (lib/dashboard.ts, +3 -1)
PR #612  api: let the CDN absorb dashboard traffic at 09:00     (app/api/dashboard/route.ts, +1 -1)
Deploy   2026.10.26-2, Monday 17:40`, "release notes"),
        p("Before you read the code, resist the urge to fix it. The question in the title is the real question: is this a **stale** page (the right learner's data, but old) or a **leak** (another learner's data)? They have different causes and different fixes, and the evidence decides."),

        h2("2. The evidence pack"),
        p("Four pieces of evidence were collected in the first twenty minutes. The quiz below refers to them by letter."),
        h3("A. Support tickets"),
        code("text", `
#5120  Tue 09:12  Lan (u_2041)
  "My dashboard says Welcome back, Minh, with 41 lessons done and a 19-day streak.
   I have done 3 lessons. The name in the top bar is still mine. After about a minute
   it went back to normal."
#5124  Tue 09:20  Thu (u_3307)
  "For a moment my dashboard showed someone else's streak, then it was mine again."
#5131  Tue 09:36  An (u_1876)
  "Dashboard shows Minh's progress, not mine."`, "support queue"),
        h3("B. Response headers, two learners, one minute apart"),
        code("text", `
$ curl -sI https://app.codedev.test/api/dashboard -H "cookie: session=<Lan's session>"
HTTP/2 200
content-type: application/json
cache-control: public, s-maxage=60
age: 37
x-cache: HIT
etag: "d-41-19-8f2a"

$ curl -sI https://app.codedev.test/api/dashboard -H "cookie: session=<Thu's session>"
HTTP/2 200
content-type: application/json
cache-control: public, s-maxage=60
age: 38
x-cache: HIT
etag: "d-41-19-8f2a"

$ curl -s https://app.codedev.test/api/me -H "cookie: session=<Lan's session>" -D -
cache-control: private, no-store
x-cache: MISS
{"id":"u_2041","name":"Lan"}`, "Tue 09:15, from the on-call laptop"),
        h3("C. The data function and the route handler"),
        code("typescript", `
// lib/dashboard.ts (PR #611)
import { cached } from "@/lib/cache";            // the team's wrapper: cached(key, ttlSeconds, load)

export async function getDashboard() {
  const session = await getSession();             // reads the session cookie
  return cached("dashboard", 60, () => db.dashboardFor(session.userId));
}

// app/api/dashboard/route.ts (PR #612)
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "sign in" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  return Response.json(await getDashboard(), {
    headers: { "Cache-Control": "public, s-maxage=60" },
  });
}`, "release 2026.10.26-2"),
        h3("D. Timeline"),
        code("text", `
Mon 17:40  deploy 2026.10.26-2 (PR #611, PR #612)
Mon 17:41  origin requests to /api/dashboard drop from ~1,900/min to ~30/min
Tue 08:55  instructor publishes an edit to "SQL Basics" (typo in a lesson title)
Tue 09:12  ticket #5120
Tue 09:20  ticket #5124
Tue 09:34  on-call purges /api/dashboard at the CDN and adds a CDN rule: BYPASS /api/dashboard
Tue 09:36  ticket #5131
Tue 09:40  auth log, 09:30-09:40: every /api/dashboard request authenticated as the user of its
           own session cookie; 0 session errors, 0 token refresh failures`, "incident timeline"),

        h2("3. Reading the evidence"),
        p("Read each piece for what it **shows**, not for what you expect. One line per piece:"),
        bullets([
            "**A** says the wrong data belongs to **another learner** (Minh's name, lessons and streak), lasts about a minute, then corrects itself. Lan's own name in the top bar is right.",
            "**B** shows two different sessions receiving the **same** stored response: the same etag, an `age` of 37 and 38 seconds, and `x-cache: HIT`. The header that allowed it is `public, s-maxage=60`. Meanwhile `/api/me` with Lan's cookie returns Lan, from the origin (`private, no-store`, `x-cache: MISS`).",
            "**C** stores the result of `db.dashboardFor(session.userId)` under the key `\"dashboard\"`. The user id is an input of the result, but it is read inside the closure and is not in the key: the first learner whose request fills the entry is served to every learner for 60 seconds.",
            "**D** puts the start of the problem at Monday's deploy (the origin traffic drop is the CDN serving almost everything), well before the 08:55 course edit. Ticket #5131 arrives **after** the CDN bypass at 09:34. Auth logs show no session problem.",
        ]),
        p("Notice what the 60 seconds in A have in common: `s-maxage=60` in the header and `60` in `cached(...)`. Both layers forget their entry after a minute, which is why the bug \"fixes itself\" and why it is so easy to dismiss."),

        h2("4. Hypothesis: two caches, and neither knows about the user"),
        p("Put the facts in order. Two caches sit between Lan and the database, and each one builds its own key:"),
        numbered([
            "Minh opens the dashboard first after the entry expired. The CDN has nothing for `/api/dashboard`, so it forwards the request (MISS).",
            "The route handler calls `getDashboard()`. The data cache has nothing under `\"dashboard\"`, so it loads Minh's dashboard and stores it under `\"dashboard\"` for 60 s.",
            "The response goes out with `public, s-maxage=60`. The CDN keys it by the URL, `/api/dashboard`, which is the same for every learner, and stores it for 60 s.",
            "Lan opens the dashboard. Same URL, so the CDN answers with Minh's stored response (HIT, B) without asking the server.",
            "After the CDN is bypassed (D, 09:34), An's request reaches the server, but the data cache answers with whatever is stored under `\"dashboard\"`: still another learner's data (#5131).",
        ]),
        p("A good hypothesis explains **all** the evidence: another learner's data (A), the shared etag and HIT (B), the key without a user (C), the start at Monday's deploy, the one-minute self-healing and the leak continuing after the bypass (D). This one does, and it predicts something you can check: purging the CDN alone will not stop the leak."),
        h3("Rule out the tempting wrong ones"),
        p("Two other explanations come up in the incident channel. Check them against the evidence before anyone acts on them:"),
        bullets([
            "**\"A session mix-up in auth: Lan was logged in as Minh.\"** Then `/api/me` would return Minh too, and the top bar would say Minh. B shows `/api/me` returning Lan from the origin, and D shows every request authenticated as its own cookie's user. The session is right; the data served for it is wrong. Rolling back the session library would change nothing.",
            "**\"A stale page after the 08:55 course edit.\"** Stale means the **right** learner's data, but **old**: yesterday's lesson count, the old course title. A shows **another** learner's data. D shows the problem began on Monday at 17:40, not at 08:55. And calling `revalidatePath(\"/dashboard\")` after every progress update would only empty the shared entry so the next learner can fill it again: it would make the leak rotate faster.",
            "**\"The CDN is broken: it should keep one copy per cookie.\"** The CDN did what the header told it. `public` explicitly permits shared caches to store the response, and the URL is the key. A cookie is only part of a shared cache's key when the response names it in `Vary`, and many CDNs treat `Vary: Cookie` as \"do not cache\" or ignore it.",
        ]),
        callout("warning", "Stale versus leak, in one question",
            "Ask: whose data is it? If it is the right user's data from earlier, you have a freshness problem (TTL, revalidation: lessons 2.3 and 3.1). If it belongs to someone else, you have a key problem and a personal data incident, whatever the TTL is. Never answer a leak with a shorter TTL: one second of someone else's dashboard is still a leak."),

        h2("5. Choose the fix"),
        p("First, stop the exposure. The on-call engineer did the right first step at 09:34 (purge and bypass at the CDN), and D proves it was not enough. Reverting the release removes both layers at once and is the right emergency move while the real fix is prepared: revert, then fix forward with a test. After the fixed deploy, purge `/api/dashboard` at the CDN once more, because entries stored under the old header live until they expire."),
        p("Then write the requirements down before writing code. A fix must:"),
        bullets([
            "Give every learner only their own dashboard, whether the CDN is in front or bypassed.",
            "Never let a shared cache store a dashboard response (and keep the 401 for anonymous visitors uncached).",
            "Keep the server cache of the dashboard query, one entry per learner for 60 seconds: the query is expensive, which is why PR #611 exists.",
            "Keep the course list public and cached by the CDN: it is the same for everyone and is most of the traffic.",
        ]),
        p("Now test candidate fixes against the list, not just against \"the tickets stop\":"),
        bullets([
            "**Change only the header to `private`.** The CDN stops sharing, but the data cache still serves one entry to everyone. It fails the first requirement: this is exactly ticket #5131.",
            "**Put the user in the key, keep `public, s-maxage=60`.** The server is fixed, the CDN still shares by URL. It fails the first two requirements.",
            "**Remove all caching from the dashboard.** No leak, but every request runs the expensive query again: it fails the third requirement and undoes the reason for PR #611.",
            "**Mark every API response private \"to be safe\".** It fails the fourth requirement: the course list loses its CDN cache and the origin takes the whole catalog traffic.",
            "**Add `Vary: Cookie` and keep `public`.** It depends on the CDN: some ignore it (leak continues), some stop caching (fine, by accident). A fix whose safety depends on vendor behaviour is not a fix for personal data.",
        ]),
        p("The fix that meets all four requirements follows lesson 2.1: the user is an input of per-user data, so it goes **into the data cache key**, and the response is per-user, so the header says **`private`** and no shared cache keeps it. Public course data keeps its public key and header. With Next.js's own cache APIs the same rule applies: read the session outside the cached function and pass the user id in as an argument (with `\"use cache\"` you cannot read cookies inside the cached scope; with `unstable_cache` a captured variable is not part of the key). Check the docs for your version. You will make the change in the challenge."),
        callout("info", "It is a personal data incident too",
            "Names and learning progress are personal data. Keep the evidence (CDN logs with timestamps, the affected window from Monday 17:40 to the fixed deploy), work out which learners' data could have been shown, and follow the platform's incident process for informing the people responsible for data protection. The fix ends the exposure; it does not end the incident."),

        challenge("chal_quiz_nrc_221"),

        h2("6. The challenge: two caches and a fake clock in one file"),
        p("The code runner has no Next.js and no CDN, so the challenge file brings small models that follow the same rules as the incident:"),
        bullets([
            "**A fake clock** in seconds. Each request in a test has a time `at`.",
            "**The server data cache** `cached(key, ttlSeconds, load)`: it returns the value stored under the key while it is younger than the TTL, otherwise it calls `load()` and stores the result.",
            "**The database** counts its queries, so a test can see whether the dashboard query is still cached.",
            "**A CDN** in front of the route handlers. Like most CDNs by default, it keys entries by path and query only; the session cookie is not part of the key. It stores a 200 response for `s-maxage` seconds unless Cache-Control contains `private` or `no-store`. A test can bypass it, like the CDN rule at 09:34.",
            "**The test runner** plays a list of requests from different learners and anonymous visitors, and prints for each one the status, the body, whether the CDN served it (HIT, MISS or BYPASS) and the Cache-Control header, then the number of database queries.",
        ]),
        p("Run the starter first and read its output: you will see Minh's dashboard served to Lan, with `cdn HIT`, exactly as in evidence B. Then make the change and run it again."),
        challenge("chal_coding_nrc_222"),

        h2("7. How to verify the fix"),
        p("\"The tickets stopped\" is not verification: the bug heals itself every minute. Verify each requirement with something that compares learners:"),
        bullets([
            "**A two-learner test through a CDN model.** Request the dashboard as Lan, then as Minh a few seconds later, with the CDN in front and with it bypassed; assert each body belongs to its own learner. On the release code it fails in both modes, and each half-fix (header only, key only) fails in one of them.",
            "**A cost check in the same test.** Request Lan's dashboard twice within 60 s and assert one database query: the fix kept the server cache. Request the course list as three visitors and assert one query and CDN hits: public data is still shared.",
            "**Headers in production.** `curl -sI` the dashboard with two different session cookies: `cache-control` contains `private`, `x-cache` is never HIT, and the etags differ when the progress differs. `curl -sI` the course list: still `public` with `s-maxage`, and HIT on the second request.",
            "**CDN logs after the deploy and the purge.** Zero HITs for `/api/dashboard`. The origin rate for the dashboard goes back up (from ~30/min to ~1,900/min) and the server data cache, not the CDN, absorbs the query cost.",
        ]),
        code("typescript", `
// app/api/dashboard/route.test.ts (Vitest)
vi.mock("@/lib/session");

test("two learners never share a dashboard, and no shared cache may store it", async () => {
  vi.mocked(getSession).mockResolvedValueOnce({ userId: "u_2041" }).mockResolvedValueOnce({ userId: "u_7781" });

  const lan = await GET();
  const minh = await GET();

  expect((await lan.json()).name).toBe("Lan");
  expect((await minh.json()).name).toBe("Minh");                 // fails on PR #611: same entry
  expect(lan.headers.get("Cache-Control")).toMatch(/\\bprivate\\b/); // fails on PR #612: public
  expect(lan.headers.get("Cache-Control")).not.toMatch(/s-maxage/);
});`, "route.test.ts"),
        p("Finally, close the gap that let it ship: a test like this one for every route that returns personal data, and a review checklist item for any pull request that adds `cached(`, `\"use cache\"`, `unstable_cache` or a Cache-Control header: whose data is this, and is the user in the key?"),

        h2("8. Common mistakes in a stale-or-leak incident"),
        bullets([
            "**Calling it stale because it fixes itself.** Self-healing only tells you there is a TTL. Spot it: ask whose data was shown; another user's data is a leak, whatever the timing.",
            "**Fixing one layer and declaring victory.** The CDN purge at 09:34 looked like a fix until #5131. Spot it: list every cache between the user and the database (browser, CDN, server data cache) and check each one's key.",
            "**Blaming auth because it is user-related.** Spot it: compare an endpoint that is never cached (`/api/me`) with the cached one, using the same cookie. If `/api/me` is right, the session is right.",
            "**Answering a leak with a shorter TTL or revalidation.** `s-maxage=5` leaks for five seconds instead of sixty. Spot it: a proposed fix that changes a number instead of a key or a `private`.",
            "**Over-fixing by disabling every cache.** Spot it: the database or origin load chart after the deploy; public data should still be shared.",
        ]),

        h2("9. Summary"),
        numbered([
            "Stale is the right user's old data; a leak is another user's data. Decide which one it is from the evidence before choosing a fix: a leak is a key problem and a personal data incident, never a TTL problem.",
            "Every cache on the path builds its own key: the server data cache from the key you write, a CDN from the URL and Vary. Per-user data needs the user in the server key and `private` on the response, while public data keeps its shared cache.",
            "Verify with a test that plays two learners through each cache layer, with the CDN in front and bypassed, plus the real headers with curl and the CDN logs after a purge.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js documentation: Caching and Revalidating - nextjs.org/docs/app/getting-started/caching-and-revalidating (check the version selector)",
            "Next.js documentation: Route Handlers - setting headers on a Response",
            "RFC 9111, HTTP Caching: section 3.5 (storing responses to authenticated requests) and the public and private directives",
        ]),
        callout("tip", "Self-practice (not graded): draw the cache diagram",
            "Draw the path of GET /api/dashboard from the browser to the database: the browser cache, the CDN, the Next.js route handler, the server data cache, the database. On each cache write the key it uses, the header or TTL that controls it, and what it stored for Minh at 09:11. Draw it twice, before and after the fix, and mark where Lan's request was answered in each. Then add the course list request to the same diagram and check that it is still cached where it should be."),
    ],
});
