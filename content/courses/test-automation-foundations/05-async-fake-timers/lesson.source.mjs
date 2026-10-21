// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-qaf-2-2",
    title: "Testing async code with fake timers",
    slug: { _type: "slug", current: "testing-async-code-with-fake-timers" },
    description:
        "A retry test that slept for real took 7 seconds, was scaled down until it flaked, and was finally skipped - and an extra payment retry shipped. Learn why real time does not belong in tests, what t.mock.timers tick, setTime and runAll really do on Node 24, the async trap (tick() does not wait for promises), how to assert on rejections under fake time, and how an injected clock makes timing code testable anywhere.",
    estimatedTime: 25,

    scenario: {
        role: "QA automation engineer, online shop payments team",
        problem:
            "During a 20-minute outage at the payment provider, every failing capture was tried 5 times instead of 4. The extra wave of requests tripped the provider's rate limiter, which blocked the shop's API key for 10 more minutes after the provider had recovered. The retry logic had a test - but it slept for real, was made faster with a TEST_DELAY_SCALE variable, started to flake on CI, and had been skipped for two months. Your job: test the retry schedule with fake time, deterministically, in milliseconds.",
    },

    content: [
        h2("1. The incident: a test too slow to run and too flaky to trust"),
        p("When the shop captures an authorized payment and the provider answers with a 5xx or the connection drops, the capture is retried with exponential backoff: wait 1 s, 2 s, 4 s - **at most 3 retries, 4 attempts in total**. This is the code after a refactor in which someone \"tidied up\" the loop:"),
        code("javascript", `
export const MAX_RETRIES = 3;
const scale = Number(process.env.TEST_DELAY_SCALE ?? 1);   // "the tests are too slow"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Captures an authorized payment. Retries 5xx and network errors with backoff 1 s, 2 s, 4 s.
export async function captureWithRetry(gateway, paymentId) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await gateway.capture(paymentId);
        } catch (err) {
            if (attempt > MAX_RETRIES) throw err;          // was >= before the refactor
            await sleep(1000 * 2 ** attempt * scale);
        }
    }
}`, "src/payments/capture.js"),
        p("The history of its test is a common one. The first version awaited the real backoff: 7 seconds per test, and the payments suite had dozens of retry and timeout tests, so it took 9 minutes. Someone added `TEST_DELAY_SCALE=0.001` to the CI config, turning 7 s into 7 ms, and an assertion that the whole thing \"finished in under 50 ms\". On busy CI runners that assertion failed about once a day. After a month, the test looked like this:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureWithRetry } from "../src/payments/capture.js";

const down = { capture: async () => { throw new Error("503 Service Unavailable"); } };

test("gives up after 3 retries", { skip: "flaky on CI, see PAY-412" }, async () => {
    const start = performance.now();
    await assert.rejects(captureWithRetry(down, "pay_1"), /503/);
    assert.ok(performance.now() - start < 50, "finished in under 50 ms");
});`, "test/capture.slow.test.js"),
        p("Even un-skipped, it would not have caught the bug. It never counted the attempts, and with the scale factor the extra 8 s sleep became 8 ms - well inside the 50 ms budget. Meanwhile `if (attempt > MAX_RETRIES)` lets attempt number 4 (the fifth call) through: a fourth retry at 15 s."),
        callout("warning", "Scaling time does not remove time",
            "A timer of 1 ms is still a real timer. The operating system decides when it fires, and a loaded machine fires it late. On a Windows laptop, the three scaled sleeps of 1, 2 and 4 ms took between 32 and 53 ms across three runs. Any assertion on how long real code took is a coin toss on someone else's machine."),

        h2("2. Reproduce it with fake time"),
        p("The test that should have existed does not measure anything. It replaces the clock, records the **simulated** time of every attempt, and compares the schedule exactly. It uses two small helpers from `test/helpers/time.js`; section 5 explains why they are needed."),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureWithRetry } from "../src/payments/capture.js";
import { runFor } from "./helpers/time.js";

test("a capture that keeps failing is tried at 0 s, 1 s, 3 s and 7 s", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });      // Date.now() starts at 0
    const attempts = [];
    const gateway = {
        capture: async () => {
            attempts.push(Date.now());
            throw new Error("503 Service Unavailable");
        },
    };

    const done = assert.rejects(captureWithRetry(gateway, "pay_1"), /503/);
    await runFor(t, 30_000);                                      // 30 simulated seconds
    await done;

    assert.deepStrictEqual(attempts, [0, 1000, 3000, 7000]);
});`, "test/capture.test.js"),
        code("bash", `
$ node --test test/capture.test.js
✖ a capture that keeps failing is tried at 0 s, 1 s, 3 s and 7 s (25.8ms)

  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    [
      0,
      1000,
      3000,
      7000,
  +   15000
    ]`),
        p("30 simulated seconds in 26 real milliseconds, the same result on every machine, and the failure message names the exact extra attempt: **15000**. Nothing about the result depends on how busy the runner is."),

        h2("3. Why real time does not belong in tests"),
        bullets([
            "**Slow**: a test that waits for a 30-minute reminder or a 7-second backoff is a test nobody runs. Suites with real sleeps get split, skipped or run \"nightly\" - which means not before merge.",
            "**Flaky**: timers fire *no earlier* than requested, but nobody promises how much later. A garbage-collection pause, a parallel test file or a shared CI runner adds tens of milliseconds. Every threshold you pick is either too tight (flaky) or too loose (catches nothing).",
            "**Blind**: a duration says almost nothing about behaviour. \"Finished in under 50 ms\" passes with 3 attempts, 5 attempts, or 0 attempts that threw at once. The schedule - which attempt happened at which simulated time - is what the spec describes, so that is what the test should compare.",
        ]),
        p("The rule for the rest of the course: **never assert on wall-clock durations in unit tests**. Control time, then assert on what happened and when, in simulated milliseconds. (Performance budgets are real requirements too, but they belong in a benchmark with many samples, not in a pass/fail unit test.)"),

        h2("4. t.mock.timers in depth"),
        p("You met `t.mock.timers.enable()` and `tick()` on a plain `setTimeout` in JS-1 lesson 8. Real code needs a bit more, and the details matter."),
        h3("enable: fake only what the code uses"),
        bullets([
            "`t.mock.timers.enable({ apis: [\"setTimeout\", \"Date\"] })` fakes `setTimeout`/`clearTimeout` and `Date`. Other options: `\"setInterval\"`, `\"setImmediate\"`, `\"scheduler.wait\"`. With no options, **everything** is faked.",
            "`now` sets the starting time: a number of ms or a `Date`. Without it, a faked `Date.now()` starts at 0, which makes schedules easy to read (`[0, 1000, 3000, 7000]`).",
            "APIs you do not list stay real. Keep `setImmediate` real: section 5 uses it to let promises settle.",
            "Everything is restored when the test ends, like every other `t.mock` helper.",
        ]),
        h3("tick, setTime and runAll"),
        p("These three behave in ways that surprise people. Every assertion below passes on Node 24.14:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";

test("tick() moves the clock to the end before it runs the callbacks", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const seen = [];
    setTimeout(() => seen.push(Date.now()), 300);
    setTimeout(() => seen.push(Date.now()), 500);

    t.mock.timers.tick(1000);
    assert.deepStrictEqual(seen, [1000, 1000]);         // not [300, 500]
});

test("a timer scheduled inside a tick waits for the next tick", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const seen = [];
    setTimeout(() => {
        seen.push(Date.now());
        setTimeout(() => seen.push(Date.now()), 100);   // due at 1100, not 200
    }, 100);

    t.mock.timers.tick(1000);
    assert.deepStrictEqual(seen, [1000]);
    t.mock.timers.tick(100);
    assert.deepStrictEqual(seen, [1000, 1100]);
});

