// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-4-2",
    title: "Streaming with Suspense & loading states",
    slug: { _type: "slug", current: "streaming-suspense-loading-states" },
    description:
        "The course page showed nothing for almost two seconds because the personal progress query blocked the public course header, and the first fix, a loading.tsx, hid the header behind a skeleton too. Learn how streaming with Suspense sends the fast part of a page first, where to put boundaries so the header shows at once while the progress panel streams in, how sequential awaits create waterfalls and how Promise.all removes them, and how error.tsx and smaller error boundaries keep one failing panel from taking down the page.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "Support ticket #5120: \"When I open a course I stare at a white page for two seconds, sometimes more. Other sites show something right away.\" Real-user monitoring for /courses/[slug] agrees: time to first byte p75 is 1.9 s for signed-in learners and 0.3 s for visitors. The page loads the course, its modules and the learner's progress one after another, and the progress query, which aggregates submissions, takes 0.9 to 1.4 s. On Wednesday a teammate added app/courses/[slug]/loading.tsx: the white page became a full-page skeleton for the same two seconds, and the course title, which is public and ready after 120 ms, still appears last.",
    },

    content: [
        h2("1. The incident: one slow query holds the whole page"),
        p("Here is the page that shipped. It reads well from top to bottom, which is exactly the problem:"),
        code("tsx", `
// app/courses/[slug]/page.tsx - the version that shipped
export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const user = await getSessionUser();                    // reads the session cookie
    const course = await getCourse(slug);                   // ~120 ms, public
    const modules = await getModules(slug);                 // ~150 ms, public, does not need course
    const progress = user ? await getProgress(user.id, slug) : null;   // 900-1400 ms, personal

    return (
        <>
            <CourseHeader course={course} />
            <ModuleList modules={modules} />
            {progress && <ProgressPanel progress={progress} />}
        </>
    );
}`, "page.tsx (shipped)"),
        p("A server component returns its JSX only after every `await` above it has resolved. Until then the server has nothing to send, so the browser shows nothing. The header waits for the modules, the modules wait for the course, and everything waits for the progress query, the one part only the learner needs and the one part that is slow."),

        h2("2. Read the evidence"),
        p("Add timing around each loader and request the page as a signed-in learner. The server log shows the requests one after another:"),
        code("text", `
GET /courses/react-basics  user=u_7
  +0 ms     getSessionUser   start      +8 ms    done
  +8 ms     getCourse        start      +131 ms  done
  +131 ms   getModules       start      +284 ms  done
  +284 ms   getProgress      start      +1612 ms done
  +1631 ms  first byte sent`, "server log with timings"),
        p("In Chrome DevTools, open the **Network** tab, select the document request and open **Timing**. \"Waiting for server response\" is about 1.6 s and \"Content Download\" is a few milliseconds: the server sends the whole page in one go, after all the work. You can measure the same without a browser:"),
        code("bash", `
curl -s -o /dev/null -b "session=$SESSION" \\
  -w "first byte %{time_starttransfer}s, total %{time_total}s\\n" \\
  https://app.codedev.test/courses/react-basics

first byte 1.642s, total 1.651s`, "terminal"),
        p("Two problems hide in that log. The awaits form a **waterfall**: `getModules` does not need the course, yet it starts only when `getCourse` is done. And the page is **all or nothing**: the fastest, most important part cannot leave the server before the slowest part is ready."),

        h2("3. The core idea: send what is ready, stream the rest"),
        p("With the App Router, the server can send HTML in several chunks over one response. A **Suspense boundary** marks a place where it is allowed to do that: if something inside the boundary is still waiting, the server sends the boundary's `fallback` now, keeps the connection open, and later sends the real content plus a small script that swaps it in. Everything outside the boundary goes out in the first chunk."),
        code("tsx", `
<CourseHeader course={course} />                      {/* first chunk */}
<Suspense fallback={<ProgressSkeleton />}>            {/* first chunk: the skeleton */}
    <ProgressPanel userId={user.id} slug={slug} />    {/* later chunk: awaits getProgress inside */}
</Suspense>`),
        p("The rule that decides whether this works: **the slow `await` must happen inside the component under the boundary**, not in the parent that renders the boundary. A Suspense boundary can only stream what suspends below it. If the page itself awaits the progress and passes the result down as a prop, the page has already waited, and the boundary has nothing left to stream."),
        h3("loading.tsx is a Suspense boundary around the whole page"),
        p("A `loading.tsx` file in a route segment wraps that segment's `page.tsx` in a Suspense boundary whose fallback is the loading component. The segment's `layout.tsx` stays outside it. That is useful for navigation (the layout and the skeleton appear at once while the page loads), but it treats the page as one block: the course header, which is ready in 120 ms, is part of the page, so it sits behind the skeleton with everything else. That is why the first fix felt no faster."),
        h3("Where to put boundaries"),
        bullets([
            "**Around the slow part, not around the page.** The boundary goes where fast content ends and slow content begins. Here: the header and the module list outside, the progress panel inside.",
            "**Around personal data.** Public content can be prerendered or cached; the personal panel cannot (lesson 9). Keeping it in its own boundary lets the public part go out first, and in modes that prerender a static shell it lets the shell be cached while the panel renders per request.",
            "**At a size that matches the content.** Give the fallback the same height as the real panel so the page does not jump when it arrives.",
            "**Not around everything.** Ten boundaries that resolve in a random order make a page that \"pops\" in pieces. Group parts that belong together under one boundary.",
        ]),
        h3("When streaming is not the answer"),
        bullets([
            "**It does not make the slow query faster.** The panel still takes 1.4 s. Streaming makes the wait visible and partial; an index or a precomputed progress row fixes the cause.",
            "**Content that must be in the first HTML** (the title and summary search engines index) belongs outside any boundary.",
            "**The status code is sent with the first chunk.** Once streaming has started, a 404 or a redirect found inside a boundary cannot change the status that was already sent; Next.js falls back to other means such as a meta tag. Call `notFound()` before the first boundary, from data the page awaits itself.",
            "**Buffering proxies.** A reverse proxy or a compression layer that buffers the whole response turns streaming back into one chunk. If the timings below do not change, check the proxy settings (for nginx, response buffering) before you blame the code.",
        ]),

        h2("4. Waterfalls and Promise.all"),
        p("Inside any one component, two awaits in a row run one after the other even when neither needs the other's result. Start independent requests together and await them together:"),
        code("tsx", `
// before: 120 ms + 150 ms = 270 ms
const course = await getCourse(slug);
const modules = await getModules(slug);

// after: max(120 ms, 150 ms) = 150 ms
const [course, modules] = await Promise.all([getCourse(slug), getModules(slug)]);`, "remove the waterfall"),
        p("Keep the sequence when there is a real dependency, for example when the second query needs an id from the first. `Promise.all` rejects as soon as one promise rejects; use `Promise.allSettled` when the page can render with part of the data missing. Moving the progress query into its own boundary also removes it from the waterfall: the page no longer waits for it at all."),
        callout("info", "Passing a promise to a client component",
            "React 19 lets a server component start a request and pass the promise itself to a client component, which reads it with use() inside a Suspense boundary. It is handy when the client component needs the data for interactivity. Server components that simply await inside the boundary are simpler and are what this lesson uses."),

        challenge("chal_quiz_nrc_421"),

        h2("5. The fix"),
        code("tsx", `
// app/courses/[slug]/page.tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const [course, modules] = await Promise.all([getCourse(slug), getModules(slug)]);   // public, ~150 ms
    if (!course) notFound();                       // before any boundary: a real 404 status

    return (
        <>
            <CourseHeader course={course} />
            <ModuleList modules={modules} />
            <ProgressErrorBoundary>
                <Suspense fallback={<ProgressSkeleton />}>
                    <ProgressPanel slug={slug} />
                </Suspense>
            </ProgressErrorBoundary>
        </>
    );
}

// The personal, slow part awaits its own data, so only it waits.
async function ProgressPanel({ slug }: { slug: string }) {
    const user = await getSessionUser();
    if (!user) return <SignInToTrackProgress />;
    const progress = await getProgress(user.id, slug);
    return <ProgressView progress={progress} />;
}`, "page.tsx (fixed)"),
        p("The `loading.tsx` file was deleted: the page now sends its header after about 150 ms by itself, and a full-page skeleton would only hide it again. Keep a `loading.tsx` where a page has nothing useful to show early; it still gives an instant response to a client-side navigation."),
        h3("Errors: error.tsx and smaller boundaries"),
        p("A Suspense boundary handles waiting, not failing. When a server component throws, the error goes to the nearest error boundary. `error.tsx` in a route segment is one: it must be a client component (`\"use client\"`), it wraps the segment's page, and it replaces the page with its own UI. It receives the error and a function to try rendering again; this repository's `app/error.jsx` calls it `reset`, and newer versions may name or extend it differently, so check the docs for your version. Two details matter:"),
        bullets([
            "`error.tsx` does not catch errors thrown by the `layout.tsx` of the **same** segment, because the layout is outside it. Errors in a layout go to the error boundary of the parent segment.",
            "If `error.tsx` is the only boundary, a failing progress query replaces the whole course page with \"Something went wrong\", including the public header that rendered fine. Wrap the panel in its own small error boundary (a client component, or a library such as react-error-boundary) so that only the panel shows \"Progress is unavailable, try again\".",
        ]),
        code("tsx", `
"use client";
// components/course/progressErrorBoundary.tsx
import { Component, type ReactNode } from "react";

export class ProgressErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        return this.state.failed
            ? <p role="status">Progress is unavailable right now. The course itself is fine.</p>
            : this.props.children;
    }
}`, "progressErrorBoundary.tsx"),

        h2("6. How to verify"),
        numbered([
            "**First byte versus total.** Rerun the curl command from section 2. Expect `time_starttransfer` near the public part (about 0.15 to 0.2 s) and `time_total` still near the progress query. The gap between the two is the streamed part.",
            "**See the chunks arrive.** `curl -N -s -b \"session=$SESSION\" https://app.codedev.test/courses/react-basics` prints the response as it streams: the header HTML and the skeleton first, the progress markup after a pause.",
            "**DevTools.** In Network > Timing, \"Waiting for server response\" drops and \"Content Download\" grows. In the Performance panel, the course title is painted long before the progress panel.",
            "**Server log.** `getCourse` and `getModules` now start at the same millisecond; `getProgress` starts after the first byte, not before it.",
            "**Failure.** Make `getProgress` throw on staging (for example, point it at a missing view). The page must still show the header and modules, with the panel's error message in place of the panel, and still answer `200`.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Awaiting slow data in the parent, then wrapping the child in Suspense.** Spot it: first byte time does not change after adding the boundary. Move the await into the component inside the boundary.",
            "**A loading.tsx that hides fast content.** Spot it: the skeleton covers parts that are ready in 100 ms, such as the public header. Use a boundary around the slow part instead, or keep fast parts in the layout.",
            "**Independent awaits in a row.** Spot it: in the server log, each loader starts when the previous one ends. Use `Promise.all` when nothing depends on the earlier result.",
            "**One error boundary for the whole page.** Spot it: a failure in one panel replaces the page with the route's error UI. Add a smaller boundary around the parts that may fail on their own.",
            "**Calling notFound() inside a streamed component.** Spot it: a missing course answers `200` with a not-found message. Check existence in the page, before any boundary.",
        ]),

        h2("8. Summary"),
        bullets([
            "A Suspense boundary lets the server send everything outside it first and stream the inside later, but only if the slow await happens inside the boundary; `loading.tsx` is one boundary around the whole page.",
            "Put boundaries where fast public content ends and slow or personal content begins, and remove waterfalls with `Promise.all` for independent requests.",
            "Error boundaries are separate from Suspense: `error.tsx` replaces the segment's page, so give parts that can fail alone their own boundary.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js docs: loading.js and Streaming - nextjs.org/docs/app/api-reference/file-conventions/loading",
            "Next.js docs: error.js - nextjs.org/docs/app/api-reference/file-conventions/error",
            "React docs: Suspense and use - react.dev/reference/react/Suspense, react.dev/reference/react/use",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick a page of yours that loads personal data. Log the start and end time of every loader, draw the waterfall on paper, then move the slowest personal part into its own Suspense and error boundary. Compare time to first byte and total time with curl before and after, and make the slow part fail on purpose to check that the rest of the page survives."),
    ],
});
