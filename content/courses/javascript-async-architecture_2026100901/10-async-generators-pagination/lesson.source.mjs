// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-4-1",
    title: "Async generators & lazy pagination",
    slug: { _type: "slug", current: "async-generators-lazy-pagination" },
    description:
        "A \"show the first 50 flagged orders\" panel downloads 190,000 orders before it renders a single row. Learn the async iteration protocol, write async generators that fetch pages only on demand, and compose map/filter/take so an early exit stops the network requests too.",
    estimatedTime: 22,

    scenario: {
        role: "Frontend engineer, back-office dashboard of an e-commerce marketplace",
        problem:
            "Monday, 09:10. The fraud team opens \"Flagged orders\", which should show the 50 most recent orders flagged for review. The panel spins for 40 seconds, the tab climbs past 900 MB and Chrome kills it on the support team's 8 GB laptops. The API gateway also fires a rate-limit alert: every open of the panel requests all 1,900 pages of /api/orders. The panel only ever displays 50 rows.",
    },

    content: [
        h2("1. The incident"),
        p("The panel was built on a helper that looked harmless in code review. It collects every page into one array, then filters and slices:"),
        code("javascript", `
async function fetchAllOrders() {
    const all = [];
    let cursor = null;
    do {
        const res = await fetch(\`/api/orders?cursor=\${cursor ?? ""}&limit=100\`);
        const page = await res.json();     // { items, nextCursor }
        all.push(...page.items);
        cursor = page.nextCursor;
    } while (cursor);
    return all;
}

const flagged = (await fetchAllOrders())
    .filter((order) => order.flagged)
    .slice(0, 50);
render(flagged);`, "flaggedOrders.js"),
        p("Three problems hide in these lines:"),
        bullets([
            "**Eager**: all 1,900 requests run before the first row is shown, although the first three pages already contain 50 flagged orders.",
            "**Unbounded memory**: 190,000 order objects live in `all`, then again in the filtered copy. Memory grows with the size of the database, not with what the user sees.",
            "**No way to stop**: closing the panel does not stop the loop. It keeps hammering the API in the background until the last page.",
        ]),
        p("What the panel needs is a sequence that is **pulled** by the consumer: fetch a page when somebody asks for the next item, and stop the moment nobody asks any more. JavaScript has exactly that: async iterators."),
        callout("warning", "Arrays are the wrong shape for unbounded data",
            "Returning an array means: \"I have finished producing everything\". For a feed, a log, a search over an API or an export, the producer should not finish first - the consumer decides how much it needs."),

        h2("2. The async iteration protocol"),
        p("An object is **async iterable** when it has a `[Symbol.asyncIterator]()` method returning an **async iterator**: an object whose `next()` returns a promise of `{ value, done }`. Two optional methods matter for cleanup: `return()` (the consumer stopped early) and `throw()`."),
        code("javascript", `
// A hand-written async iterable over a numbered feed - no generator yet.
function countdown(from, delayMs) {
    return {
        [Symbol.asyncIterator]() {
            let current = from;
            return {
                async next() {
                    if (current < 0) return { value: undefined, done: true };
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                    return { value: current--, done: false };
                },
                async return() {
                    console.log("consumer stopped early");
                    return { value: undefined, done: true };
                },
            };
        },
    };
}

for await (const n of countdown(3, 100)) {
    console.log(n);          // 3, 2, 1 ...
    if (n === 1) break;      // ... break calls return()
}`),
        p("`for await...of` does four things for you: it calls `[Symbol.asyncIterator]()`, awaits every `next()`, stops when `done` is `true`, and calls `return()` when the loop is left early. It also works over plain sync iterables of promises (an array of `fetch` calls), awaiting each element in order."),
        callout("info", "Pull, not push",
            "Nothing happens between two next() calls. The consumer sets the pace: a slow renderer simply asks less often, and the producer does no work ahead of it. That is the property the incident was missing."),

        h2("3. Async generators: iterators without the boilerplate"),
        p("Writing `next()` and `return()` by hand is error-prone. An `async function*` builds the iterator for you: `await` works as usual, every `yield` hands one value to the consumer and then **suspends** the function until the next `next()` call."),
        code("javascript", `
// Offset/limit API (the older audit-log endpoint). The cursor API in the
// challenge below works the same way, with nextCursor instead of offset.
async function* auditLog({ pageSize = 200, signal } = {}) {
    let offset = 0;
    while (true) {
        const res = await fetch(\`/api/audit-log?offset=\${offset}&limit=\${pageSize}\`, { signal });
        if (!res.ok) throw new Error(\`audit-log HTTP \${res.status}\`);
        const rows = await res.json();

        for (const row of rows) yield row;   // suspends here until the consumer pulls again

        if (rows.length < pageSize) return;  // a short page is the last one
        offset += rows.length;
    }
}

for await (const entry of auditLog()) {
    if (entry.action === "refund.approved") {
        highlight(entry);
        break;                               // no further pages are requested
    }
}`, "auditLog.js"),
        bullets([
            "Calling `auditLog()` runs **none** of the body. It returns a generator object; the first request is sent on the first `next()`.",
            "Only one page is held in memory at a time: the `rows` of the current page.",
            "`yield*` delegates to another iterable, so `yield* rows` is a shorter form of the inner `for...of` loop.",
            "Errors are ordinary: a rejected `fetch` makes the pending `next()` reject, and the `for await` loop throws at the consumer.",
        ]),
        callout("tip", "Prefer cursors over offsets",
            "With offset pagination, a row inserted at the top while the user scrolls shifts every later page by one: you see a duplicate or skip a row. An opaque cursor (\"continue after id o-48213\") stays stable while data changes, and the server can serve it from an index."),

        h2("4. Early exit: break, return() and finally"),
        p("When the consumer leaves the loop with `break`, `return` or an exception, `for await` calls the generator's `return()`. The generator resumes at the suspended `yield` **as if a return statement stood there**: the code after the `yield` does not run, but every enclosing `finally` block does. That is where cleanup lives."),
        code("javascript", `
async function* liveOrders(signal) {
    const socket = new WebSocket("wss://example.com/orders");
    const inbox = createInbox(socket);          // buffers messages until pulled
    try {
        while (!signal.aborted) {
            yield await inbox.next();
        }
    } finally {
        socket.close();                          // runs on break, on throw and on normal end
        console.log("orders socket closed");
    }
}`),
        p("Two consequences are easy to miss in code review:"),
        numbered([
            "If you iterate **manually** with `it.next()` and stop calling it, nobody calls `return()`: the `finally` never runs and the socket stays open. Either use `for await`, or call `await it.return()` yourself in a `finally` of your own.",
            "A generator that has **never started** (no `next()` yet) has not entered its `try` block, so `return()` finishes it without running `finally`. Acquire resources inside the generator body, not before it is created.",
        ]),
        challenge("chal_quiz_js_411"),

        h2("5. Composing lazy helpers: map, filter, take"),
        p("Because each stage only pulls what the next stage asks for, small async generators can be chained into a pipeline - the async equivalent of `array.filter().map().slice()`, without materializing the arrays."),
        code("javascript", `
async function* map(source, fn) {
    for await (const item of source) yield fn(item);
}

async function* filter(source, predicate) {
    for await (const item of source) {
        if (await predicate(item)) yield item;
    }
}

// The panel, rebuilt as a pull-based pipeline
const rows = take(map(filter(paginate(fetchOrdersPage), isFlagged), toRow), 50);
for await (const row of rows) table.append(row);`, "pipeline.js"),
        image("lazy-pagination-pull", {
            alt: "A chain of for await, take(50), filter, map, paginate and the Orders API. next() calls travel toward the API and values travel back one at a time. Only pages 1 to 3 are fetched; page 4 to 1,900 are never requested. When take finishes, return() closes the chain and paginate's finally runs.",
            caption: "The consumer drives the pipeline. When take() has its 50 rows, the early exit propagates down the chain and no further page is requested.",
        }),
        p("The last stage, `take`, is the one that makes the pipeline finite, and it is surprisingly easy to get subtly wrong:"),
        bullets([
            "It must stop **before** asking the source for item n + 1. Pulling one extra item can mean one extra page request - for every open of the panel.",
            "It must leave its `for await` loop (not just stop yielding) so that `return()` reaches the source and the source's `finally` blocks run.",
            "`take(source, 0)` should not touch the source at all.",
        ]),
        challenge("chal_coding_js_412", "In paginate, loop until nextCursor is null - an empty items array is not the end. In take, decide whether you are done right after yielding, not at the top of the next iteration."),
        callout("info", "Built-in helpers",
            "Sync iterators gained helpers such as Iterator.prototype.map, filter and take in ES2025. The async versions are still a TC39 proposal, so for async iterables you either write these small generators yourself or use a library. Array.fromAsync(iterable) collects an async iterable into an array - use it only when the result is known to be small, or after take()."),

        h2("6. Production concerns"),
        h3("Cancellation"),
        p("Pass an `AbortSignal` into the generator and on to `fetch`. When the user closes the panel, aborting the signal rejects the in-flight request, the pending `next()` rejects, and the `for await` loop exits through its error path - with the generator's `finally` blocks running on the way out."),
        code("javascript", `
const controller = new AbortController();
panel.onClose(() => controller.abort());

try {
    const pages = paginate((cursor) => fetchOrdersPage(cursor, { signal: controller.signal }));
    for await (const row of take(filter(pages, isFlagged), 50)) table.append(toRow(row));
} catch (error) {
    if (error.name !== "AbortError") throw error;
}`),
        h3("Latency vs. laziness"),
        p("A strictly lazy generator waits for the network on every page boundary. If the UI renders the page faster than the API answers, you can prefetch **one** page ahead: start the next `fetchPage` before yielding the current items, and await it afterwards. Keep the look-ahead bounded - one page, not \"all pages in parallel\" - or you recreate the incident."),
        h3("One consumer per generator"),
        p("A generator object is a single-use cursor. Two components iterating the same object steal items from each other, and the first one to `break` closes it for both. Give each consumer its own `paginate(...)` call, or put an explicit queue between producer and consumers (the topic of a later lesson in this module)."),
        callout("tip", "\"Load more\" buttons",
            "Keep the iterator in component state and pull the next 50 when the user clicks: const batch = await Array.fromAsync(take(iterator, 50)). Because take() closes its source when it stops early, wrap the shared iterator so that return() is ignored for these partial reads, and close the real iterator when the component unmounts."),

        h2("7. Checklist"),
        bullets([
            "Unbounded or large collections from an API are async iterables, not arrays: the consumer decides how much to read.",
            "Write producers as `async function*`; fetch the next page only when the current page is used up.",
            "End on the server's signal (`nextCursor === null`, a short page), never on an empty page alone.",
            "Put cleanup (sockets, readers, locks) in `finally`, and acquire it inside the generator body.",
            "Consume with `for await`, so `break`, `return` and exceptions call `return()` for you; when iterating manually, call `it.return()` in your own `finally`.",
            "Make `take(n)` stop without pulling item n + 1; pass an `AbortSignal` through to `fetch` for cancellation.",
            "Prefetch at most a bounded number of pages, and never share one generator object between consumers.",
        ]),
    ],
});