test("setTime() moves the clock without running timers", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    let fired = 0;
    setTimeout(() => fired++, 1000);
    t.mock.timers.setTime(5000);
    assert.equal(fired, 0);
    t.mock.timers.tick(0);                               // runs everything already overdue
    assert.equal(fired, 1);
});

test("runAll() runs what is pending now, not what those callbacks schedule", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const seen = [];
    setTimeout(() => {
        seen.push("1 s");
        setTimeout(() => seen.push("nested"), 10);
    }, 1000);
    setTimeout(() => seen.push("3 s"), 3000);
    t.mock.timers.runAll();
    assert.deepStrictEqual(seen, ["1 s", "3 s"]);
    assert.equal(Date.now(), 3000);
});`, "test/mock-timers.test.js"),
        p("The practical consequence: **one big `tick()` is not the same as time passing**. If the code reads `Date.now()` inside a callback, or a callback schedules the next timer (every retry loop and every polling loop does), advance in steps no bigger than the shortest delay you care about. That is why the reproduction test moves time 1000 ms at a time. The step is also the **resolution** of the test: with 1000 ms steps, a backoff of 999 ms is recorded as 1000 and the schedule test stays green. Use smaller steps when single milliseconds matter. Other runners differ here: Vitest's `vi.advanceTimersByTime` steps through each timer's own due time - which is exactly what you will build in the challenge."),
        h3("Faking \"now\""),
        p("Logic that compares against the current time - coupon expiry, cancellation windows, \"new\" badges - needs only `Date`. Pick a start time near an interesting edge (here, midnight UTC) and walk across the boundary:"),
        code("javascript", `
