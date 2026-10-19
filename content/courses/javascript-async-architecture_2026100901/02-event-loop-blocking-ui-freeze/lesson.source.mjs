// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-1-2",
    title: "Event loop blocking: finding and breaking up long tasks",
    slug: { _type: "slug", current: "event-loop-blocking-long-tasks" },
    description:
        "An in-browser audit of 500,000 log entries freezes the tab for 7 seconds: no progress bar, no Cancel button, a \"Page Unresponsive\" dialog. Learn what a long task blocks, how to find one, how to split it into chunks that really yield to the browser, and when to move the work to a Web Worker instead.",
    estimatedTime: 22,

    scenario: {
        role: "Frontend engineer, internal compliance tooling",
        problem:
            "The audit tool lets the compliance team drop a day of API logs (about 500,000 lines, 60 MB) into the browser and get a summary of errors and slow requests. On a developer laptop the tab freezes for 7 seconds; on the team's managed laptops it is 19 seconds, Chrome shows \"Page Unresponsive\", and half the users click \"Exit page\" and lose their filters. The progress bar never moves and the Cancel button does nothing until the audit is over.",
    },

    content: [
        h2("1. The incident: a progress bar that never moves"),
        p("The audit is a straightforward loop. It looks like it reports progress and can be cancelled:"),
        code("javascript", `
let cancelled = false;
cancelButton.addEventListener("click", () => { cancelled = true; });

runButton.addEventListener("click", () => {
    const lines = fileText.split("\\n");                  // ~500,000 lines
    const summary = { total: lines.length, errors: 0, warnings: 0, slowestMs: 0 };

    for (let i = 0; i < lines.length; i++) {
        if (cancelled) return;
        tally(summary, JSON.parse(lines[i]));             // ~14 µs per line
        progressBar.value = (i + 1) / lines.length;
    }
    renderSummary(summary);
});`, "audit-tool.js"),
        p("None of it works while the loop runs. The `cancelled` flag can only be set by a click handler, the click handler can only run when the loop is over, and `progressBar.value` changes 500,000 times in memory but is painted once, at the end. A teammate opened a pull request that makes the handler `async` and adds an `await` every 5,000 lines. Before reading on, decide whether that helps."),
        challenge("chal_quiz_js_121"),

        h2("2. What a long task blocks"),
        p("Lesson 1.1 showed that the browser renders and dispatches input only **between tasks**. A click handler that runs for 7 seconds is one task, and for those 7 seconds the main thread can do nothing else:"),
        bullets([
            "**Input**: clicks, key presses and scrolls are queued as tasks and wait. A click on Cancel at second 1 runs at second 7.",
            "**Rendering**: style, layout and paint happen in the render step. DOM writes made during the task are only visible after it - the progress bar goes from 0% straight to 100%.",
            "**Timers and network callbacks**: every `setTimeout`, `fetch` response and `message` event waits too, so polling, websockets and autosave stall.",
            "**The browser's patience**: after several seconds without a response to input, Chrome offers to kill the page.",
        ]),
        p("A task longer than **50 ms** is a **long task**. The number comes from the user's perception of \"instant\": a response within about 100 ms feels immediate, and if your task can take 50 ms when an input arrives, the browser still has the other 50 ms to handle it and paint."),
        callout("warning", "async and microtasks do not create gaps",
            "Marking a function async, wrapping work in a promise or awaiting an already-resolved value only schedules microtasks. The microtask checkpoint runs them all before the browser gets a turn, so the work is still one long task. Only a new task - a timer, a message, scheduler.yield() - lets the browser in."),

        h2("3. Measure before you cut"),
        p("Start with the DevTools **Performance** panel: record the interaction with CPU throttling at 4x (closer to the compliance team's laptops) and look for tasks with red corners. The bottom-up view shows which functions take the time - here `JSON.parse` and `tally`."),
        p("In production, the browser reports long tasks to a `PerformanceObserver`, so you can see them on real users' machines:"),
        code("javascript", `
new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        // entry.duration in ms; "long-animation-frame" entries also list the scripts involved
        monitoring.track("long_frame", {
            duration: Math.round(entry.duration),
            scripts: entry.scripts?.map((s) => s.sourceURL + ":" + s.sourceFunctionName),
        });
    }
}).observe({ type: "long-animation-frame", buffered: true });   // or type: "longtask"`, "long-task-monitor.js"),
        p("Then measure the cost of one unit of work, because it decides the chunk size. Time a sample of lines with `performance.now()`: at about 14 µs per line on a fast laptop and 40 µs on a slow one, a chunk of **1,000 lines** takes 14-40 ms - under the 50 ms threshold on both. 500,000 lines become 500 tasks."),
        callout("tip", "Profile the slow machine, not yours",
            "A loop that takes 30 ms on a developer laptop takes 100 ms on a budget phone or a laptop full of endpoint security agents. Pick the chunk size from the slowest device you support, or use a time budget instead of a fixed count - lesson 5.2 builds exactly that."),

        h2("4. Breaking the loop into chunks"),
        p("The fix keeps the same work but ends the task on purpose every chunk, so input and rendering can run in between. Three things must happen at every chunk boundary:"),
        numbered([
            "**Publish progress** - update the progress bar after the chunk, so the next render step paints it.",
            "**Yield with a real task boundary** - await a promise that resolves in a later task. `scheduler.yield()` does this and keeps your continuation near the front of the queue; `setTimeout(resolve, 0)` works everywhere.",
            "**Stop yielding when the work is done** - after the last chunk, return the result immediately instead of waiting behind other tasks one more time.",
        ]),
        code("javascript", `
export function yieldToMain() {
    if (globalThis.scheduler?.yield) return scheduler.yield();
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function runAudit(lines, chunkSize = 1000) {
    const summary = { total: lines.length, errors: 0, warnings: 0, slowestMs: 0 };
    for (let start = 0; start < lines.length; start += chunkSize) {
        const end = Math.min(start + chunkSize, lines.length);
        for (let i = start; i < end; i++) tally(summary, JSON.parse(lines[i]));
        progressBar.value = end / lines.length;
        // ...yield here, unless this was the last chunk
    }
    return summary;
}`, "audit-tool.js"),
        image("long-task-three-ways", {
            alt: "Three timelines over 8 seconds. One loop: a single 7-second long task, a Cancel click waits 6 seconds. Chunks and yield: twenty short tasks with paints between them, the click is handled within one chunk. Web Worker: the main thread stays free with regular paints while a worker thread does 7 seconds of work.",
            caption: "Chunking does not make the audit faster - it costs a few percent - but it creates gaps for input and frames. A worker removes the work from the main thread altogether.",
        }),
        p("The team's first attempt at chunking shipped with two bugs that the compliance team found within a day. They are your exercise: the harness plays the browser, types into the page while the audit runs, and checks that every keystroke is handled between chunks."),
        challenge("chal_fix_102", "A microtask is not a task boundary: use the injected yieldToMain. Then check what happens to progress when the number of entries is not a multiple of chunkSize, and whether the function waits once more after the last chunk."),

        h2("5. Cancel at the yield points"),
        p("Once the loop yields, the Cancel click finally gets a turn - but the loop must look at the result. Check for cancellation right after every yield: that is the only place where anything can have changed. The same check protects against a second run: if the user drops a new file while the old audit is still going, the old one must stop instead of writing its summary over the new one."),
        code("javascript", `
let currentRun = 0;

async function startAudit(lines) {
    const run = ++currentRun;                 // a newer run makes this one stale
    const summary = await runAudit(lines, {
        // the chunk loop calls this right after every yield and returns null if it says stop
        shouldStop: () => run !== currentRun,
    });
    if (summary) renderSummary(summary);
}

cancelButton.addEventListener("click", () => {
    currentRun++;                             // the running audit stops at its next yield
    progressBar.value = 0;
});`, "audit-tool.js"),
        callout("info", "A standard way to say \"stop\"",
            "A run counter works inside one module. To cancel across APIs - the loop, a fetch, a timer - the platform has AbortController and AbortSignal. Lesson 1.3 builds a cancellable sleep on top of them, and the same signal can stop this loop at its yield points."),

        h2("6. Or move the work off the main thread"),
        p("Chunking keeps the work on the main thread, sharing it with input and rendering. When the work is pure computation - parsing, aggregating, sorting, hashing - and does not touch the DOM, a **Web Worker** runs it on a separate thread, and the main thread stays completely free:"),
        code("javascript", `
// audit-worker.js
self.onmessage = async ({ data: file }) => {
    const lines = (await file.text()).split("\\n");
    const summary = { total: lines.length, errors: 0, warnings: 0, slowestMs: 0 };
    for (let i = 0; i < lines.length; i++) {
        tally(summary, JSON.parse(lines[i]));
        if (i % 10000 === 0) self.postMessage({ type: "progress", value: i / lines.length });
    }
    self.postMessage({ type: "done", summary });
};

// audit-tool.js
const worker = new Worker(new URL("./audit-worker.js", import.meta.url), { type: "module" });
worker.onmessage = ({ data }) => {
    if (data.type === "progress") progressBar.value = data.value;
    else renderSummary(data.summary);
};
runButton.addEventListener("click", () => worker.postMessage(fileInput.files[0]));
cancelButton.addEventListener("click", () => worker.terminate());   // stops it mid-loop`, "audit-worker.js"),
        bullets([
            "**Send the input cheaply.** Posting 500,000 parsed objects costs a structured clone that can itself be a long task. Send the `File` (cheap) or a transferable `ArrayBuffer`, and post back the small summary.",
            "**Workers have no DOM.** Anything that must read or write the page stays on the main thread - chunk that part.",
            "**Cancellation is easy.** `worker.terminate()` stops the thread immediately, even in the middle of a synchronous loop.",
        ]),
        callout("success", "Choosing between them",
            "Pure computation over large data: a worker. Work that needs the DOM or shared page state (building rows, measuring layout, updating a big store): chunks with real yields. Many production tools do both - parse in a worker, render the result in chunks."),

        h2("7. Checklist"),
        bullets([
            "No task started by user input runs longer than about 50 ms on the slowest supported device.",
            "Long tasks are found with the Performance panel and tracked in production with a long-task or long-animation-frame observer.",
            "Chunked loops yield with a real task boundary (`scheduler.yield()`, `setTimeout`, `MessageChannel`), never with `await Promise.resolve()` or `queueMicrotask`.",
            "Progress is published after every chunk, including a smaller last one, and the loop does not yield again after the last chunk.",
            "Every yield point checks for cancellation and for a newer run, so stale work stops instead of overwriting fresh results.",
            "Pure computation over large inputs runs in a Web Worker, with cheap-to-transfer inputs and small outputs.",
        ]),
    ],
});
