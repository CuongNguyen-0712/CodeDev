// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-2-1",
    title: "Promise combinators in practice",
    slug: { _type: "slug", current: "promise-combinators-in-practice" },
    description:
        "One HTTP 500 from an optional offers widget took down the whole account dashboard, because four requests were joined with Promise.all. Learn exactly when all, allSettled, any and race settle, split data into required and optional, give every call its own timeout, and render what you have instead of an error page.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, customer account portal of a telecom provider",
        problem:
            "Monday, 09:05 - the busiest hour of the week. The marketing team's offers service starts answering HTTP 500 after a bad deploy. Within two minutes support has 400 tickets: customers cannot see their balance, their plan or their usage, because the whole account page shows \"Something went wrong\". The offers banner is the least important thing on the page. On a normal day the page is also slow: it waits for the activity feed, whose p99 latency is 9 seconds.",
    },

    content: [
        h2("1. The incident"),
        p("The account page needs four things before it can render, so the original code fetched them in parallel and joined them - a reasonable first version:"),
        code("javascript", `
async function loadAccountPage(customerId) {
    const [profile, loyalty, activity, offers] = await Promise.all([
        api.getProfile(customerId),     // name, plan, balance   (p50 120 ms)
        api.getLoyalty(customerId),     // points                (p50 300 ms)
        api.getActivity(customerId),    // last 20 events        (p50 450 ms, p99 9 s)
        api.getOffers(customerId),      // marketing banner      (p50 200 ms)
    ]);
    return { profile, loyalty, activity, offers };
}

loadAccountPage(id).then(renderPage, renderErrorPage);`, "accountPage.js"),
        p("Parallel is right: the requests are independent, and awaiting them one after another would add their latencies up (about 1,070 ms instead of 450 ms). The problem is the **join**. `Promise.all` encodes a policy - \"every result is required, and any failure fails everything\" - and nobody chose that policy on purpose. It also encodes \"wait for the slowest\", so the 9-second activity tail decides when the balance appears."),
        bullets([
            "**Blast radius**: the least important service had the power to take down the most important page. 100% of page views failed for 47 minutes.",
            "**Wasted work**: three healthy responses arrived and were thrown away.",
            "**Tail latency**: with four parallel calls, the page is as slow as the slowest call, so its p99 is at least the worst p99 of its parts - and usually worse.",
        ]),
        p("Before reading on, predict what the combinators actually do in this situation:"),
        challenge("chal_quiz_201"),

        h2("2. Four combinators, four policies"),
        p("Each combinator takes an iterable of promises (or plain values) and returns one promise. They differ only in **when** that promise settles and **with what**:"),
        bullets([
            "**`Promise.all`** - fulfils with an array of all values, in input order, once every input fulfilled. Rejects with the **first** rejection, immediately. \"I need all of them.\"",
            "**`Promise.allSettled`** - never rejects. Waits for every input and fulfils with `{ status: \"fulfilled\", value }` or `{ status: \"rejected\", reason }` per input, in input order. \"Tell me what happened to each.\"",
            "**`Promise.any`** - fulfils with the **first fulfilled** value. Rejects only when every input rejected, with an `AggregateError` whose `errors` array holds all the reasons. \"I need one, any one.\"",
            "**`Promise.race`** - settles like the **first input that settles**, fulfilled or rejected. \"Whoever is first, including the first failure.\"",
        ]),
        image("combinators-dashboard-timeline", {
            alt: "Four service calls on a timeline: offers rejects with HTTP 500 at 80 ms, profile resolves at 120 ms, loyalty at 300 ms and activity takes 9 seconds. Promise.all rejects at 80 ms. Promise.allSettled resolves only at 9 seconds. Promise.race rejects at 80 ms with the offers error. The required/optional policy with per-call timeouts renders at 1.5 seconds with fallbacks for offers and activity.",
            caption: "Same four calls, four different moments of truth. Only an explicit required/optional policy with per-call timeouts renders early and survives the offers outage.",
        }),
        h3("What none of them do"),
        p("No combinator cancels anything. When `Promise.all` rejects, the other requests keep running - the browser still downloads the responses, the server still does the work, and their outcomes are silently ignored. Cancellation is a separate mechanism (`AbortController`), and section 4 wires it in."),
        code("javascript", `
// Promise.any: first successful mirror wins, failures are ignored until all fail.
try {
    const manifest = await Promise.any(mirrors.map((url) => fetchJson(url + "/manifest.json")));
    boot(manifest);
} catch (error) {
    if (error instanceof AggregateError) {
        console.error("all mirrors failed", error.errors);   // one reason per mirror
    }
    throw error;
}`, "loadManifest.js"),
        callout("warning", "Promise.race is almost never a timeout",
            "`Promise.race([fetch(url), sleep(5000).then(() => { throw new Error(\"timeout\") })])` stops waiting after 5 s, but the request keeps running, the timer keeps the closure alive if the fetch wins, and a fast failure wins the race just as easily as a fast success. Use it as a building block, together with cancellation and cleanup."),

        h2("3. Required vs optional: decide the policy per source"),
        p("The fix starts with a product decision, not a combinator. Go through every piece of data on the page and ask: **can the page be useful without it?**"),
        numbered([
            "**Required**: without it the page is meaningless or misleading. The profile (name, plan, balance) is required - if it fails, show a proper error with a retry button.",
            "**Optional with a fallback**: the page works without it, with a sensible substitute. Loyalty points can show \"-\", offers can show nothing at all.",
            "**Optional with a placeholder**: the widget renders its own \"Could not load activity - retry\" state while the rest of the page works.",
        ]),
        p("`Promise.allSettled` is the natural primitive for optional data: it never throws away a result because of someone else's failure. Turn its outcomes into a view model in one place, and report the failures without failing the page:"),
        code("javascript", `
const [profileR, loyaltyR, activityR, offersR] = await Promise.allSettled([
    api.getProfile(id), api.getLoyalty(id), api.getActivity(id), api.getOffers(id),
]);

if (profileR.status === "rejected") throw profileR.reason;      // required

const valueOr = (result, fallback) => (result.status === "fulfilled" ? result.value : fallback);

for (const [name, result] of Object.entries({ loyalty: loyaltyR, activity: activityR, offers: offersR })) {
    if (result.status === "rejected") reportNonFatal(\`account-page/\${name}\`, result.reason);
}

renderPage({
    profile: profileR.value,
    loyalty: valueOr(loyaltyR, { points: null }),   // shows "-"
    activity: valueOr(activityR, null),             // widget shows its retry state
    offers: valueOr(offersR, []),                   // banner disappears
});`, "accountPage.js"),
        p("This survives the offers outage, but it still has two flaws. It waits for the slowest call - allSettled is \"wait for everything\" by definition. And when the **required** profile fails at 250 ms, it still waits for the 9-second activity feed before showing the error. A required failure should fail fast; optional slowness should be cut off."),
        callout("info", "Server-side batches use the same tool",
            "The Node.js High Performance course uses `Promise.allSettled` for batch jobs that must report every outcome (lesson \"The event loop under server load\"). On the client the question is different - not \"what happened to each job\" but \"what can I render right now\" - which is why the policy here mixes allSettled with a fail-fast path."),

        h2("4. A timeout per call, and a combinator you compose yourself"),
        p("Every network call needs a deadline that matches its importance: a required call gets a generous one, an optional widget a short one. In application code the best timeout is one that also **cancels the request**, so pass an `AbortSignal` to `fetch`:"),
        code("javascript", `
async function getJson(url, { timeoutMs, signal } = {}) {
    // Cancel on timeout OR when the page itself is torn down (navigation, unmount).
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (signal) signals.push(signal);

    const res = await fetch(url, { signal: AbortSignal.any(signals) });
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return res.json();
}

// AbortSignal.timeout rejects the fetch with a DOMException named "TimeoutError",
// a page-level abort with "AbortError" - log the first, ignore the second.`, "getJson.js"),
        p("With deadlines in place you can express the whole page policy as one combinator: run everything in parallel, let a required failure reject immediately, let optional failures and timeouts fall back, and resolve when every source has either answered or run out of time. The fail-fast part is a small trick worth remembering - race the allSettled result against a promise that only rejects:"),
        code("javascript", `
const attempts = sources.map(start);                 // already running, in parallel

// Rejects as soon as one REQUIRED attempt rejects; never resolves to anything useful.
const requiredFailure = Promise.all(
    sources.map((s, i) => (s.required ? attempts[i] : null)),
);

// Either the first required failure, or every outcome.
const [outcomes] = await Promise.all([Promise.allSettled(attempts), requiredFailure]);`),
        p("Now build it properly. The tests use an injected fake clock instead of `AbortSignal.timeout`, so each source's timeout is a timer you schedule and - just as important - clear when the source answers first. A dashboard that loads 50 times a session must not leave 200 timers behind."),
        challenge("chal_coding_js_212", "Wrap each load in a promise that also rejects with \"timeout\" from a timer you clear in finally - new Promise((resolve) => resolve(source.load())) turns a synchronous throw into a rejection. Then combine allSettled (for optional sources) with a Promise.all over the required attempts (for fail-fast)."),

        h2("5. Pitfalls that look like combinator bugs"),
        h3("Empty inputs"),
        bullets([
            "`Promise.all([])` and `Promise.allSettled([])` fulfil immediately with `[]` - fine.",
            "`Promise.any([])` rejects immediately with an `AggregateError` - \"none of zero succeeded\".",
            "`Promise.race([])` **never settles**. A race over a filtered list that happens to be empty hangs your UI forever.",
        ]),
        h3("Sequential by accident, parallel by accident"),
        code("javascript", `
// Sequential: each request starts after the previous one finished (sum of latencies).
for (const id of widgetIds) widgets.push(await api.getWidget(id));

// Parallel: map starts every request at once, all() only joins them.
const widgets = await Promise.all(widgetIds.map((id) => api.getWidget(id)));`),
        p("The second form is what you want for four calls. For 4,000 it opens 4,000 requests at once, because `map` starts every promise before `Promise.all` even sees them - combinators join work, they do not schedule it. Limiting how much runs at the same time is the job of a concurrency limiter, the topic of lesson 2.3."),
        h3("The rejections nobody sees"),
        p("When `Promise.all` rejects early, the later rejections of its other inputs are handled internally and dropped - you will never hear about them. That is usually what you want for the page, but it means errors you might care about (a second service failing at the same time) never reach your error tracker unless you report per source, as the allSettled version does. Rejections that are not attached to any handler at all are a different and more dangerous problem - lesson 2.2."),
        callout("tip", "Name the policy in code",
            "A helper called loadDashboard({ profile: { required: true, timeoutMs: 3000 }, offers: { fallback: [], timeoutMs: 800 } }) documents a product decision in one place. A bare Promise.all hides the same decision in an implementation detail - until the day it fails."),

        h2("6. Checklist"),
        bullets([
            "Independent requests run in parallel; requests that depend on each other are awaited in order - never by accident.",
            "Every join has a chosen policy: `all` for all-or-nothing, `allSettled` for partial results, `any` for redundant sources, `race` only as a building block.",
            "Each data source is classified as required, optional with a fallback, or optional with a placeholder - by product, not by the code that happens to fetch it.",
            "A required failure fails fast; optional failures render a fallback and are reported as non-fatal errors.",
            "Every call has its own deadline that cancels the request (`AbortSignal.timeout`, combined with the page's signal via `AbortSignal.any`), and timers are cleared when the call wins.",
            "Empty inputs are handled: no `Promise.race([])`, and `Promise.any` callers catch `AggregateError`.",
            "Large fan-outs go through a concurrency limiter instead of one giant `Promise.all`.",
        ]),
    ],
});
