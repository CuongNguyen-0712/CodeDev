// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-3-3",
    title: "Split public cached data from personal data",
    slug: { _type: "slug", current: "split-public-cached-data-from-personal-data" },
    description:
        "A course page response that mixed course data with the learner's progress and coupon price was marked public for five minutes, and the CDN served one learner's page to everyone. The hotfix turned caching off and multiplied database load. Learn to sort every field into public and personal, cache only the public part (shared, tagged, with a lifetime), load the personal part per request and compose them, in Next.js 16 with a cached function plus a dynamic component and over HTTP with the right Cache-Control, and prove that no learner's data reaches another.",
    estimatedTime: 20,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "A release added a learner panel to the course page: \"Enrolled, 35% complete\" for enrolled learners and the price after the learner's coupon for everyone else. Within an hour, support had tickets from learners who saw \"Enrolled, 35% complete\" on a course they never bought, and others who saw \"199200 VND with coupon SPRING20\" without having that coupon. The mobile app and the web page both read GET https://api.codedev.test/course-page/42, which returned the course and the learner's data in one JSON response with Cache-Control: public, s-maxage=300. The hotfix changed it to no-store, the leak stopped, and the course query became the busiest query in the database.",
    },

    content: [
        h2("1. The incident: one response, two kinds of data"),
        p("The endpoint that the new panel used was written to save the client a round trip. It loads everything the page needs and returns it in one object:"),
        code("typescript", `
// app/api/course-page/[id]/route.ts - as shipped
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser(req);                       // from the session cookie
  const course = await db.course.findUnique({ where: { id } });
  const enrollment = user ? await getEnrollment(user.id, id) : null;
  const coupon = user ? await getCoupon(user.id) : null;

  return Response.json(
    { course, enrollment, price: priceAfterCoupon(course!.price, coupon, id) },
    { headers: { "Cache-Control": "public, s-maxage=300" } },   // "the course page is hot, cache it at the CDN"
  );
}`, "route.ts (as shipped)"),
        p("`public, s-maxage=300` tells every shared cache between the server and the learner, the CDN in particular, that it may store this response and serve it to **anyone** who asks for the same URL in the next 300 seconds. The URL is `/course-page/42` for every learner. The first learner after each expiry decided what everyone saw for five minutes."),

        h2("2. Reproduce it and read the evidence"),
        p("Two sessions, the same URL, a few seconds apart. `curl -i` prints the headers, and `Age` (a standard header) tells you the response came out of a cache and how old it is:"),
        code("bash", `
$ curl -si https://api.codedev.test/course-page/42 -H "Cookie: session=LAN_SESSION" | grep -iE "^(cache-control|age|x-cache)|progress"
cache-control: public, s-maxage=300
x-cache: MISS
{"course":{"id":"42","title":"Next.js Rendering & Caching",...},"enrollment":{"progress":35},"price":249000}

$ curl -si https://api.codedev.test/course-page/42 -H "Cookie: session=BINH_SESSION" | grep -iE "^(cache-control|age|x-cache)|progress"
cache-control: public, s-maxage=300
age: 7
x-cache: HIT
{"course":{"id":"42","title":"Next.js Rendering & Caching",...},"enrollment":{"progress":35},"price":249000}`, "terminal"),
        p("Binh's request never reached the server: `x-cache: HIT` (a CDN-specific header, the name varies by provider) and `age: 7` say the CDN answered from the copy it stored for Lan seven seconds earlier. Nothing in the response told the CDN that the answer depends on the cookie. A shared cache keys a response by its URL and by the request headers listed in `Vary`; here `Vary` was not even set."),
        p("The hotfix, `Cache-Control: no-store`, is correct for privacy and expensive for everything else. The database dashboard showed why:"),
        code("text", `
                                 before release   public, s-maxage=300   no-store (hotfix)
course query per minute                 40              45                   1 900
enrollment query per minute             --              45                   1 900`, "database dashboard, course 42 during a promotion"),
        p("The course query is identical for every learner, so running it 1 900 times a minute is waste. The enrollment query differs for every learner, so running it per request is the job. One response mixed the two, and the cache policy could only be right for one of them."),

        h2("3. Core idea: sort every field, then cache only one side"),
        p("Go through the page field by field and ask one question: **would this value be the same if a different person asked?**"),
        bullets([
            "**Public:** title, description, lesson list, lesson count, list price, instructor. Same for everyone; changes when an instructor saves. Cache it in a shared cache, with a tag for edits (lesson 3.1) and a lifetime as a safety net.",
            "**Personal:** enrolled or not, progress, the price after **this learner's** coupon, their name, their next lesson. Different per learner; load it per request and never store it in a shared cache.",
            "**Derived values follow their most personal input.** The coupon price is computed from the public list price and a personal coupon, so it is personal. Compute it at request time from the cached list price; it costs microseconds.",
        ]),
        p("Then compose the two at request time. The expensive part (the course and its lessons) is loaded once per lifetime and shared; the cheap, small part (one enrollment row, one coupon row) is loaded per learner. Personal data is not slow because it is personal; it is usually a lookup by primary key."),
        h3("In Next.js 16: a cached function and a dynamic component"),
        p("In the App Router, the split falls out of the component tree. The public part is a `\"use cache\"` function or component that takes the course id as an argument. The personal part is a component that reads the session cookie, which makes it dynamic: it runs per request, and wrapping it in `<Suspense>` lets the cached part of the page be sent first. Next.js reports an error if you call `cookies()` or `headers()` inside a `\"use cache\"` scope, which is a useful guard against the most direct form of this bug."),
        callout("warning", "Check the API of your version",
            "\"use cache\", cacheTag and cacheLife need the Cache Components option in Next.js 16. In earlier versions the same split is a cached fetch or unstable_cache for public data, and a dynamic component (one that reads cookies()) for personal data. The principle does not depend on the version: shared caches hold only data that is the same for everyone."),
        h3("Over HTTP: say who may store the response"),
        bullets([
            "**Public endpoint**, `GET /courses/42`: `Cache-Control: public, s-maxage=300` (or longer, with on-demand purging). The response must not depend on the cookie at all.",
            "**Personal endpoint**, `GET /me/courses/42`: `Cache-Control: private, no-store`. `private` forbids shared caches from storing it; `no-store` also keeps it out of the browser cache, which matters on shared computers.",
            "**`Vary: Cookie` is not the fix.** It splits the cache per cookie value in caches that honour it, which means one entry per session and almost no hits; some CDNs do not honour it at all. Split the data instead.",
        ]),
        h3("When not to split"),
        bullets([
            "**Pages that are almost entirely personal**, such as the learner dashboard: do not use a shared cache at all; make the queries fast.",
            "**Public data that is cheap to load**: if the course query takes 3 ms, caching it adds invalidation work for nothing. Split anyway (it keeps the privacy rule simple), but you may not need to cache the public side.",
        ]),

        challenge("chal_quiz_nrc_331"),

        h2("4. Worked example: the course page, split"),
        code("tsx", `
// lib/course-public.ts - shared, cached, tagged
import { cacheLife, cacheTag } from "next/cache";

export async function getPublicCourse(id: string) {
  "use cache";
  cacheTag(\`course:\${id}\`);
  cacheLife("minutes");
  return db.course.findUnique({
    where: { id, published: true },
    select: { id: true, title: true, price: true, lessons: { select: { id: true, title: true } } },
  });
}

// app/course/[id]/LearnerPanel.tsx - per request, never cached
import { cookies } from "next/headers";

export async function LearnerPanel({ courseId, listPrice }: { courseId: string; listPrice: number }) {
  const user = await getSessionUser(await cookies());
  if (!user) return <EnrollButton price={listPrice} />;

  const enrollment = await getEnrollment(user.id, courseId);
  if (enrollment) return <Progress percent={enrollment.progress} />;

  const coupon = await getCoupon(user.id);
  return <EnrollButton price={listPrice} coupon={applicableCoupon(coupon, courseId)} />;
}

// app/course/[id]/page.tsx - compose
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getPublicCourse(id);
  if (!course) notFound();
  return (
    <>
      <CourseHeader course={course} />
      <Suspense fallback={<PanelSkeleton />}>
        <LearnerPanel courseId={course.id} listPrice={course.price} />
      </Suspense>
    </>
  );
}`, "the split in the App Router"),
        p("Three details carry the design. The cached function has **no user in its arguments or its body**, so whatever it returns is safe to share. The panel receives the public list price as a prop and applies the coupon itself, so the personal price never exists outside one request. And the panel loads the coupon only when it will show a price: an enrolled learner sees progress, not a price."),
        p("For the mobile app, the same split becomes two endpoints with the headers from section 3. The app calls them in parallel; the public one is answered by the CDN most of the time."),
        p("In the challenge you write the composition step yourself, without Next.js. You get a shared cache that every request of every user goes through, loaders for public course data, enrollments and coupons, and a stream of requests from several learners and anonymous visitors over time. The runner prints each page with the loads it caused, then the keys in the shared cache: public data must be loaded once per lifetime, and nothing personal may ever be in the shared cache or on another learner's page."),
        challenge("chal_coding_nrc_332"),

        h2("5. How to verify"),
        bullets([
            "**The two-user test.** Request the same page as learner A, then as learner B and as an anonymous visitor. B and the visitor must never see A's progress or price. Automate it: an end-to-end test with two signed-in browser contexts, or two `curl` calls with different cookies as in section 2.",
            "**Read the headers of every personal response.** `Cache-Control` must contain `private` (and usually `no-store`); a personal response with `public` or `s-maxage` is a bug even if the CDN happens not to cache it today.",
            "**List the shared cache keys.** No key or value in a shared cache should contain a user id, a session id or a personal field. A test with a fake cache can assert it directly, as the challenge runner does.",
            "**Count public loads.** With a lifetime of 300 seconds, the course query should run about once per 5 minutes per course and instance, whatever the traffic. The database dashboard from section 2 is the production check.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Caching the composed result.** The page or the API response that merges public and personal data is cached as a whole. Spot it: a shared cache entry whose content depends on who asked first.",
            "**A personal cache key without the user.** `enrollment:42` instead of a per-request load. Spot it: a key built from the course id alone that stores a personal field.",
            "**Reading the session inside the cached function.** In Next.js, `cookies()` inside `\"use cache\"` is an error; in other caches it silently bakes one user into the entry. Spot it: a cached function that calls `getSessionUser`.",
            "**`public` Cache-Control on a response that reads the cookie.** Spot it: grep route handlers that call the session helper and set `s-maxage`.",
            "**Fixing a leak with no-store everywhere.** Safe and slow. Spot it: public queries per minute jump to the request rate.",
        ]),

        h2("7. Summary"),
        numbered([
            "Sort every field by one question: would it be the same for another person? Public data may go into shared caches; personal data, including values derived from it, never does.",
            "Load public data through a shared cache with a tag and a lifetime, load personal data per request, and compose them at request time: in Next.js 16 with a \"use cache\" function and a dynamic component in Suspense, over HTTP with separate public and private responses.",
            "Prove it with a two-user test, the Cache-Control of every personal response, the keys of the shared cache and the count of public loads per lifetime.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js documentation: Caching and Revalidating - nextjs.org/docs/app/getting-started/caching-and-revalidating",
            "Next.js documentation: Server and Client Components - nextjs.org/docs/app/getting-started/server-and-client-components",
            "RFC 9111, HTTP Caching: section 5.2.2.7 (private) and 5.2.2.10 (s-maxage) - rfc-editor.org/rfc/rfc9111",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one page or API response in a project you work on and write every field in two columns, public and personal. Check where each column is cached today and what Cache-Control the response sends, then request it with two different sessions and compare the bodies and the Age header."),
    ],
});
