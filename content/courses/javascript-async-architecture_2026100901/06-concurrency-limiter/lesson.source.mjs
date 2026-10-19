// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-2-3",
    title: "Building a concurrency limiter (worker pool)",
    slug: { _type: "slug", current: "building-a-concurrency-limiter-worker-pool" },
    description:
        "Promise.all(files.map(upload)) starts 2,000 uploads at once: requests time out in the browser's own queue, the API answers 429 and the tab runs out of memory. Learn why a limiter must schedule tasks instead of promises, build a worker pool that keeps N tasks in flight, returns results in input order, fails fast or collects every outcome, and supports cancellation.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, listing editor of a real-estate marketplace",
        problem:
            "Agents prepare listings by dropping whole photo shoots into the browser - 300 photos is normal, 2,000 happens. Since the new bulk uploader shipped, large drops end with 1,400 of 2,000 photos marked \"failed\", the presigned-URL API rate-limits the agency's office IP for ten minutes, and Chrome shows \"Aw, Snap! Out of memory\" on older laptops. Small drops of 20 photos work perfectly, which is why nobody caught it in QA.",
    },

    content: [
        h2("1. The incident"),
        p("The uploader resizes each photo in the browser, asks the API for a presigned URL, and uploads the blob straight to object storage. Written as one async function per photo and joined with `Promise.all`, it looks like textbook code:"),
        code("javascript", `
async function uploadPhoto(file) {
    const blob = await resizeToJpeg(file, { maxWidth: 2560 });     // ~1.5 MB in memory
    const { url } = await api.post("/photos/presign", { name: file.name });
    const res = await fetch(url, {
        method: "PUT",
        body: blob,
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return url.split("?")[0];
}

const urls = await Promise.all(files.map(uploadPhoto));`, "bulkUpload.js"),
        p("With 20 photos this finishes in a few seconds. With 2,000, every step of every upload is started in the same instant, and each layer below the code pushes back in its own way. Before reading the details, predict what actually happens:"),
        challenge("chal_quiz_js_231"),

        h2("2. Why \"everything at once\" breaks"),
        p("`Promise.all` does not run anything - it only waits. The decision to start 2,000 operations was made by `files.map(uploadPhoto)`, and nothing in the stack is designed to absorb that:"),
        bullets([
            "**The browser's connection limit.** Over HTTP/1.1 a browser opens about 6 connections per origin; the remaining requests wait in an internal queue. Over HTTP/2 everything shares one connection, and the server's stream limit (often 100-128) decides how many run at once.",
            "**Timeouts count queue time.** `AbortSignal.timeout(30_000)` starts when `fetch` is called. A request that waits 40 seconds in the browser's queue fails with `TimeoutError` without ever being sent - that is where most of the 1,400 failures came from.",
            "**Memory is spent up front.** All 2,000 resize steps run immediately, so 2,000 blobs of about 1.5 MB exist at the same time - 3 GB before the first upload has finished.",
            "**Rate limits.** 2,000 presign calls within a second trip the API's limit of 100 requests per second per IP; the API answers 429 and blocks the office for ten minutes.",
            "**Everything else waits too.** The listing page's own API calls queue behind 2,000 uploads to the same origin, so the editor looks frozen while the upload \"runs in the background\".",
        ]),
        p("The fix is not to make each step faster, but to bound how many uploads are **in flight** at any moment - a concurrency limiter, also called a **worker pool**: N slots, a queue of waiting tasks, and a rule that a task starts only when a slot is free."),
        callout("info", "Concurrency limit vs rate limit",
            "A concurrency limit caps how many operations run at the same time; a rate limit caps how many start per second. They are related by Little's law: in-flight = rate x latency. With a 300 ms presign call and a limit of 100 req/s, up to 30 calls may be in flight. A limiter of 4-6 uploads stays far below that and leaves the browser room for the rest of the app."),

        h2("3. Tasks, not promises"),
        p("A promise represents an operation that has **already started**. Once you hold 2,000 promises, it is too late to limit anything - you can only choose which ones to wait for. A limiter therefore has to receive **tasks**: functions that start the work when called. The smallest useful shape is the p-limit style API:"),
        code("javascript", `
function createLimiter(maxInFlight) {
    let active = 0;
    const waiting = [];                         // start functions of queued tasks

    function next() {
        if (active >= maxInFlight || waiting.length === 0) return;
        active += 1;
        waiting.shift()();
    }

    return function limit(task) {
        return new Promise((resolve, reject) => {
            waiting.push(() => {
                new Promise((res) => res(task()))   // a synchronous throw becomes a rejection
                    .then(resolve, reject)
                    .finally(() => {
                        active -= 1;
                        next();                     // a slot is free: start the next task
                    });
            });
            next();
        });
    };
}

const limit = createLimiter(4);
const urls = await Promise.all(files.map((file) => limit(() => uploadPhoto(file))));`, "createLimiter.js"),
        p("Note the arrow function: `limit(() => uploadPhoto(file))` hands over a task, while `limit(uploadPhoto(file))` would start the upload immediately and defeat the limiter. And because a slot is refilled the moment it frees up, one slow photo never holds back the others - unlike splitting the files into batches and awaiting each batch:"),
        image("worker-pool-slots", {
            alt: "Eight tasks T0 to T7 with durations between 1 and 4 seconds run three ways. Promise.all starts all eight at second 0 and finishes at 4. Batches of three wait for the slowest task of each batch and finish at 9. A pool with limit 3 refills each slot as soon as it frees up, never has more than three tasks in flight and finishes at 6.",
            caption: "Batches leave slots idle while they wait for their slowest task. A pool keeps every slot busy and still never exceeds the limit.",
        }),

        h2("4. Results in order, and an error policy you choose"),
        p("`createLimiter` plus `Promise.all` already returns results in input order and limits concurrency. What it does not do is decide what happens when an upload fails - and here the defaults are wrong for a bulk uploader:"),
        bullets([
            "`Promise.all` rejects on the first failure, but the limiter keeps draining its queue: **1,999 uploads continue** for a result nobody is waiting for any more.",
            "Switching to `Promise.allSettled` keeps every outcome, but there is no way to stop early when the failure means \"the session expired\" and every following upload will fail too.",
        ]),
        p("A worker pool for a batch of items should make the policy explicit:"),
        numbered([
            "**Fail fast** (`stopOnError: true`): reject with the first error **and start no further tasks**. Tasks already in flight are left to finish (or aborted - section 5). Right when one failure invalidates the batch: authentication errors, a full storage quota, a form that is submitted as a whole.",
            "**Collect** (`stopOnError: false`): never reject; return one `{ status, value | reason }` entry per item, in input order. Right for independent items, where the UI shows \"1,986 uploaded, 14 failed - retry failed\".",
        ]),
        code("javascript", `
const outcomes = await mapWithConcurrency(files, 4, (file) => uploadPhoto(file), { stopOnError: false });

const failed = files.filter((_, i) => outcomes[i].status === "rejected");
showSummary({ uploaded: files.length - failed.length, failed: failed.length });
retryButton.onclick = () => mapWithConcurrency(failed, 4, (file) => uploadPhoto(file), { stopOnError: false });`, "bulkUpload.js"),
        p("Results in input order are what make that retry possible: `outcomes[i]` always belongs to `files[i]`, no matter which upload finished first. Now build the pool itself."),
        challenge("chal_coding_203", "Keep a nextIndex, a running counter and a results array. A startMore() loop starts tasks while running < limit and items remain - and stops for good once fail-fast has rejected. Call it once at the start and again whenever a task settles; store each result at its own index. Do not forget the empty list."),

        h2("5. Cancellation and backpressure"),
        p("A bulk upload of 2,000 photos takes minutes. The user will close the dialog, navigate away or go offline in the middle of it, and the pool has to react. Pass an `AbortSignal` to every task, and check it before starting new ones:"),
        code("javascript", `
const controller = new AbortController();
cancelButton.addEventListener("click", () => controller.abort());

const outcomes = await mapWithConcurrency(
    files,
    4,
    async (file) => {
        controller.signal.throwIfAborted();                 // queued tasks never start
        return uploadPhoto(file, { signal: controller.signal });  // running ones are aborted
    },
    { stopOnError: false },
);`, "bulkUpload.js"),
        bullets([
            "**Stop starting, abort what runs.** `throwIfAborted()` makes every task that is still queued fail instantly with an `AbortError`; passing the same signal to `fetch` cancels uploads that are on the wire. Inside `uploadPhoto`, combine it with the per-request timeout using `AbortSignal.any`, as in lesson 2.1.",
            "**Separate cancelled from failed.** In the summary, outcomes whose reason is an `AbortError` are \"cancelled\", not \"failed\" - nobody wants a red error badge for pressing Cancel.",
            "**Report progress from the task.** Increment a counter when a task settles and update the progress bar at most once per frame - the throttling idea from lesson 5.1.",
            "**React to 429 by slowing down.** If the API answers `429 Too Many Requests`, a fixed limit is too high. Honour `Retry-After`, and retry with backoff and jitter (lesson 3.3) instead of hammering the same limit again.",
        ]),
        callout("tip", "Pools and queues work together",
            "A worker pool bounds how much runs at once. When items are produced over time instead of all being known up front - photos still being resized, messages arriving from a socket - put a bounded async queue in front of the pool (lesson 4.3) so the producer also slows down. The capstone (lesson 6.3) uses the same pool idea with one lane per record."),

        h2("6. Choosing the limit"),
        bullets([
            "**Uploads and downloads to one origin**: 3-6. Over HTTP/1.1, stay below the browser's 6 connections so the app's own requests still get through; over HTTP/2 a few more are fine, but large bodies compete for the same bandwidth anyway.",
            "**API calls with a known rate limit**: in-flight = rate x latency, minus a safety margin for other tabs and users behind the same IP.",
            "**CPU-heavy work in Web Workers** (resizing, hashing, parsing): `navigator.hardwareConcurrency - 1` workers, so the main thread keeps a core.",
            "**Expensive steps before the network call**: limit the whole task, not only the `fetch` - otherwise 2,000 resizes still run at once and fill memory.",
            "**Measure, then tune**: watch p95 task duration and error rate while increasing the limit. When the duration grows but throughput does not, you passed the bottleneck.",
        ]),

        h2("7. Checklist"),
        bullets([
            "No `Promise.all(items.map(asyncFn))` over input whose size the user controls - large fan-outs go through a worker pool.",
            "The limiter receives tasks (functions) and starts them itself; it never receives promises that are already running.",
            "A free slot is refilled immediately; batches that wait for their slowest member are not a substitute.",
            "Results come back in input order, so each outcome can be matched to its item and failed items can be retried.",
            "The error policy is explicit: fail fast stops starting new tasks, collect mode returns an outcome per item.",
            "Every task receives an `AbortSignal`; cancellation stops queued tasks and aborts running ones, and is reported as \"cancelled\", not \"failed\".",
            "The limit is chosen from connection limits, rate limits and memory, and lowered when the server answers 429.",
        ]),
    ],
});
