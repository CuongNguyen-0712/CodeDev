// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-4-1",
    title: "CPU-bound work: worker threads, cluster & chunking",
    slug: { _type: "slug", current: "cpu-bound-work-worker-threads-cluster-chunking" },
    description:
        "One fraud-scoring endpoint freezes every other request on the instance. Measure how long the event loop is blocked, then fix it three ways - chunking with setImmediate, a worker_threads pool and multiple processes - and learn which one fits which workload.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, risk & payments team of an e-commerce platform",
        problem:
            "Every night at 23:00 the risk dashboard re-scores the day's card transactions by calling POST /fraud/score-batch once per merchant group - about 300 calls, each spending ~400 ms of CPU. The endpoint lives in the same Node.js service as checkout. For the next two minutes the p99 of POST /payments jumps from 40 ms to over 2 seconds, the load balancer marks the instance unhealthy because /healthz stops answering, and customers in another time zone see \"Payment failed, please retry\". CPU on the 4-core VM shows 25% - one core pinned at 100%, three idle.",
    },

    content: [
        h2("1. The incident"),
        p("Nothing in the scoring handler is slow I/O. It loads the transactions once, then runs a scoring model over them in a plain loop:"),
        code("javascript", `
app.post("/fraud/score-batch", async (req, res) => {
    const transactions = await txRepo.findByDay(req.body.day); // I/O: fine, the loop is free
    const scores = transactions.map((tx) => model.score(tx));   // CPU: ~400 ms per batch
    await scoreRepo.saveMany(scores);
    res.json({ scored: scores.length });
});`, "src/routes/fraud.js"),
        p("`transactions.map(...)` is synchronous. While it runs, the single JavaScript thread executes nothing else: no new connection is accepted, no database result is processed, no timer fires. Every other request on that instance - checkout, health checks, webhooks - waits in the queue until the loop ends."),
        callout("warning", "25% CPU does not mean 75% headroom",
            "A Node.js process runs your JavaScript on one core. On a 4-core machine, one process pinned at 100% shows up as 25% total CPU. Look at per-process CPU and at event loop delay, not only at the machine average."),

        h2("2. Measure the blocking first"),
        p("Before fixing anything, prove where the time goes. The cheapest probe is a timer that should fire every 100 ms: if it fires late, something held the event loop for the difference."),
        code("javascript", `
const { performance } = require("node:perf_hooks");

const INTERVAL_MS = 100;
let expected = performance.now() + INTERVAL_MS;

setInterval(() => {
    const now = performance.now();
    const lagMs = now - expected;
    if (lagMs > 50) {
        console.warn(JSON.stringify({ msg: "event loop blocked", lagMs: Math.round(lagMs) }));
    }
    expected = now + INTERVAL_MS;
}, INTERVAL_MS).unref(); // unref: the probe never keeps the process alive`, "src/lagProbe.js"),
        p("Reproduce the incident locally: put load on the cheap endpoint and fire one batch at the same time."),
        code("bash", `
# terminal 1: steady checkout traffic
npx autocannon -c 20 -d 20 -m POST http://localhost:3000/payments/quote

# terminal 2: one scoring batch while the load test runs
curl -X POST localhost:3000/fraud/score-batch -H 'content-type: application/json' -d '{"day":"2026-10-15"}'

# find the hot function: writes a .cpuprofile you can open in Chrome DevTools
node --cpu-prof --cpu-prof-dir=./profiles src/server.js`),
        p("The probe logs a lag close to the batch duration, autocannon's latency table shows a long tail, and the CPU profile points straight at `model.score`. Lesson 4.3 shows how to turn this probe into a proper metric with `monitorEventLoopDelay`."),
        image("event-loop-blocking", {
            alt: "Three timelines of the same 400 ms scoring job and two payments: a blocking loop makes both payments wait until 400 ms; chunking lets each payment run between chunks; a worker pool runs scoring on another core so payments are served on arrival.",
            caption: "Same CPU work, three schedules. Only the time other requests spend waiting changes.",
        }),

        h2("3. Chunking: give the event loop a turn"),
        p("If the work can be split into small independent pieces, you can keep it on the main thread and simply stop holding the thread for too long. Process a slice, then let the event loop run everything that queued up meanwhile, then continue."),
        p("The yield must go through the **macrotask** queue. `setImmediate` schedules the continuation after pending I/O callbacks, so waiting requests get in. `process.nextTick` and `await Promise.resolve()` run before the event loop moves on - they look like a yield, but no I/O is processed in between."),
        code("javascript", `
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

// Time-sliced variant: run until the slice budget is used up, then yield.
async function mapWithTimeBudget(items, fn, budgetMs = 10) {
    const out = [];
    let sliceStart = performance.now();
    for (const item of items) {
        out.push(fn(item));
        if (performance.now() - sliceStart >= budgetMs) {
            await yieldToLoop();
            sliceStart = performance.now();
        }
    }
    return out;
}`, "src/lib/yield.js"),
        p("A time budget adapts to how expensive each item is. A fixed **chunk size** is easier to reason about and to test, and is fine when the cost per item is roughly constant. Either way, the worst extra wait for another request is one slice."),
        bullets([
            "Total CPU time does not shrink - the batch finishes a little later than before.",
            "It only works if the work can be split. One huge `JSON.parse`, a single regex on a 5 MB string or one `bcrypt` hash cannot be chunked.",
            "Pick slices of ~5-20 ms: smaller slices waste time on scheduling, larger ones show up in your p99.",
        ]),
        challenge("chal_coding_nhp_402", "Count items per chunk, not loop iterations since the start. Await the yield only between chunks, and only the injected yieldToLoop really gives the thread away."),

        h2("4. Worker threads: move the CPU off the event loop"),
        p("When the work is heavy or cannot be split, run it on another thread. `worker_threads` gives each worker its own V8 isolate and event loop inside the same process, so the main thread stays free for HTTP traffic and the idle cores do the scoring."),
        p("Do not create a `Worker` per request: starting one costs milliseconds and several MB of memory. Use a pool. `piscina` is the common choice:"),
        code("javascript", `
// src/workers/scoreBatch.js - runs inside a worker thread
const { loadModel } = require("../risk/model");
const model = loadModel(); // loaded once per worker, reused for every task

module.exports = function scoreBatch({ transactions }) {
    return transactions.map((tx) => model.score(tx));
};`, "src/workers/scoreBatch.js"),
        code("javascript", `
// src/routes/fraud.js
const path = require("node:path");
const os = require("node:os");
const Piscina = require("piscina");

const pool = new Piscina({
    filename: path.resolve(__dirname, "../workers/scoreBatch.js"),
    maxThreads: Math.max(1, os.availableParallelism() - 1), // leave a core for the event loop
    maxQueue: 50,                                         // bounded: reject instead of piling up
});

app.post("/fraud/score-batch", async (req, res) => {
    const transactions = await txRepo.findByDay(req.body.day);
    try {
        const scores = await pool.run({ transactions });
        await scoreRepo.saveMany(scores);
        res.json({ scored: scores.length });
    } catch (err) {
        if (err.message.includes("queue is at limit")) return res.status(503).json({ error: "SCORING_BUSY" });
        throw err;
    }
});`, "src/routes/fraud.js"),
        callout("info", "Data is copied, not shared",
            "Arguments and results cross the thread boundary with the structured clone algorithm. Sending 40,000 objects costs real time on both sides. Send ids or compact typed arrays, transfer ArrayBuffers instead of copying them, or let the worker load its own data from the database."),
        callout("tip", "Some 'async' APIs already use threads",
            "crypto.pbkdf2, crypto.scrypt, zlib.gzip and fs run on the libuv thread pool (4 threads by default, UV_THREADPOOL_SIZE). Always use their async versions on the request path - the *Sync variants block the event loop exactly like a hand-written loop."),

        h2("5. Cluster and processes: more event loops for throughput"),
        p("Worker threads fix one heavy job. When the whole service is CPU-hungry - lots of JSON, templating, TLS - you want more event loops serving requests. `node:cluster` forks one process per core; the primary distributes incoming connections on the shared port."),
        code("javascript", `
const cluster = require("node:cluster");
const os = require("node:os");

if (cluster.isPrimary) {
    const workers = os.availableParallelism();
    for (let i = 0; i < workers; i++) cluster.fork();

    cluster.on("exit", (worker, code, signal) => {
        console.error(JSON.stringify({ msg: "worker died", pid: worker.process.pid, code, signal }));
        cluster.fork(); // keep capacity
    });
} else {
    require("./server"); // each process runs the full app with its own heap and event loop
}`, "src/cluster.js"),
        bullets([
            "Processes share nothing: in-memory caches, rate limiters and locks are per process. Shared state belongs in Redis or the database (lesson 1.1).",
            "Cluster multiplies throughput, but a 400 ms job still blocks every request that lands on the same process.",
            "In Kubernetes, prefer one Node.js process per container and scale with replicas and CPU requests; the platform then restarts, balances and drains each process for you. On a plain VM, cluster or PM2 does the same job.",
        ]),

        h2("6. Choosing the right tool"),
        numbered([
            "**Is it really CPU?** Profile first. Slow queries and slow HTTP calls are I/O - they do not block the loop and none of these tools helps.",
            "**Small, splittable, occasional work** (a report over a few thousand rows): chunk it with `setImmediate` and keep it on the main thread.",
            "**Heavy or unsplittable work** (scoring models, image resize, PDF generation, big JSON): a `worker_threads` pool with a bounded queue.",
            "**The whole service is CPU-bound under load**: more processes - cluster on a VM, replicas in Kubernetes.",
            "**Very heavy or long jobs** (minutes): take them off the request path entirely - put a job on a queue and let separate worker services process it.",
        ]),
        challenge("chal_quiz_nhp_401"),

        h2("7. Checklist"),
        bullets([
            "Track event loop delay per instance and alert on it; machine CPU averages hide one pinned core.",
            "Profile with `--cpu-prof` before choosing a fix, and keep *Sync APIs off the request path.",
            "Chunk splittable work with a macrotask yield (`setImmediate`), never `process.nextTick` or a resolved promise.",
            "Run heavy CPU in a reusable worker pool sized to the spare cores, with a bounded queue that fails fast.",
            "Keep payloads to workers small; transfer buffers instead of cloning large object graphs.",
            "Scale throughput with processes (cluster or replicas) and keep shared state outside the process.",
        ]),
    ],
});