export const CANCEL_WINDOW_MS = 30 * 60_000;           // 30 minutes

export function canCancel(order) {
    return Date.now() - order.placedAt < CANCEL_WINDOW_MS;
}`, "src/orders/cancel.js"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { canCancel } from "../src/orders/cancel.js";

test("an order can be cancelled for exactly 30 minutes", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-27T23:45:00Z") });
    const order = { id: "o_17", placedAt: Date.now() };

    t.mock.timers.setTime(Date.parse("2026-11-28T00:14:59.999Z"));   // 1 ms before the end
    assert.equal(canCancel(order), true);

    t.mock.timers.tick(1);                                            // 00:15:00.000
    assert.equal(canCancel(order), false);
});`, "test/cancel.test.js"),

        h2("5. The async trap: tick() does not wait for promises"),
        p("`captureWithRetry` is `async`. Between two timers it awaits `gateway.capture()`, catches the error, and only then calls `setTimeout` for the next backoff. `tick()` is **synchronous**: it runs the timer callbacks that are due right now and returns. The code that continues after an `await` is queued as a microtask and runs only when your test itself awaits something. Here is the test most people write first:"),
        code("javascript", `
test("ticks without letting promises run", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const attempts = [];
    const gateway = {
        capture: async () => {
            attempts.push(Date.now());
            throw new Error("503 Service Unavailable");
        },
    };

    captureWithRetry(gateway, "pay_1").catch(() => {});   // ignore the rejection for this demo
    t.mock.timers.tick(1000);
    t.mock.timers.tick(2000);
    t.mock.timers.tick(4000);

    assert.deepStrictEqual(attempts, [0, 1000, 3000, 7000]);
});`, "test/trap.test.js"),
        code("bash", `
✖ ticks without letting promises run (9.5ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    [
      0,
  -   1000,
  -   3000,
  -   7000
    ]`),
        p("It fails even against the **fixed** code. When the first `tick(1000)` runs, the rejection of the first attempt has not been handled yet, so no 1-second timer exists: the tick finds nothing to fire. All three ticks pass by an empty timer queue."),
        p("The tempting fix is to sprinkle `await Promise.resolve()` before each tick. It works until it does not: each `await` lets exactly one more step of queued callbacks run. With one `await Promise.resolve()` per step, the attempts came out as `[0, 3000]`; after the gateway client gained two internal `await`s, `[0]`. Counting microtasks couples the test to how many `await`s the code happens to have."),
        p("A robust flush waits for **all** queued promise callbacks: `setImmediate` runs only after the microtask queue is empty. That is why `setImmediate` must stay real (not listed in `apis`):"),
        code("javascript", `
// Real setImmediate: it runs after every pending promise callback. Never list it in apis.
export const flush = () => new Promise((resolve) => setImmediate(resolve));

// Fire the timers due in the next \`ms\`, then let the promise callbacks they unblocked run.
export async function advance(t, ms) {
    t.mock.timers.tick(ms);
    await flush();
}

// Simulate \`totalMs\` of time in steps, so async code can schedule its next timer between steps.
export async function runFor(t, totalMs, stepMs = 1000) {
    await flush();                                   // let the code reach its first timer
    for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) await advance(t, stepMs);
}`, "test/helpers/time.js"),
        image("real-vs-fake-time", {
            alt: "A timeline from 0 to 16 seconds with two lanes. The real-time lane shows capture attempts at 0, 1, 3 and 7 seconds separated by real sleeps of 1, 2 and 4 seconds, then the call rejects after 4 attempts; a note says that scaled down to 7 ms a busy CI runner adds 50 ms of noise, so the under-50-ms assertion flaked and the test was skipped. The fake-time lane shows a blue mark every second for tick(1000) followed by await flush(), green attempts at 0, 1, 3 and 7 seconds, and a red fifth attempt at 15 seconds labelled as the bug, producing [0, 1000, 3000, 7000, 15000] and a red CI run. A bottom panel shows one step: tick(1000) synchronously runs the due setTimeout callback; the sleep promise resolves but the code after the await is only queued as a microtask; await flush() lets the queued callbacks run so capture() is called again; setTimeout(2000) is scheduled so the next tick can fire it. Without the flush the test sees only the first attempt.",
            caption: "Same schedule, two ways to test it. Fake time is fast and exact, but each tick() must be followed by a flush so async code can schedule its next timer.",
        }),
        h3("Rejections under fake time: listen before you tick"),
        p("The retry promise rejects somewhere *inside* `runFor`, while the test is awaiting a flush. If nothing is listening at that moment, Node reports an unhandled rejection - and `node:test` fails the test with the raw error, even though the next line would have handled it:"),
        code("javascript", `
test("gives up with the last error", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const gateway = { capture: async () => { throw new Error("503 Service Unavailable"); } };

    const result = captureWithRetry(gateway, "pay_1");
    await runFor(t, 30_000);                     // the promise rejects in here...
    await assert.rejects(result, /503/);         // ...before anyone listens
});`, "test/late.test.js"),
        code("bash", `
✖ gives up with the last error (12.4ms)
  Error: 503 Service Unavailable
(node:35520) PromiseRejectionHandledWarning: Promise rejection was handled asynchronously`),
        p("The fix is the order you saw in section 2: **start the call, attach `assert.rejects` to it, then advance time, then await the assertion**. `assert.rejects` attaches its handler immediately and its own promise settles once the rejection arrives."),
        code("javascript", `
const done = assert.rejects(captureWithRetry(gateway, "pay_1"), /503/);   // listen first
await runFor(t, 30_000);                                                    // then move time
await done;                                                                 // then collect`),
        callout("info", "When the timer is the last step",
            "If the timer is the last thing the code waits for - a timeout that rejects, a debounce that calls a function - one tick() is enough and no flush is needed. In withTimeout(neverAnswers, 5000), the timer callback calls reject() inside tick(5000) and nothing else has to be scheduled; the test attaches assert.rejects before the tick and awaits it after, which lets the rejection travel through Promise.race."),
        callout("warning", "A named import from node:timers/promises is not faked",
            "On Node 24.14, code that does import { setTimeout as sleep } from \"node:timers/promises\" keeps the real timer even after enable(): the binding was captured before the mock was installed, and the test silently waits in real time. Only the default export's property (timersPromises.setTimeout) is replaced. The global setTimeout, as used by the sleep helper above, is always looked up at call time and is faked."),

        h2("6. Inject the clock instead"),
        p("Global fakes patch the world: every global `setTimeout` call in the process - yours and every library's - now follows the fake clock. The alternative is to make time a **parameter**. Production passes the real thing (`globalThis` has `setTimeout`, `clearTimeout` and `Date.now`); a test passes a fake clock object:"),
        code("javascript", `
// The clock is a parameter: globalThis in production, a fake in tests.
export function debounce(fn, waitMs, clock = globalThis) {
    let id;
    return (...args) => {
        clock.clearTimeout(id);
        id = clock.setTimeout(() => fn(...args), waitMs);
    };
}

export function withTimeout(promise, ms, clock = globalThis) {
    let id;
    const timeout = new Promise((_, reject) => {
        id = clock.setTimeout(() => reject(new Error(\`timed out after \${ms} ms\`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clock.clearTimeout(id));
}`, "src/timing.js"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { debounce, withTimeout } from "../src/timing.js";
import { createFakeClock } from "./helpers/fake-clock.js";   // you build this in the challenge

test("search is sent once, 300 ms after the last keystroke", () => {
    const clock = createFakeClock();
    const sent = [];
    const onInput = debounce((query) => sent.push(\`\${query}@\${clock.now()}\`), 300, clock);

    onInput("s");
    clock.tick(100);
    onInput("shoe");
    clock.tick(299);
    assert.deepStrictEqual(sent, []);
    clock.tick(1);
    assert.deepStrictEqual(sent, ["shoe@400"]);
});

test("a shipping quote that never answers times out after 5 s", async () => {
    const clock = createFakeClock();
    const result = assert.rejects(withTimeout(new Promise(() => {}), 5000, clock), /timed out after 5000 ms/);
    clock.tick(5000);
    await result;
});`, "test/timing.test.js"),
        p("What you gain:"),
        bullets([
            "**Works everywhere**: the same test runs under `node:test`, Vitest, Jest, in a browser or in a Web Worker - none of them has to support fake timers. (The challenge below runs in a Web Worker.)",
            "**Nothing else is affected**: a logging library's batching, an HTTP client's own timeouts and any other code in the process keep real time.",
            "**The dependency is visible**: the function signature says \"I depend on time\", the same way `loadPrice(fetchPrice, sku)` said \"I depend on the price service\" in JS-1 lesson 8.",
        ]),
        p("The cost is one extra parameter and a small fake clock - small, but it must be right. A clock that jumps to the end of the tick, or ignores timers scheduled during the tick, gives you exactly the surprises from section 4. You will write one that behaves like real time."),
        challenge("chal_coding_qaf_221", "Do not collect the due timers once at the start of tick(): callbacks can schedule and clear timers while it runs. Compute the end time first, then loop - find the earliest pending timer due by the end (lowest id on a tie), remove it, set now to its due time, call it, and look again. When nothing is due, set now to the end."),

        h2("7. The fix"),
        p("With a failing test in place, the code change is one character and one deleted line: `>=` instead of `>`, and no `TEST_DELAY_SCALE` - fake time made it pointless."),
        code("javascript", `
export const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function captureWithRetry(gateway, paymentId) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await gateway.capture(paymentId);
        } catch (err) {
            if (attempt >= MAX_RETRIES) throw err;         // 3 retries = 4 attempts in total
            await sleep(1000 * 2 ** attempt);              // 1 s, 2 s, 4 s
        }
    }
}`, "src/payments/capture.js"),
        p("The skipped test is deleted, the schedule test from section 2 turns green, and a second test pins down the happy path of a retry - including *when* the result arrives:"),
        code("javascript", `
test("a capture that succeeds on the third attempt returns at 3 s", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    let calls = 0;
    const gateway = {
        capture: async (paymentId) => {
            calls++;
            if (calls < 3) throw new Error("503 Service Unavailable");
            return { paymentId, capturedAt: Date.now() };
        },
    };

    const result = captureWithRetry(gateway, "pay_1");
    await runFor(t, 30_000);

    assert.deepStrictEqual(await result, { paymentId: "pay_1", capturedAt: 3000 });
    assert.equal(calls, 3);
});`, "test/capture.test.js"),
        code("bash", `
$ node --test test/capture.test.js
✔ a capture that keeps failing is tried at 0 s, 1 s, 3 s and 7 s (18.3ms)
✔ a capture that succeeds on the third attempt returns at 3 s (5.9ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0`),
        callout("success", "After the fix",
            "The payments suite went from 9 minutes to 4 seconds and has had no timing flakes since. Three weeks later a change raised the backoff cap \"temporarily\" to 5 retries; the schedule test failed in CI with [0, 1000, 3000, 7000, 15000, 31000] in the diff, and the change was reverted before review."),

        h2("8. Pitfalls"),
        bullets([
            "**Asserting on durations**: `performance.now() - start < 50` is flaky when tight and useless when loose. Assert on the simulated schedule.",
            "**Scaling delays with an env variable**: it hides the real numbers, still uses real timers, and lets a test pass with the wrong number of attempts.",
            "**One big tick for async code**: `tick(60_000)` runs only the timers that exist right now. Async code schedules its next timer after an `await`, so advance in steps and flush between them.",
            "**Counting microtasks**: chains of `await Promise.resolve()` break when the code gains or loses an `await`. Flush with a real `setImmediate` instead.",
            "**Faking everything**: `enable()` with no options also fakes `setImmediate`, so the flush helper never resolves until you tick. List only the APIs the code uses.",
            "**Attaching `assert.rejects` too late**: the promise rejects while time moves, before anyone listens, and the test fails with the raw error. Listen first, then tick.",
            "**Reading `Date.now()` inside callbacks after one big `tick()`**: on `node:test` every callback sees the end time. Tick to each due time when the timestamps matter.",
            "**Named imports from `node:timers/promises`**: not replaced by `t.mock.timers` on Node 24.14. Use the global `setTimeout` or inject a clock.",
        ]),
        callout("tip", "Make it fail once",
            "After writing a fake-time test, change the code's base delay from 1000 to 1500, or >= back to >, and watch the schedule assertion go red. A timing test that stays green when the timing changes is not testing timing."),

        h2("9. Checklist"),
        bullets([
            "No real sleeps and no assertions on wall-clock durations in unit tests.",
            "Enable only the timer APIs the code uses, with `Date` when it reads the time; keep `setImmediate` real.",
            "Record what happened and the simulated time it happened at; compare the whole schedule with `deepStrictEqual`.",
            "For async code, advance in steps and flush pending promise callbacks after every `tick()`.",
            "Start the call and attach `assert.rejects` before moving time; await it afterwards.",
            "Test both edges of every delay: 1 ms before (nothing yet) and exactly at the due time.",
            "Prefer an injected clock (`{ now, setTimeout, clearTimeout }`) for code that must run in browsers, workers or more than one test runner.",
            "Watch every timing test fail once by nudging a delay or a retry limit.",
        ]),
    ],
});
