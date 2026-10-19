// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-3-1",
    title: "Async/await pitfalls & return patterns",
    slug: { _type: "slug", current: "async-await-pitfalls-return-patterns" },
    description:
        "async/await reads like synchronous code, which is exactly why its failure modes slip through review. Learn when return needs await, why try/catch and finally only see what you await, how loops and forEach serialise or lose work, how to initialise something asynchronously exactly once, and how to wrap errors without losing their cause.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, account dashboard of a SaaS billing product",
        problem:
            "Release 4.2 of the account dashboard went out on Monday. By Wednesday: when the profile API returns 503, users get a full-page crash instead of the cached profile the code clearly falls back to; \"Export invoices\" says \"Done\" while uploads are still running; the dashboard takes 6 seconds to load although every widget answers in under 200 ms; and the feature-flag vendor bills three times the expected connections, while Sentry fills up with \"Client initialisation failed\" and nothing else. Every one of these functions passed code review.",
    },

    content: [
        h2("1. The incident: code that reads right and runs wrong"),
        p("Here is the relevant part of release 4.2. Read it the way a reviewer did - top to bottom, as if each line finished before the next one started:"),
        code("javascript", `
async function loadProfile(userId) {
    showSpinner();
    try {
        return fetchProfile(userId);               // 503 -> should fall back to the cache
    } catch (error) {
        report(error);
        return readCachedProfile(userId);
    } finally {
        hideSpinner();
    }
}

async function exportInvoices(invoices) {
    invoices.forEach(async (invoice) => {
        await uploadPdf(invoice);                  // 40 uploads
    });
    toast("Export done");
}

async function loadDashboard(widgets) {
    const data = {};
    for (const widget of widgets) {
        data[widget.id] = await widget.load();     // 8 widgets x ~180 ms
    }
    return data;
}`, "dashboard.js"),
        p("Each function has the shape of correct code. Each one is wrong in a way that only shows up at runtime: under failure, under load or at the end of a slow operation. Before reading on, predict what the first one does."),
        challenge("chal_quiz_301"),

        h2("2. return vs return await"),
        p("An `async` function always returns a promise. When you `return somePromise` from it, that outer promise simply **adopts** the inner one: it settles however the inner promise settles, later, after the function body has already finished. When you `return await somePromise`, the function body pauses at the `await`, and if the promise rejects, the rejection is thrown **at that line** - inside the `try`."),
        image("return-vs-return-await", {
            alt: "Two timelines for loadProfile when fetchProfile rejects after 300 ms. With return fetchProfile(), the try block and finally finish at 0 ms, the spinner hides immediately and the rejection reaches the caller at 300 ms without passing the catch. With return await fetchProfile(), the function pauses inside try, the rejection is caught at 300 ms, the cached profile is returned and finally runs last.",
            caption: "try/catch/finally only cover the time your function spends inside them. Without await, that time is zero.",
        }),
        p("So `try/catch` and `finally` protect only what you **await** inside them. Without `await`, the function leaves the `try` block the moment the promise is created: the `catch` never sees the rejection and `finally` runs before the request has finished - the spinner disappears while the request is still in flight."),
        code("javascript", `
async function loadProfile(userId) {
    showSpinner();
    try {
        return await fetchProfile(userId);         // the rejection is thrown here, inside try
    } catch (error) {
        report(error);
        return readCachedProfile(userId);
    } finally {
        hideSpinner();                             // runs after the request has settled
    }
}`, "dashboard.js"),
        h3("When the await matters"),
        bullets([
            "**Inside try/catch or try/finally**: always `return await`. This is the case that broke release 4.2.",
            "**Inside a `using` / `await using` block** (explicit resource management): the resource is disposed when the block exits - without `await` that happens while the promise is still running.",
            "**Outside any try**: both forms behave the same for the caller. `return await` costs at most a microtask tick and keeps the function in async stack traces, so many teams use it everywhere.",
        ]),
        callout("tip", "Let the linter decide",
            "ESLint's old no-return-await rule is deprecated because it pushed people towards the bug above. Use @typescript-eslint/return-await with the \"in-try-catch\" option (or \"always\"): it requires await exactly where leaving it out changes behaviour."),

        h2("3. Sequential awaits: waterfalls you did not ask for"),
        p("`loadDashboard` is correct, just slow: `await` inside a `for...of` loop starts the next widget only after the previous one finished. Eight widgets at about 180 ms each take 1.4 s instead of 180 ms - and on a 3G connection with 600 ms round trips, nearly 5 s."),
        p("If the iterations do not depend on each other, start them all and then wait for all of them:"),
        code("javascript", `
async function loadDashboard(widgets) {
    const results = await Promise.allSettled(widgets.map((widget) => widget.load()));

    // One broken widget must not blank the whole dashboard.
    return Object.fromEntries(widgets.map((widget, i) => [
        widget.id,
        results[i].status === "fulfilled" ? results[i].value : { error: results[i].reason.message },
    ]));
}`, "dashboard.js"),
        bullets([
            "**`Promise.all`** when every result is required: it rejects on the first failure (the other requests keep running, so pass an `AbortSignal` if they are expensive).",
            "**`Promise.allSettled`** when partial results are useful - dashboards, batch reports.",
            "**Sequential on purpose** when step 2 needs step 1's result, when order matters (applying migrations), or when the server limits you to one request at a time. For \"many, but not all at once\", use the concurrency limiter from lesson 2.3.",
        ]),
        callout("warning", "Starting early, awaiting late",
            "const a = loadA(); const b = loadB(); await a; await b; runs both concurrently - but if b rejects while you are still awaiting a, nothing is listening to b yet. Browsers log an unhandled rejection, and Node may crash the process (lesson 2.2). Await concurrent work together with Promise.all or Promise.allSettled."),

        h2("4. forEach does not wait"),
        p("`Array.prototype.forEach` calls the callback and throws the return value away. An `async` callback returns a promise, so `forEach` starts all 40 uploads and returns immediately - \"Export done\" appears before the first upload finishes. Worse, nobody holds those promises: a failed upload becomes an unhandled rejection instead of an error the export can report."),
        code("javascript", `
// Sequential, with the first error stopping the export:
for (const invoice of invoices) {
    await uploadPdf(invoice);
}

// Concurrent, waiting for all, reporting every failure:
const results = await Promise.allSettled(invoices.map((invoice) => uploadPdf(invoice)));
const failed = results.filter((r) => r.status === "rejected");
toast(failed.length ? \`\${failed.length} invoices failed\` : "Export done");`, "exportInvoices.js"),
        p("The same trap hides in other callback-based array methods. None of them understand promises:"),
        bullets([
            "`filter(async (x) => ...)` keeps **every** element: a promise is always truthy.",
            "`some`, `every` and `find` with async callbacks look at the promise, not at its result.",
            "`reduce(async (acc, x) => ...)` works only if every step awaits `acc` first - and then it is a sequential loop in disguise.",
            "`map(async ...)` is fine, as long as you pass the resulting array of promises to `Promise.all` or `Promise.allSettled`.",
        ]),
        callout("info", "Lint it",
            "@typescript-eslint/no-misused-promises reports async callbacks passed where a void function is expected (forEach, event handlers), and no-floating-promises reports promises that nobody awaits or handles."),

        h2("5. Errors that keep their cause"),
        p("When a low-level error crosses a layer boundary, you often want to replace its message with one that makes sense at that layer. The common mistake is to throw a new error and drop the original - the dashboard's Sentry entries said \"Client initialisation failed\" and nothing about the expired API key behind it."),
        code("javascript", `
try {
    await connectToFlagService(apiKey);
} catch (error) {
    // The original error - message, stack, status - travels along as error.cause.
    throw new Error("Client initialisation failed", { cause: error });
}`, "flags.js"),
        bullets([
            "`{ cause }` is supported in all current browsers and Node 16.9+. Sentry, the Chrome console and Node's `util.inspect` all print the cause chain.",
            "Wrap at **boundaries** (SDK to app, data layer to UI), not on every function, or the chain becomes noise.",
            "Never wrap or retry an `AbortError`: rethrow it unchanged, so callers can tell \"cancelled\" from \"failed\" (next lesson).",
            "`Promise.any` rejects with an `AggregateError` whose `errors` array holds every individual failure - log the array, not just the message.",
        ]),

        h2("6. Async initialisation, exactly once"),
        p("A constructor cannot be `async`, and returning a promise from one produces an object that is \"constructed\" but not ready. Two patterns work:"),
        numbered([
            "**Async factory**: make the constructor private by convention and expose `static async create()`, which does the async work and only then calls `new`. Callers can never hold a half-initialised instance.",
            "**Lazy, memoised initialiser**: when the resource should be created on first use - an SDK client, a WebSocket, an IndexedDB connection - wrap the creation in a function that every caller awaits.",
        ]),
        p("The dashboard used the second pattern, and the vendor's bill shows how it went wrong. Three widgets ask for the flag client during the same page load:"),
        code("javascript", `
let client = null;

async function getClient() {
    if (!client) client = await connect();   // widget 2 and 3 check before widget 1's connect finished
    return client;
}`, "flags.js"),
        p("While the first `connect()` is pending, `client` is still `null`, so every concurrent caller starts its own connection. The fix is to cache the **promise**, not the result: the first caller creates it, every later caller awaits the same one. Then decide what a failure means - a cached rejected promise would make one network blip permanent for the rest of the session."),
        challenge("chal_fix_js_312", "Store the in-flight promise synchronously, before the first await, so concurrent callers share it. Forget it when it rejects (only then), and wrap the failure with { cause }. Remember which kind of return lets a catch block see a rejection."),
        callout("success", "After the fixes",
            "The 503 fallback renders the cached profile, the export reports failed invoices by name, the dashboard loads in 210 ms, and each tab opens exactly one flag-service connection. The next Sentry error read \"Client initialisation failed\" - caused by \"401 API key expired\" - and was fixed in ten minutes."),

        h2("7. Checklist"),
        bullets([
            "Inside try/catch or try/finally, every returned promise is `return await`ed; lint with `@typescript-eslint/return-await`.",
            "Independent async work starts together and is awaited with `Promise.all` or `Promise.allSettled`; sequential loops are a deliberate choice.",
            "No promise is started without someone awaiting or handling it - no `forEach`, `filter` or `some` with async callbacks.",
            "Errors crossing a layer boundary are wrapped with `{ cause }`; `AbortError` is rethrown unchanged.",
            "Async resources are created by an async factory or a memoised initialiser that caches the promise and forgets it on failure.",
            "Lint rules `no-floating-promises` and `no-misused-promises` are on in CI.",
        ]),
    ],
});
