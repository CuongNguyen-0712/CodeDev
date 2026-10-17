// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-6-1",
    title: "Testing async code deterministically",
    slug: { _type: "slug", current: "testing-async-code-deterministically" },
    description:
        "Async tests that sleep and hope are slow and flaky. Learn to control time with fake timers, understand why advancing the clock is not the same as flushing promises, drive ordering with deferred promises, test cancellation and rejections - and build the fake clock that makes it all work.",
    estimatedTime: 30,

    scenario: {
        role: "Frontend engineer, analytics dashboard team",
        problem:
            "The dashboard's data layer - auto-refresh polling, retry with backoff, request cancellation - has 140 tests that take four minutes and fail about one CI run in twenty. Everyone has learned to press \"Re-run\". Last sprint a real regression slipped through that way: a change made the retry loop fire every 50 ms instead of backing off, and the failing test was dismissed as \"the flaky one again\". You are asked to make the suite fast and boringly deterministic.",
    },

    content: [
        h2("1. Why async tests flake"),
        p("Here is the test that kept failing on CI. It passes on a laptop almost every time:"),
        code("javascript", `
import { test, expect, vi } from "vitest";
import { createPoller } from "../src/poller.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("refreshes every 20 ms", async () => {
    const load = vi.fn().mockResolvedValue({ visitors: 42 });
    const poller = createPoller(load, { intervalMs: 20 });

    poller.start();
    await sleep(50);           // "should be enough for 3 calls"
    poller.stop();

    expect(load).toHaveBeenCalledTimes(3);
});`, "poller.test.js"),
        p("The test assumes that 50 ms of wall-clock time contains exactly three 20 ms ticks plus the first call. On a loaded CI runner timers fire late, a garbage-collection pause eats 15 ms, and the count is 2. Raise the sleep to 500 ms and it becomes slow instead of flaky - and still wrong, because now the count depends on how late the timers drift."),
        p("Nearly every flaky async test has one of these causes:"),
        bullets([
            "**Real time as a synchronisation tool**: `await sleep(n)` means \"I hope the work is done by then\". Hope does not scale to 140 tests on a shared runner.",
            "**Ordering assumptions**: two independent requests are expected to finish in the order they started, because they did on the developer's machine.",
            "**Leaked work**: a timer or pending promise from the previous test fires during the next one and changes its state.",
            "**Unobserved rejections**: a promise rejects after the test already finished, so the failure is reported against a different test - or nowhere.",
        ]),
        p("The fix is the same for all four: the test, not the clock or the network, decides when things happen."),

        h2("2. Fake timers: control time instead of waiting for it"),
        p("Fake timers replace `setTimeout`, `setInterval`, their `clear*` functions and `Date` with versions driven by a virtual clock. Nothing fires until the test moves that clock forward, and moving it is instant - an hour of backoff takes microseconds."),
        code("javascript", `
import { afterEach, beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T09:00:00Z")); // Date.now() is now deterministic too
});

afterEach(() => {
    vi.useRealTimers(); // never leak fake time into the next test file
});

test("refreshes every 20 ms", async () => {
    const load = vi.fn().mockResolvedValue({ visitors: 42 });
    const poller = createPoller(load, { intervalMs: 20 });

    poller.start();                          // call 1 happens immediately
    await vi.advanceTimersByTimeAsync(60);   // exactly three intervals, no matter how slow the runner is
    poller.stop();

    expect(load).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);      // stop() really cleared its timer
});`, "poller.test.js"),
        p("The Jest equivalents are `jest.useFakeTimers()`, `jest.advanceTimersByTimeAsync(ms)`, `jest.setSystemTime()` and `jest.getTimerCount()`. Both runners use the same engine underneath (`@sinonjs/fake-timers`), so the behaviour described in this lesson applies to both."),
        callout("info", "What is faked - and what is not",
            "Vitest fakes the timer functions and Date by default, but leaves queueMicrotask and process.nextTick real unless you opt in with the toFake option. Promises are never faked: a resolved promise's callbacks still run as microtasks. That is exactly why the next section matters."),
        p("The main controls you will use:"),
        bullets([
            "`advanceTimersByTime(ms)` / `advanceTimersByTimeAsync(ms)` - move the clock forward by `ms`, firing everything that becomes due.",
            "`advanceTimersToNextTimer()` - jump straight to the next scheduled timer; useful for backoff where you do not want to compute delays in the test.",
            "`runOnlyPendingTimers()` - fire what is scheduled now, but not timers those callbacks create; safe with intervals.",
            "`runAllTimers()` / `runAllTimersAsync()` - keep firing until the queue is empty; with an interval that is never cleared this stops at a loop limit and throws.",
        ]),

        h2("3. Timers and microtasks are two different queues"),
        p("Fake timers control the timer queue. They do not control the microtask queue, where promise callbacks and the code after every `await` run. Mixing the two up produces the two most confusing fake-timer failures."),

        h3("Failure 1: awaiting before advancing"),
        p("A retry helper waits 1 second between attempts. The team converted its test to fake timers - and it started timing out instead of passing."),
        challenge("chal_quiz_js_611"),
        p("The safe shape for any test where the code under test waits on a timer is always the same three steps: start, advance, then await."),
        code("javascript", `
test("retries once after 1 s", async () => {
    const api = vi.fn()
        .mockRejectedValueOnce(new Error("503"))
        .mockResolvedValueOnce("ok");

    const pending = fetchWithRetry(api, { delayMs: 1000 }); // 1. start, do not await yet
    await vi.advanceTimersByTimeAsync(1000);                // 2. let time pass
    await expect(pending).resolves.toBe("ok");              // 3. now await the result

    expect(api).toHaveBeenCalledTimes(2);
});`),

        h3("Failure 2: advancing synchronously across an await"),
        p("Most real code does not schedule all its timers up front. It awaits something - a request, a status check - and only then schedules the next timer. Predict what a fake clock does with that kind of code."),
        challenge("chal_quiz_js_613"),
        p("The synchronous `advanceTimersByTime` runs from start to finish without yielding, so promise continuations cannot run in the middle of it - and the timers they would create do not exist yet. The async variant pauses after each timer and lets the microtask queue drain before it looks for the next one."),
        image("fake-timers-sync-vs-async", {
            alt: "Two lanes. In the synchronous lane the clock jumps from 0 to 3000 ms while the promise continuation that would schedule the next poll waits until after the advance. In the async lane the advance pauses after each timer, the microtask runs and schedules the next timer, and four polls happen.",
            caption: "advanceTimersByTime fires timers but never yields; advanceTimersByTimeAsync lets promise callbacks run between timers.",
        }),
        callout("tip", "Default to the async variants",
            "Prefer advanceTimersByTimeAsync, runAllTimersAsync and runOnlyPendingTimersAsync in code that uses promises. The synchronous variants are only safe when every timer callback is fully synchronous - and that stops being true the day someone adds an await."),

        h2("4. Inside a fake clock"),
        p("A fake clock is less magic than it looks. It keeps a virtual `now` and a list of timers, each with a due time and an id. Advancing time is a loop:"),
        numbered([
            "Find the timer with the smallest due time that is not after the target time. If two are due at the same moment, take the one created first (lowest id) - that matches how browsers and Node order equal timeouts, and keeps tests reproducible.",
            "Set `now` to that timer's due time, then remove it - or, for an interval, re-arm it for its next due time - **before** calling it, so the callback can clear itself.",
            "Call it. The callback may schedule new timers; because the loop searches again on every iteration, a new timer that falls inside the window fires in the same advance.",
            "When nothing is due any more, set `now` to the target time.",
        ]),
        p("`runAll` is the same loop without a target time. It needs a guard: an interval that is never cleared would keep the loop busy forever and freeze the test worker. Real libraries stop after a loop limit (Vitest's `loopLimit` defaults to 10,000 timers) and throw an error that names the problem."),
        p("Building one yourself is the fastest way to stop guessing what the library does - and it is useful on its own: a fake clock you inject into your code (see section 6) works in any test runner and even in a browser demo."),
        challenge("chal_coding_js_612", "Keep a single loop that always looks for the earliest due timer (ties: lowest id) and re-checks after every callback. Update the clock to the timer's due time before calling it, and re-arm intervals before the call so clearInterval inside the callback wins."),

        h2("5. Driving order with deferred promises"),
        p("Timers are only half of async code; the other half is waiting on things like requests. A mock that resolves immediately hides ordering bugs, because everything finishes in the order it started. To test \"the slow first request answers after the fast second one\", the test has to hold each promise and settle it on purpose. A **deferred** is a promise plus its resolve and reject functions:"),
        code("javascript", `
// Promise.withResolvers() does this natively in Node 22+ and current browsers.
export function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}`, "test/deferred.js"),
        code("javascript", `
test("a slow, older response never replaces a newer one", async () => {
    const calls = [];
    const search = vi.fn(() => {
        const d = deferred();
        calls.push(d);
        return d.promise;
    });
    const store = createSearchStore(search);

    const first = store.query("re");      // request 1
    const second = store.query("react");  // request 2

    calls[1].resolve(["react", "react-dom"]);   // the newer request answers first...
    await second;
    expect(store.results).toEqual(["react", "react-dom"]);

    calls[0].resolve(["redux", "regex"]);       // ...then the stale one arrives
    await first;
    expect(store.results).toEqual(["react", "react-dom"]);
});`, "searchStore.test.js"),
        p("The test now states the interleaving it cares about, and it produces that interleaving on every run on every machine."),

        h3("Testing cancellation"),
        p("For cancellation, assert three things: the operation rejects with an `AbortError`, the dependency saw the abort, and nothing was left behind."),
        code("javascript", `
test("abort stops the backoff and leaves no timers", async () => {
    const controller = new AbortController();
    const api = vi.fn().mockRejectedValue(new Error("503"));

    const pending = fetchWithRetry(api, { delayMs: 1000, signal: controller.signal });
    const assertion = expect(pending).rejects.toHaveProperty("name", "AbortError");

    await vi.advanceTimersByTimeAsync(500);  // in the middle of the first backoff
    controller.abort();

    await assertion;
    expect(api).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);      // the pending backoff timer was cleared
});`),

        h3("Testing rejections"),
        p("Notice that `assertion` was created **before** the clock moved. If the promise rejects while no handler is attached yet, Node reports an unhandled rejection - sometimes failing a different test. Attach the `rejects` expectation (or a `.catch`) first, advance time, then await it."),
        callout("warning", "Do not swallow rejections to make a test green",
            "pending.catch(() => {}) silences the warning but also silences the bug. Keep the rejection observable and assert on it - name, message, cause - so a regression in error handling fails the test."),

        h2("6. Replacing await sleep(50)"),
        p("Every real sleep in a test hides a question the test should answer explicitly. Translate them:"),
        bullets([
            "**\"Wait until the timer fired\"** - fake timers plus `advanceTimersByTimeAsync(exactMs)` or `advanceTimersToNextTimerAsync()`.",
            "**\"Wait until the request finished\"** - a deferred you resolve, then `await` the operation itself or its next observable state.",
            "**\"Wait until the promise chain caught up\"** - await the promise the code under test returns, as the search test above does. If it returns nothing, that is a testability smell: return the promise, or expose a `whenIdle()`.",
            "**\"Wait until something outside my control happens\"** (a real DOM render, a worker) - `vi.waitFor` / Testing Library's `waitFor`, which poll a condition with a timeout instead of sleeping a fixed time.",
        ]),
        p("Code that reads the global clock directly is harder to test than code that receives one. Accepting the clock as a dependency costs one parameter and makes the code testable with any fake - including the one you just built:"),
        code("javascript", `
export function createPoller(load, { intervalMs, clock = globalThis }) {
    let timer = null;
    let running = false;

    async function run() {
        if (!running) return;
        await load();
        if (running) timer = clock.setTimeout(run, intervalMs); // stop() may have run during load()
    }

    return {
        start() { running = true; run(); },
        stop() { running = false; clock.clearTimeout(timer); timer = null; },
    };
}

// In a test, without any test-runner magic:
const clock = createFakeClock();
const poller = createPoller(load, { intervalMs: 20, clock });`, "src/poller.js"),
        callout("success", "The result for the dashboard suite",
            "After replacing sleeps with fake timers and deferreds, the 140 tests ran in 9 seconds instead of four minutes, and 500 consecutive CI runs were green. The backoff test now asserts the exact delays - 1000, 2000, 4000 ms - so the 50 ms retry storm would have failed it on the first run."),

        h2("7. Checklist"),
        bullets([
            "No `await sleep(n)` in tests: fake timers for time, deferreds for ordering, `waitFor` only for genuinely external events.",
            "Turn fake timers on in `beforeEach` and back off in `afterEach`; pin `Date` with `setSystemTime`.",
            "Start the operation, advance the clock, then await - never await an operation that is waiting for the clock you have not advanced.",
            "Prefer the `...Async` timer controls whenever promise callbacks schedule timers.",
            "Resolve deferreds out of order on purpose to prove stale results are ignored.",
            "For cancellation assert the `AbortError`, the dependency's call count and `getTimerCount() === 0`.",
            "Attach `rejects` expectations before advancing time; never silence a rejection to get a green test.",
            "Inject the clock into code that schedules work, so any fake - library or hand-written - can drive it.",
        ]),
    ],
});
