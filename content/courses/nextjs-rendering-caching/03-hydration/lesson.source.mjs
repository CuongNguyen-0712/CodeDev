// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nrc-1-3",
    title: "Hydration errors: what they mean and how to fix them",
    slug: { _type: "slug", current: "hydration-errors" },
    description:
        "The CodeDev dashboard threw \"Text content does not match server-rendered HTML\" for Vietnamese learners only: the server formatted prices and dates in en-US and UTC, the browser in vi-VN and Asia/Ho_Chi_Minh. Learn what hydration is, why the server and browser renders must agree, the usual causes of a mismatch (locale and time zone formatting, Date.now, random ids, typeof window branches), and the right fix for each: format on the server with an explicit locale and time zone, useId, effects for browser-only data, client-only components, and suppressHydrationWarning only for timestamps.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "Since the dashboard redesign, the error tracker for https://app.codedev.test/dashboard has collected 2,340 hydration errors in a week. Support has a matching ticket titled \"Text content does not match server-rendered HTML\" with a screenshot from a learner in Hanoi: the price of her course flickers from \"149,000 VND\" to \"149.000 VND\" when the page loads and the Continue button does not respond for a moment. 97% of the errors come from browsers set to Vietnamese. Nobody on the team, whose laptops are set to English, can reproduce it.",
    },

    content: [
        h2("1. The incident: an error only Vietnamese learners see"),
        p("The ticket title is the message older versions of React printed (\"Text content does not match server-rendered HTML\"). React 19, which CodeDev runs, words it differently, and the error tracker groups them together:"),
        code("text", `
Hydration failed because the server rendered text didn't match the client.
As a result this tree will be regenerated on the client. This can happen if a
SSR-ed Client Component used:
- A server/client branch \`if (typeof window !== 'undefined')\`.
- Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
...
Events (7 days): 2,340    browser locale: vi-VN 97%, en-US 3%    route: /dashboard`, "error tracker"),
        p("The component that renders the course cards on the dashboard looked harmless:"),
        code("tsx", `
// components/EnrollmentCard.tsx
"use client";
import { useState } from "react";

export function EnrollmentCard({ enrollment }: { enrollment: Enrollment }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <article>
            <h3>{enrollment.courseTitle}</h3>
            <span>{enrollment.priceVnd.toLocaleString()} VND</span>
            <span>Enrolled {new Date(enrollment.enrolledAt).toLocaleDateString()}</span>
            <button type="button" onClick={() => setExpanded(!expanded)}>Details</button>
        </article>
    );
}`, "EnrollmentCard.tsx"),
        p("`toLocaleString()` and `toLocaleDateString()` without arguments use the locale and time zone **of the machine running the code**. This component runs twice: once on the web server (Node, en-US, UTC) and once in the learner's browser (vi-VN, Asia/Ho_Chi_Minh). Two machines, two answers. For an English-language laptop in the office, both answers happened to be the same, which is why nobody could reproduce it."),

        h2("2. Reproduce it and read the evidence"),
        p("You do not need a Vietnamese laptop. In Chrome DevTools, open the **Sensors** panel (Ctrl+Shift+P, type \"sensors\"), and under **Location** set a custom **Timezone ID** `Asia/Ho_Chi_Minh` and **Locale** `vi-VN`. Reload the dashboard in development mode: the Next.js error overlay shows the mismatch as a diff, client lines with `+` and server lines with `-`:"),
        code("text", `
  <EnrollmentCard enrollment={{...}}>
    <article>
      <h3>
      <span>
+       149.000 VND
-       149,000 VND
      <span>
+       Enrolled 26/10/2026
-       Enrolled 10/25/2026`, "Next.js dev overlay"),
        p("You can confirm each half of the story in Node, the same runtime as the server, by passing the locale and time zone explicitly:"),
        code("bash", `
$ node -e 'console.log((149000).toLocaleString("en-US"), (149000).toLocaleString("vi-VN"))'
149,000 149.000

$ node -e 'const d = new Date("2026-10-25T18:30:00Z");
  console.log(d.toLocaleDateString("en-US", { timeZone: "UTC" }), d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))'
10/25/2026 26/10/2026`, "terminal"),
        p("Two separate causes: the **locale** changes the separators and the order of day and month, and the **time zone** changes the day itself for an enrollment made late in the UTC evening (18:30 UTC is 01:30 the next morning in Vietnam). Any fix that addresses only one of them leaves the other."),

        h2("3. The core idea: two renders that must agree"),
        p("A client component is rendered on the server to produce the HTML the learner sees first. Then the browser downloads its JavaScript and React renders it again, this time to attach state and event handlers to the HTML that is already on screen. That second step is **hydration**. React expects the browser render to produce exactly what the server sent, because it reuses the existing DOM instead of building a new one."),
        p("When the two disagree, React cannot trust the HTML:"),
        bullets([
            "**Text that differs:** React 19 throws away the server HTML up to the nearest `<Suspense>` boundary and renders that part again in the browser. The learner sees a flicker, and that part of the page is not interactive until the client render finishes; that is the unresponsive Continue button in the ticket.",
            "**Attributes that differ** (an `id`, a `class`, an `href`): React logs \"A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up.\" The DOM keeps the server's values, which can break things like a label pointing at an input.",
            "**Server components are not hydrated.** They render once, on the server, and the browser receives the result. Formatting a date in a server component cannot cause a mismatch, which is the key to the main fix below.",
        ]),
        h3("The usual causes"),
        bullets([
            "**Locale and time zone defaults:** `toLocaleString()`, `toLocaleDateString()`, `Intl.NumberFormat()` or `Intl.DateTimeFormat()` without an explicit locale and `timeZone`.",
            "**Values that change on every call:** `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()` used during render.",
            "**Browser-only branches:** `typeof window !== \"undefined\"`, `localStorage`, `navigator.language`, `window.innerWidth` read during render. On the server they take the other branch.",
            "**Invalid HTML nesting:** a `<div>` inside a `<p>`, or an `<a>` inside an `<a>`. The browser's parser rearranges the server HTML before React sees it.",
            "**Browser extensions** that edit the page before React loads. You cannot fix those in code; check with an extension-free profile before chasing them.",
        ]),
        challenge("chal_quiz_nrc_131"),

        h2("4. Worked example: one fix per cause"),
        h3("Format on the server, with an explicit locale and time zone"),
        p("The dashboard is already dynamic (it shows the signed-in learner's own data), and the learner's language and time zone are saved in their settings. So the server can produce the final strings and pass them to the client component as plain text:"),
        code("typescript", `
// lib/format.ts - no defaults: the caller always says which locale and time zone
export function formatVnd(amount: number, locale: string): string {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "VND" }).format(amount);
}

export function formatDay(iso: string, locale: string, timeZone: string): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(new Date(iso));
}`, "lib/format.ts"),
        code("tsx", `
// app/dashboard/page.tsx - server component
export default async function DashboardPage() {
    const learner = await requireLearner();
    const { locale = "vi-VN", timeZone = "Asia/Ho_Chi_Minh" } = learner.preferences;
    const enrollments = await getEnrollments(learner.id);

    return enrollments.map((e) => (
        <EnrollmentCard
            key={e.id}
            title={e.courseTitle}
            price={formatVnd(e.priceVnd, locale)}                   // "149.000 ₫" for vi-VN
            enrolledOn={formatDay(e.enrolledAt, locale, timeZone)}   // "26 thg 10, 2026"
        />
    ));
}`, "app/dashboard/page.tsx"),
        p("`EnrollmentCard` now renders two strings it received; it never formats anything, so both renders print the same text. Passing an explicit locale and `timeZone` inside the client component would also work in most cases, but the server's Node and the learner's browser ship their own copies of the Unicode locale data (ICU), and small details such as the kind of space before AM/PM have changed between versions. Formatting once, on the server, removes that risk."),
        callout("warning", "Do not read Accept-Language on a cached page to pick the locale",
            "Reading headers() to choose a locale makes the route dynamic (lesson 1.1). On a public cached page such as the catalog, format with the site's fixed locale (CodeDev prices are always shown as vi-VN VND), or put the locale in the URL (/vi/courses, /en/courses) so that each language is its own cached page."),
        h3("Ids: useId"),
        p("An id made with `Math.random()` is different in each render, so a `<label htmlFor>` and its `<input id>` stop matching after hydration. `useId` generates an id from the component's position in the tree, which is the same on the server and in the browser:"),
        code("tsx", `
"use client";
import { useId } from "react";

export function SearchField() {
    const id = useId();
    return (
        <>
            <label htmlFor={id}>Search courses</label>
            <input id={id} type="search" />
        </>
    );
}`, "SearchField.tsx"),
        h3("Browser-only data: render the server version first, then update"),
        p("The first browser render must match the server, so start with what the server can know and read browser storage in an effect, which runs only after hydration:"),
        code("tsx", `
"use client";
import { useEffect, useState } from "react";

export function ContinueLink() {
    const [last, setLast] = useState<string | null>(null);     // same value as on the server
    useEffect(() => setLast(localStorage.getItem("lastLesson")), []);
    return <a href={last ?? "/courses"}>{last ? "Continue where you left off" : "Browse courses"}</a>;
}`, "ContinueLink.tsx"),
        p("The link changes a moment after load. If that jump is not acceptable, and the component has no meaning without the browser (a chart that measures its container, an editor), skip it on the server instead: in a client component, `dynamic(() => import(\"./CodeEditor\"), { ssr: false, loading: () => <EditorSkeleton /> })` from `next/dynamic` renders only the placeholder on the server. For values that change while the page is open, `useSyncExternalStore` with a `getServerSnapshot` gives the same server-first behaviour."),
        h3("Timestamps: the one place for suppressHydrationWarning"),
        p("\"Updated 3 minutes ago\" depends on the clock, and the server and browser clocks will never agree to the second. For that text, and only text like it, React offers an escape hatch:"),
        code("tsx", `
<time dateTime={updatedAtIso} suppressHydrationWarning>
    {formatRelative(updatedAtIso, Date.now())}
</time>`, "UpdatedAgo.tsx"),
        p("It silences the warning for this element's own text and attributes, one level deep, and it does not make the two renders agree: one of the two texts stays on screen until the next update. That is acceptable for \"3 minutes ago\" next to \"4 minutes ago\". It is never acceptable for a price, a date or an id, where the difference is a bug."),

        h2("5. How to verify"),
        bullets([
            "**DevTools Sensors overrides.** Set the locale to `vi-VN` and the time zone to `Asia/Ho_Chi_Minh` (and try a second pair, such as `en-US` with `America/Los_Angeles`), reload in development: the console must have no hydration errors.",
            "**An end-to-end test per locale.** Playwright can set `locale` and `timezoneId` for a browser context. Load the dashboard with `vi-VN` and fail the test on any console message containing \"Hydration failed\" or \"didn't match\".",
            "**A unit test for the formatters.** In Node, assert that `formatVnd(149000, \"vi-VN\")` and `formatDay(...)` with an evening UTC timestamp give the strings you expect. If they depend on the machine, the test fails on a machine with different defaults.",
            "**Production numbers.** Group hydration errors in the error tracker by route and browser locale. After the release, the vi-VN share should drop to zero, not just shrink.",
            "**A grep for defaults.** `grep -rnE \"toLocale(Date|Time)?String\\(\\)\" app components` lists every call that formats with the machine's defaults.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**Fixing the server's time zone or locale.** `TZ=Asia/Ho_Chi_Minh` on the server makes the error disappear for one country and moves it to the others, and it does nothing for number separators. Spot it in deploy configs; the formatting call should name its locale and time zone instead.",
            "**`suppressHydrationWarning` on everything that warns.** It hides the error and keeps the wrong text or attribute. Spot it by grepping for it: every use should sit on a relative timestamp.",
            "**Believing `\"use client\"` means browser-only.** Client components are rendered on the server too. Spot it in code that reads `window` or `localStorage` during render, guarded by `typeof window`.",
            "**Random or counter-based ids.** `Math.random()`, `Date.now()` or a module-level counter in an id. Spot it by attribute mismatch messages mentioning `id`, `htmlFor` or `aria-*`.",
            "**Reading request headers on a cached page to fix the locale.** It makes the page dynamic and slower for everyone. Spot it as `headers()` in a page that the build output used to show as static.",
        ]),

        h2("7. Summary"),
        numbered([
            "Hydration reuses the server's HTML, so the browser's first render of every client component must produce exactly the same output; server components are not hydrated and cannot cause a mismatch.",
            "Most mismatches come from defaults and side inputs: the machine's locale and time zone, Date.now and Math.random, and browser-only branches; give formatting an explicit locale and time zone, ideally on the server, and use useId for ids.",
            "Read browser-only data after hydration (an effect, useSyncExternalStore or a client-only component), and keep suppressHydrationWarning for timestamps that can never match.",
        ]),

        h2("Sources"),
        bullets([
            "React docs, hydrateRoot: hydration mismatches and suppressHydrationWarning - react.dev/reference/react-dom/client/hydrateRoot",
            "React docs, useId - react.dev/reference/react/useId",
            "MDN Web Docs, Intl.DateTimeFormat and Intl.NumberFormat (locale and timeZone options)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Open a Next.js app you work on with the DevTools Sensors panel set to a locale and time zone far from yours (vi-VN with Asia/Ho_Chi_Minh, or ja-JP with Asia/Tokyo) and click through its main pages with the console open. For every hydration message, write down the cause from section 3 and the fix from section 4 you would apply."),
    ],
});
