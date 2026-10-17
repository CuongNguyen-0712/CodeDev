// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-1-2",
    title: "The event loop under server load",
    slug: { _type: "slug", current: "event-loop-under-server-load" },
    description:
        "During a flash sale, one merchant upload freezes checkout for everyone, carts make 40 sequential queries, a report says merchants earned 0 and a failed email crashes every pod. Learn what blocks the event loop, how to batch N+1 calls, and how to keep async errors from taking the process down.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, order platform of an e-commerce marketplace",
        problem:
            "11:00, flash sale. p99 of POST /checkout climbs from 90 ms to 4 s while each pod shows one core at 100%. Traces show a merchant uploading a 60 MB product feed that the API parses inline, GET /cart running one SELECT per cart line (a 40-item cart is 40 sequential round trips), and the settlement preview telling merchants they earned 0. At 11:07 the mail provider goes down, a fire-and-forget receipt email rejects, and the pods crash one after another.",
    },

    content: [
        h2("1. The incident"),
        p("None of the handlers involved is slow on its own in a load test with one user. Here are two of them, simplified:"),
        code("javascript", `
// Merchant product feed: up to 100 MB of JSON, parsed by the body parser
app.post("/merchant/feed", express.json({ limit: "100mb" }), async (req, res) => {
    await feeds.save(req.user.merchantId, req.body.products);
    res.status(202).end();
});

// Cart: one product lookup per line, one after another
app.get("/cart/:id", async (req, res) => {
    const cart = await carts.findById(req.params.id);
    const lines = [];
    for (const item of cart.items) {
        const product = await products.findById(item.productId);
        lines.push({ ...item, name: product.name, priceCents: product.priceCents });
    }
    res.json({ ...cart, lines });
});`, "routes.js"),
        p("The first one blocks: parsing 60 MB of JSON takes several hundred milliseconds of pure CPU, and while it runs **no other request on that process makes progress**. The second one does not block at all - but it turns one page view into 41 sequential round trips and holds a pool connection the whole time. Add an async callback nobody waits for and a promise rejection nobody handles, and you have the whole incident."),
        callout("warning", "Fast alone, slow together",
            "Event loop problems hide in single-user tests. A 300 ms synchronous step is invisible when one person uses the API, and adds 300 ms to every concurrent request when a thousand people do."),

        h2("2. How the event loop schedules your code"),
        p("Node.js runs your JavaScript on a single thread. Work that waits - sockets, files, timers, database replies - is handed to the operating system or libuv's thread pool, and when it completes a **callback** is queued. The event loop picks those callbacks up phase by phase:"),
        image("event-loop-phases", {
            alt: "The five event loop phases - timers, pending, poll, check, close - in a cycle, with the microtask queues (process.nextTick, then promise jobs) drained after every callback, and a note that synchronous code blocks every phase.",
            caption: "Macrotasks wait for their phase. Microtasks run as soon as the current callback returns - nextTick first, then promises.",
        }),
        bullets([
            "**timers** - `setTimeout` and `setInterval` callbacks whose delay has passed. A delay is a minimum: a busy loop fires them late.",
            "**poll** - completed I/O: new connections, request bodies, database driver replies. Every HTTP request you serve starts here.",
            "**check** - `setImmediate` callbacks, which run right after the poll phase.",
            "**Microtasks** are not a phase. After every callback, Node drains the `process.nextTick` queue, then the promise job queue (`.then` callbacks and the code after each `await`), and only then lets the loop continue.",
        ]),
        p("For a server, the important consequence is that each request handler is a chain of callbacks. The code between two `await`s runs without interruption; at each `await` the handler parks and the loop is free to serve someone else. Throughput depends on keeping those uninterrupted stretches short."),

        h2("3. One slow handler stalls every request"),
        p("Before reading on, decide which of these hurt one request and which hurt all of them:"),
        challenge("chal_quiz_nhp_111"),
        p("Synchronous work is never interrupted. While it runs, no socket is read, no timer fires and no database reply is processed - including replies for other requests that are already sitting in the kernel. Slow **I/O** delays only the request that awaits it; slow **CPU** delays every request on the process."),
        p("Typical offenders in payment and e-commerce backends:"),
        bullets([
            "`JSON.parse` / `JSON.stringify` on multi-megabyte payloads: product feeds, settlement files, webhooks with a full order history, `res.json()` of a huge report.",
            "Synchronous crypto on the request path: `crypto.pbkdf2Sync`, `scryptSync`, `bcrypt.hashSync` for every login or PIN check. Use the async variants, which run on the thread pool.",
            "Regular expressions with catastrophic backtracking on user input (ReDoS).",
            "Building a CSV, PDF or report of tens of thousands of rows in one loop.",
            "`fs.readFileSync` and other `*Sync` APIs outside of startup code.",
        ]),
        code("javascript", `
// Looks harmless, but nested quantifiers backtrack exponentially on a near-miss:
const SKU = /^([A-Z0-9]+-?)+$/;

SKU.test("AB-12-CD-34");                    // fast
SKU.test("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123!"); // tens of seconds of CPU - one request freezes the instance

// Same intent, linear time: no ambiguous nesting
const SKU_SAFE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;`),
        h3("Starving the loop without blocking it"),
        p("A callback does not have to be slow to starve the server. `process.nextTick` callbacks and promise jobs run before the loop may move on, and the queues are drained until they are empty. Code that keeps queuing more microtasks - a self-rescheduling `nextTick`, or a recursive async function that never awaits real I/O - keeps the loop out of the poll phase forever, even though each callback is tiny. Work that should repeat belongs in `setImmediate` or a timer, which go back through the loop."),
        h3("Measure it, then fix it"),
        p("`monitorEventLoopDelay` samples how late the loop is running. Export its p99 next to your HTTP latency: when they rise together, the cause is CPU on the main thread, not the database."),
        code("javascript", `
import { monitorEventLoopDelay } from "node:perf_hooks";

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

setInterval(() => {
    metrics.gauge("event_loop_delay_p99_ms", loopDelay.percentile(99) / 1e6); // ns -> ms
    loopDelay.reset();
}, 10_000).unref();`, "lib/metrics.js"),
        p("Then pick the fix that matches the work:"),
        bullets([
            "**Do not do it at all on the request path**: stream large uploads to object storage and parse them in a background job; cap body sizes (`express.json({ limit: \"1mb\" })`) on public endpoints.",
            "**Use the async API**: `crypto.pbkdf2`, `crypto.scrypt`, `fs.promises` run on libuv's thread pool instead of the main thread.",
            "**Chunk and yield**: split long loops and `await setImmediate()` from `node:timers/promises` between chunks so pending requests get a turn.",
            "**Move it to a worker thread** when it is genuinely CPU-heavy - lesson 4.1 covers worker pools.",
        ]),
        callout("tip", "Yield with setImmediate, not a resolved promise",
            "await Promise.resolve() or await null only queues a microtask - the loop still cannot reach the poll phase. Yielding with setImmediate puts the rest of the work behind the I/O callbacks that are already waiting."),

        h2("4. Async callbacks nobody waits for"),
        p("`await` parks a handler; it does not make array helpers asynchronous. `forEach`, `map`, `filter` and `reduce` call your callback synchronously and move on. An `async` callback returns a promise straight away, and these helpers do nothing with it."),
        code("javascript", `
// Looks like it waits for every fee. It waits for none of them.
let total = 0;
orders.forEach(async (order) => {
    total += await gateway.getFee(order.id);
});
console.log(total); // 0 - the callbacks are parked at their first await`),
        bullets([
            "`forEach(async ...)` throws the promises away: code after the loop runs before any callback resumed, and a rejection inside becomes an unhandled rejection.",
            "`await items.forEach(...)` does not help - `forEach` returns `undefined`, and awaiting `undefined` only yields once.",
            "`map(async ...)` returns an array of promises, which is useful: pass it to `Promise.all` and await the result.",
            "`reduce(async ...)` turns the accumulator into a promise; forgetting to await it inside produces values like `[object Promise]500`.",
            "`for...of` with `await` inside is the sequential option, and the right one when steps must happen in order.",
        ]),
        callout("error", "Lint for it",
            "@typescript-eslint/no-misused-promises (checksVoidReturn) flags an async callback passed where a void function is expected - exactly the forEach case - and @typescript-eslint/no-floating-promises flags promises that are neither awaited nor handled."),
        challenge("chal_fix_nhp_112"),

        h2("5. Sequential awaits and the N+1 problem"),
        p("A handler that awaits independent calls one by one pays the sum of their latencies. When the calls do not depend on each other, start them together:"),
        code("javascript", `
// ~3 x 15 ms: each call waits for the previous one for no reason
const customer = await customers.findById(order.customerId);
const rate = await fx.getRate(order.currency);
const risk = await fraud.score(order);

// ~15 ms: start all three, then wait for all three
const [customer2, rate2, risk2] = await Promise.all([
    customers.findById(order.customerId),
    fx.getRate(order.currency),
    fraud.score(order),
]);`),
        p("The cart handler has a worse version of the problem: **N+1 queries**, one query for the cart plus one per line. Running the 40 lookups in parallel with `Promise.all` cuts the latency but still sends 40 queries and grabs up to 40 pool connections for a single page view. The real fix is one query for all of them:"),
        code("sql", `
SELECT id, name, price_cents
FROM products
WHERE id = ANY($1);   -- $1 = ['p1', 'p2', ..., 'p40']`),
        p("Rows come back in any order and missing ids are simply absent, so the caller must map them back by id. Rewriting every call site to collect ids first is not always practical - lookups are scattered across helpers, serializers and GraphQL resolvers. A **batch loader** (the pattern popularised by Facebook's DataLoader) lets each call site keep calling `load(id)` while the loader turns all loads made in the same tick into one query:"),
        numbered([
            "`load(key)` stores the key with a pending promise and returns that promise.",
            "The first key of a new batch schedules a flush with `queueMicrotask`. Microtasks run only after the current synchronous code finishes, so every `load` made by `Promise.all(items.map(...))` - or by any other code in the same run - joins the batch.",
            "At flush time the loader takes the unique keys, splits them into chunks of `maxBatchSize` (an `IN` list of 50,000 ids is its own incident) and calls `batchFn(keys)` once per chunk.",
            "`batchFn` resolves to values aligned with its keys. Each pending promise is settled from its key's position: a value resolves it, an `Error` instance rejects only that key's callers, and a rejected `batchFn` rejects the whole chunk.",
        ]),
        code("javascript", `
// One loader per request: batching stays within the request, nothing leaks between users
app.use((req, res, next) => {
    req.loaders = {
        product: createBatchLoader(async (ids) => {
            const rows = await db.query("SELECT id, name, price_cents FROM products WHERE id = ANY($1)", [ids]);
            const byId = new Map(rows.map((row) => [row.id, row]));
            return ids.map((id) => byId.get(id) ?? new Error(\`NOT_FOUND:\${id}\`));
        }, { maxBatchSize: 500 }),
    };
    next();
});

// The cart handler: 40 load() calls in the same tick -> 1 query
const products = await Promise.all(cart.items.map((item) => req.loaders.product.load(item.productId)));`),
        challenge("chal_coding_nhp_113", "Keep one Map per pending batch (key -> its promise and resolve/reject) and create a new Map when the flush starts. Settle each key from its position in the batchFn result."),
        callout("info", "Batching is not caching",
            "The DataLoader library also memoizes keys for the lifetime of the loader, which is why it should be created per request. If you want results shared across requests, that is a cache with invalidation rules - a separate decision covered in lesson 3.2."),

        h2("6. Errors in concurrent code"),
        p("Once several promises are in flight at the same time, error handling changes. Test your intuition first:"),
        challenge("chal_quiz_nhp_114"),
        p("Choose the combinator by what you need to know when something fails:"),
        bullets([
            "`Promise.all` - fail fast. Rejects with the first error; you lose the results of everything else, but that work keeps running.",
            "`Promise.allSettled` - waits for everything and returns `{ status, value | reason }` per item. The right tool for jobs that must report every outcome.",
            "`Promise.any` - the first success wins; it rejects with an `AggregateError` only if all of them fail.",
            "`Promise.race` - the first to settle wins. Mostly used for timeouts, together with an `AbortController` so the loser is actually stopped.",
        ]),
        code("javascript", `
const outcomes = await Promise.allSettled(refunds.map((r) => provider.refund(r)));

outcomes.forEach((outcome, i) => {
    if (outcome.status === "rejected") {
        logger.error({ refundId: refunds[i].id, err: outcome.reason }, "refund failed");
        reconcileQueue.add({ refundId: refunds[i].id }); // check with the provider, do not guess
    }
});`),
        h3("Unhandled rejections crash the process"),
        p("A promise that rejects while nobody has attached a handler is an **unhandled rejection**. Since Node.js 15 the default is to treat it like an uncaught exception: the process exits, and every request in flight on that instance fails with it. During the flash sale, every pod sent receipt emails the same way, so every pod crashed as soon as the mail provider went down:"),
        code("javascript", `
// Bad: if the mail provider is down, this rejection kills the API process
sendReceiptEmail(order);

// Better: fire-and-forget, but owned (or push it to a queue - lesson 2.3)
sendReceiptEmail(order).catch((err) =>
    logger.warn({ orderId: order.id, err }, "receipt email failed")
);

// Last resort: log loudly and exit so the orchestrator replaces the instance
process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "unhandled rejection");
    process.exit(1);
});`),
        callout("warning", "Do not resume after an unhandled rejection",
            "A global handler that logs and keeps serving hides the bug and may leave half-finished state behind (a paid order without a ledger row). Log it, stop taking traffic and let the instance restart - lesson 4.2 shows how to drain in-flight requests first."),

        h2("7. Checklist"),
        bullets([
            "Keep the code between two `await`s short: no multi-megabyte `JSON.parse`, sync crypto, backtracking regexes or `*Sync` I/O on the request path.",
            "Track event loop delay p99 next to HTTP latency; when both rise together, profile the main thread.",
            "Never reschedule work with a recursive `process.nextTick` or promise chain; use `setImmediate` or a timer so I/O gets its turn.",
            "Never pass an `async` callback to `forEach`; use `map` + `Promise.all` or a `for...of` loop.",
            "Run independent awaits together, and replace N+1 lookups with one `WHERE id = ANY($1)` query or a per-request batch loader with a `maxBatchSize`.",
            "Use `Promise.allSettled` for batches that must report every outcome; a rejected call may still have been executed.",
            "Every promise is awaited or has a `.catch()`; treat an unhandled rejection as a crash, not a warning.",
        ]),
    ],
});
