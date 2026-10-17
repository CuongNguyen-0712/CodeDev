// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-5-2",
    title: "Scheduling work: priorities & time slicing",
    slug: { _type: "slug", current: "scheduling-work-priorities-time-slicing" },
    description:
        "A filter click that runs 400 ms of JavaScript in one go makes the whole page feel broken. Learn how long tasks hurt INP, how to yield to the main thread with scheduler.yield, setTimeout and MessageChannel, when to use requestAnimationFrame or requestIdleCallback, and build a priority scheduler that slices work on a deadline.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, analytics dashboard team",
        problem:
            "Real-user monitoring flags the Reports page: Interaction to Next Paint is 640 ms at p75, and users on mid-range laptops say the \"Apply filter\" button \"does nothing for a second\". The click handler filters 20,000 rows, rebuilds the pivot table and re-renders the charts in one synchronous run. While it runs, the spinner never appears, typing in the search box is dropped and a background prefetch of next month's data competes for the same thread.",
    },

    content: [
        h2("1. The incident: one click, one long task"),
        p("Everything your page does in JavaScript runs on the main thread, and the main thread is also where the browser handles input, runs style and layout, and paints. The browser can only do those between tasks. The filter handler is one task:"),
        code("javascript", `
applyButton.addEventListener("click", () => {
    spinner.hidden = false;
    const rows = filterRows(allRows, criteria); // ~250 ms
    const pivot = buildPivot(rows);             // ~100 ms
    renderTable(pivot);                         // ~50 ms
    spinner.hidden = true;
});`, "reports-page.js"),
        p("For the next 400 ms the browser cannot run the `keydown` handlers of the search box or anything else queued behind this task. To the user, the page is frozen."),
        bullets([
            "A **long task** is any task over **50 ms**. DevTools marks them with red corners in the Performance panel, and the Long Animation Frames API reports them in production.",
            "**Interaction to Next Paint (INP)** measures how long it takes from an interaction (click, tap, key press) until the next frame is painted, for nearly the worst interaction of a visit. Under **200 ms** is good, over **500 ms** is poor.",
            "INP is the sum of input delay (the main thread was busy when the click arrived), processing time (your handlers) and presentation delay (style, layout, paint). Long tasks inflate all three.",
        ]),
        callout("info", "This lesson builds on the event loop basics",
            "You already broke a long loop into chunks in the event loop lesson. Here the focus is production scheduling: measuring the budget, choosing how to yield, and deciding which work goes first."),

        h2("2. Yielding to the main thread"),
        p("**Yielding** means ending the current task on purpose and continuing in a new one, so that input and rendering can run in the gap. There are three ways to schedule the continuation, and they behave differently:"),
        bullets([
            "**`scheduler.yield()`** - returns a promise that resolves in a new task. The continuation is **prioritized**: it runs before other queued tasks of the same priority, so your job is not pushed behind every other script on the page. Available in Chromium-based browsers; feature-detect it.",
            "**`setTimeout(resolve, 0)`** - works everywhere, but the continuation goes to the back of the queue, and after five nested timers browsers clamp the delay to at least 4 ms. Yielding 200 times can cost close to a second of pure waiting.",
            "**`MessageChannel`** - `port.postMessage()` queues a task without the 4 ms clamp. React's scheduler uses this for exactly that reason.",
        ]),
        code("javascript", `
const channel = new MessageChannel();
const pending = [];
channel.port1.onmessage = () => pending.shift()?.();

export function yieldToMain() {
    if (globalThis.scheduler?.yield) return scheduler.yield();
    return new Promise((resolve) => {
        pending.push(resolve);
        channel.port2.postMessage(null);
    });
}`, "yield-to-main.js"),
        callout("warning", "Microtasks do not yield",
            "await Promise.resolve() or queueMicrotask() gives control back to the microtask queue, not to the browser. Rendering and input wait until the microtask queue is empty, so a loop that awaits a resolved promise between items is still one long task."),
        h3("Slice by deadline, not by item count"),
        p("Yielding after every item is responsive but slow: each yield costs a task switch, and items have very different costs. Yielding every N items is fragile: 100 cheap rows take 2 ms, 100 rows with charts take 300 ms. The robust approach is a **time budget**: run items until the slice has used its budget, then yield and start a fresh slice."),
        image("time-slicing-main-thread", {
            alt: "Two main-thread timelines. Before: one 400 ms long task delays the click handler and paint by about 365 ms. After: the same work split into 45 ms slices lets the click run and paint within about 50 ms.",
            caption: "Slicing does not make the work faster. It makes room for input and frames between slices.",
        }),
        code("javascript", `
async function processRows(rows) {
    const BUDGET_MS = 40;
    let sliceStart = performance.now();
    for (const row of rows) {
        processRow(row);
        if (performance.now() - sliceStart >= BUDGET_MS) {
            // give input and rendering a chance, then start a new slice
        }
    }
}`),
        p("A budget of 30-50 ms keeps each task under the long-task threshold while keeping task-switch overhead small. Pass the clock and the yield function in as parameters and the loop becomes easy to test - which is how the next exercise works."),
        challenge("chal_fix_js_521", "Two things must happen at a yield point: the loop must actually wait for the next task, and the next slice must get a fresh budget."),

        h2("3. requestAnimationFrame, requestIdleCallback and postTask"),
        p("Yielding answers \"how do I let the browser in?\". The next question is \"when should this piece of work run?\" - and the browser offers a slot for each kind of work:"),
        bullets([
            "**`requestAnimationFrame(cb)`** runs right before the next paint. Use it for visual updates that must land in the next frame: following the pointer, animating, applying a batch of DOM writes. It is paused in background tabs, so never use it for work that must complete.",
            "**`requestIdleCallback(cb, { timeout })`** runs when the browser has nothing else to do in a frame, and gives you `deadline.timeRemaining()` (at most 50 ms). Use it for low-value work: analytics batches, prefetching, warming caches. Always pass a `timeout`, or a busy page may never run it - and check support, since not every browser ships it.",
            "**`scheduler.postTask(cb, { priority })`** queues a task with one of three priorities: `\"user-blocking\"`, `\"user-visible\"` (the default) and `\"background\"`. It also takes a `signal` from a `TaskController`, so you can abort or re-prioritize queued work.",
        ]),
        code("javascript", `
applyButton.addEventListener("click", async () => {
    spinner.hidden = false;
    await yieldToMain();                       // let the spinner paint first

    const rows = await filterRowsSliced(allRows, criteria);
    requestAnimationFrame(() => renderTable(buildPivot(rows)));

    requestIdleCallback(() => analytics.flush(), { timeout: 2000 });
});`, "reports-page.js"),
        challenge("chal_quiz_js_522"),

        h2("4. Priorities: a scheduler of your own"),
        p("Once several jobs are sliced, they compete with each other. The search box keystroke matters more than the pivot table, which matters more than the background prefetch. A **cooperative scheduler** keeps one queue per priority and decides, before every unit of work, what runs next:"),
        numbered([
            "**Queues per priority**, FIFO inside each. `user-blocking` (direct response to input), `user-visible` (what the user is waiting to see), `background` (nobody is waiting).",
            "**Tasks are resumable.** A task does one unit of work and returns a continuation for the rest. The continuation keeps its place, so a job that has started finishes before the next job of the same priority.",
            "**Re-pick before every unit.** Work that arrives during a turn - for example urgent work spawned by a task - runs at the next unit boundary, not after the whole background job.",
            "**One host turn at a time.** The scheduler asks the host for a turn (MessageChannel, postTask or `scheduler.yield`) and runs units until the slice budget is spent. Then it requests the next turn and returns, letting input and paint in.",
        ]),
        p("This is the core of React's scheduler and of `scheduler.postTask`. Writing it yourself makes the trade-offs visible: how big a slice is, what preempts what, and what happens when the queue drains and new work arrives later."),
        code("javascript", `
// A resumable task: one unit per call, returns the rest of the work.
function indexRows(rows, start = 0) {
    return function step() {
        const end = Math.min(start + 200, rows.length);
        for (let i = start; i < end; i++) searchIndex.add(rows[i]);
        start = end;
        return start < rows.length ? step : undefined;
    };
}

scheduler.schedule(indexRows(allRows), "background");
searchInput.addEventListener("input", () => {
    scheduler.schedule(() => renderSuggestions(searchInput.value), "user-blocking");
});`),
        challenge("chal_coding_js_523", "Keep a pending flag so only one host turn is requested at a time, and clear it when the turn starts. Pick the next task fresh before every unit, and when a task returns a function, replace the task in place instead of re-queueing it at the back."),

        h2("5. Pitfalls"),
        bullets([
            "**Starvation.** Strict priorities can starve `background` work forever on a busy page. Production schedulers add timeouts that promote old tasks, or guarantee background work a minimum share.",
            "**Stale continuations.** If the user changes the filter mid-job, the old job should stop. Check an `AbortSignal` (or use `TaskController`) at every yield point instead of finishing work nobody wants.",
            "**Yielding too often.** Every yield costs a task switch, and with `setTimeout` at least 4 ms once nested. Budget-based slicing keeps the overhead to a few percent.",
            "**Layout thrashing inside slices.** Reading `offsetHeight` after writing styles forces a synchronous layout in every unit. Batch reads, then writes, ideally in one `requestAnimationFrame`.",
            "**Work that should not be on the main thread at all.** Pure computation over large data (parsing, sorting, aggregation) can move to a Web Worker; slicing is for work that must touch the DOM or shared state.",
        ]),
        callout("tip", "Measure before and after",
            "Record the interaction in the DevTools Performance panel with CPU throttling at 4x, find the long tasks, and confirm that after the change no task over 50 ms remains in the interaction. In production, track INP with the web-vitals library, which attributes slow interactions to the scripts that caused them."),

        h2("6. Checklist"),
        bullets([
            "No task triggered by an interaction runs longer than about 50 ms; long jobs are sliced with a time budget.",
            "Visual feedback (spinner, pressed state) is applied, then the code yields so it can be painted before heavy work starts.",
            "Yielding uses `scheduler.yield()` where available and a MessageChannel or setTimeout fallback - never a microtask.",
            "Visual updates go in `requestAnimationFrame`; deferrable work in `requestIdleCallback` with a timeout or a `background` task.",
            "Work is prioritized: input responses first, visible results next, background work last, with protection against starvation.",
            "Sliced jobs can be cancelled at every yield point when their result is no longer wanted.",
            "The clock and the yield function are injectable, so slicing and priorities are tested deterministically.",
        ]),
    ],
});
