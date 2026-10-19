// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-3-2",
    title: "Search race conditions & AbortController",
    slug: { _type: "slug", current: "search-race-conditions-abortcontroller" },
    description:
        "Responses do not arrive in the order you sent the requests. Learn why a slow, older search response overwrites a newer one, fix it with the latest-request-wins pattern on AbortController, fall back to request ids when work cannot be cancelled, and make sure nothing renders after the component is gone.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, documentation portal of a developer platform",
        problem:
            "The package search on the docs portal shows results that do not match the query. A user types \"react\" and gets a list for \"reac\" - including \"reactive-cache\" and \"reach-router\" - with the input still saying \"react\". Session replays show it happens in 3.8% of searches on mobile and almost never on office Wi-Fi. On top of that, closing the search overlay while a request is in flight logs a state update on an unmounted component, and every keystroke downloads a full 80 KB result page that nobody will ever see.",
    },

    content: [
        h2("1. The incident: the slow answer wins"),
        p("The search box fires a request on every input event (the debounce from lesson 5.1 comes later in the course; it reduces the number of requests but, as you will see, does not fix this bug). The code is the version most of us write first:"),
        code("javascript", `
const input = document.querySelector("#package-search");

input.addEventListener("input", async () => {
    const query = input.value;
    try {
        const res = await fetch(\`/api/packages?q=\${encodeURIComponent(query)}\`);
        renderResults(await res.json());
    } catch (error) {
        renderError(error);
    }
});`, "packageSearch.js"),
        p("Every request is correct on its own. The bug lives **between** requests: nothing connects a response to the query that is on screen when it arrives. Predict what the user sees."),
        challenge("chal_quiz_js_321"),

        h2("2. Why responses arrive out of order"),
        p("Request latency is not a property of the request order. Shorter queries match more packages, so \"reac\" is a bigger, slower query than \"react\"; one request can hit a cold cache node, wait for a slot in the browser's connection pool, or suffer a lost packet on a mobile link. On office Wi-Fi every request takes 40 ms and the race is invisible. On 4G with 300-1500 ms latencies it happens several times a day per user."),
        image("search-race-timeline", {
            alt: "Timeline of two requests. reac starts at 0 ms and takes 900 ms; react starts at 150 ms and takes 200 ms. Without cancellation, the screen shows react results at 350 ms and is overwritten by stale reac results at 900 ms. With latest-request-wins, the reac request is aborted at 150 ms when react starts, and the react results stay on screen.",
            caption: "Without cancellation the last response wins. With latest-request-wins, the last request wins.",
        }),
        p("There is a second, quieter cost: the request for \"reac\" keeps downloading its 80 KB after the user has moved on. On a slow connection the stale requests compete for bandwidth with the one that matters, which makes the current request slower and the race more likely."),
        callout("info", "This is not a JavaScript quirk",
            "Any UI that issues overlapping async requests for the same piece of state has this race: typeahead, filters, tabs that load data, pagination, route changes. The fix is always the same rule - only the latest request may update the state."),

        h2("3. Latest-request-wins with AbortController"),
        p("An `AbortController` is a one-shot cancellation switch. Its `signal` is passed to the work you want to be able to cancel; `controller.abort()` flips it. `fetch` listens to the signal: it closes the connection, stops downloading the body and rejects with an `AbortError` - also if the abort happens while you are reading `res.json()`."),
        code("javascript", `
let inflight = null;

input.addEventListener("input", async () => {
    const query = input.value;

    inflight?.abort();                        // 1. cancel the previous request
    const controller = new AbortController();
    inflight = controller;

    try {
        const res = await fetch(\`/api/packages?q=\${encodeURIComponent(query)}\`, {
            signal: controller.signal,        // 2. let fetch observe the cancellation
        });
        const packages = await res.json();
        if (controller.signal.aborted) return; // 3. superseded while parsing: drop it
        renderResults(packages);
    } catch (error) {
        if (controller.signal.aborted) return; // 4. a cancelled request is not an error
        renderError(error);
    }
});`, "packageSearch.js"),
        numbered([
            "**Abort before you start.** The new request supersedes the previous one, so cancel it first. Aborting a request that already finished is a harmless no-op.",
            "**Pass the signal everywhere.** To `fetch`, and to anything else that accepts one - your own helpers should take a `signal` option too.",
            "**Check `signal.aborted` after every `await`.** An abort can land after the last abortable step: the JSON is already parsed, or the work was not abortable at all. The check makes the result disappear no matter where the abort landed.",
            "**Treat cancellation as silence.** Never show \"Something went wrong\" because the user typed another letter.",
        ]),
        p("Cancellation only works if every layer passes the signal down. A data-layer helper that drops it silently turns every abort into \"stop waiting\" instead of \"stop downloading\":"),
        code("javascript", `
export async function searchPackages(query, { signal } = {}) {
    const res = await fetch(\`/api/packages?q=\${encodeURIComponent(query)}\`, { signal });
    if (!res.ok) throw Object.assign(new Error(\`HTTP \${res.status}\`), { status: res.status });
    const { items } = await res.json();            // the body read is aborted too
    signal?.throwIfAborted();                      // and so is any work after it
    return items.map(toSearchResult);
}`, "api/packages.js"),
        p("Libraries follow the same convention: axios accepts `{ signal }`, and TanStack Query passes a `signal` to your query function and aborts it when the query key changes or the component unmounts - provided you forward it to `fetch`."),
        callout("warning", "Check the signal, not just the error name",
            "if (error.name === \"AbortError\") works only for the default reason. controller.abort(reason) makes fetch reject with that reason, and AbortSignal.timeout() rejects with a TimeoutError. controller.signal.aborted is true in every one of these cases - and it tells you that this is the request YOU cancelled, rather than one that failed by itself."),
        h3("Timeouts and composed signals"),
        p("The same mechanism gives you timeouts. `AbortSignal.timeout(ms)` aborts after a delay, and `AbortSignal.any([...])` combines signals - the request stops when the user supersedes it **or** when it takes too long:"),
        code("javascript", `
const res = await fetch(url, {
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
});
// controller.signal aborted  -> superseded: ignore silently
// timeout fired              -> TimeoutError: show "Search is slow, try again"`),

        h2("4. When you cannot cancel: request ids"),
        p("Not everything takes a signal. A computation in a Web Worker, an IndexedDB query, a third-party SDK method or a WebSocket message cannot be aborted - the answer will arrive no matter what. In that case you cannot stop the work, but you can still refuse its result: give every request a number and apply a result only if it belongs to the latest one."),
        code("javascript", `
let latestId = 0;

async function search(query) {
    const id = ++latestId;                    // captured when the request starts
    const packages = await searchIndex.query(query);  // cannot be aborted
    if (id !== latestId) return;              // a newer search started meanwhile
    renderResults(packages);
}`, "localSearch.js"),
        bullets([
            "**Capture the id when the request starts**, in a local variable, and compare when the result arrives. Lesson 6.2 turns exactly this into a state machine that ignores stale events by id.",
            "**Abort when you can, check ids or `signal.aborted` always.** Aborting saves bandwidth and server work; the check guarantees correctness.",
            "**Do not abort writes to undo them.** Aborting a `POST` only stops the browser from waiting - the server may already have applied it. Cancellation is for reads and for work whose result you no longer want.",
        ]),

        h2("5. Cleaning up: unmount, close, navigate"),
        p("The search overlay can be closed while a request is in flight. Without cleanup, the response arrives later and renders into a component that no longer exists - a wasted request at best, a crash or a flash of stale UI at worst. The rule: whatever starts a request owns its controller and aborts it when it goes away."),
        code("javascript", `
useEffect(() => {
    if (!query) return;
    const controller = new AbortController();

    fetch(\`/api/packages?q=\${encodeURIComponent(query)}\`, { signal: controller.signal })
        .then((res) => res.json())
        .then((packages) => { if (!controller.signal.aborted) setResults(packages); })
        .catch((error) => { if (!controller.signal.aborted) setError(error); });

    return () => controller.abort();          // runs on unmount AND before the next query
}, [query]);`, "PackageSearch.jsx"),
        p("React's cleanup runs both when the component unmounts and before the effect runs again for a new `query`, so this one line gives you latest-request-wins and unmount safety together. In development, StrictMode mounts every component twice - you will see the first request cancelled in the Network tab, which is the cleanup doing its job."),
        p("Outside React, wrap the pattern in a small controller with an explicit `dispose()`. That is what the docs portal uses - and the version that shipped still lets stale results through:"),
        challenge("chal_fix_302", "Abort the previous controller before creating the next one, and pass the new signal to search. After the await - in both the success and the error path - return silently if this request's signal was aborted. dispose() must abort the in-flight request, not just forget it."),
        callout("tip", "One signal for the whole lifetime",
            "A component can create one AbortController for its whole lifetime and pass its signal to fetch calls, addEventListener(type, handler, { signal }) and your own async helpers. One abort() on teardown then cancels requests and removes listeners at once - lesson 5.3 builds on this."),

        h2("6. Checklist"),
        bullets([
            "Every UI state that is loaded asynchronously has a rule for overlapping requests: only the latest may update it.",
            "Starting a new request aborts the previous one; the signal is passed to `fetch` and to your own helpers.",
            "After every `await`, results are dropped if this request's signal is aborted; cancellations never show an error.",
            "Work that cannot be aborted is tagged with a request id captured at start; stale results are ignored.",
            "Components and controllers abort their in-flight requests on unmount, close and navigation.",
            "Timeouts use `AbortSignal.timeout()` combined with the user's signal via `AbortSignal.any()`, and are reported differently from cancellations.",
            "Writes are never \"cancelled\" by aborting them; they are made idempotent instead.",
        ]),
    ],
});
