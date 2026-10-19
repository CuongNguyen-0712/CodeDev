// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-1-1",
    title: "Call stack, task queues & execution order",
    slug: { _type: "slug", current: "call-stack-task-queues-execution-order" },
    description:
        "A top-up succeeds, and the confirmation modal says \"New balance: $0.00\". Learn how the call stack, the task queue, the microtask queue and the render step decide what runs when, why setTimeout(fn, 0) is not \"right after this\", and build a deterministic event loop to prove it.",
    estimatedTime: 22,

    scenario: {
        role: "Frontend engineer, consumer wallet web app",
        problem:
            "Two days after a refactor of the wallet store, support has 1,240 tickets with the same screenshot: a green \"Transaction succeeded\" modal reading \"New balance: $0.00\". The money is there - refreshing shows $250 - but 312 users believed the top-up failed and paid a second time, and finance is refunding $18,400 by hand. QA cannot reproduce it on staging, where the analytics call goes over the network and takes about 80 ms.",
    },

    content: [
        h2("1. The incident: a modal that reads the past"),
        p("The refactor moved rendering out of the store. To \"keep the store fast\", every subscriber now renders in a deferred callback. The top-up flow was not touched:"),
        code("javascript", `
// wallet-store.js - after the refactor
export function subscribe(listener) {
    listeners.add((state) => {
        // "Don't block the caller - render right after this."
        setTimeout(() => listener(state), 0);
    });
}

subscribe((state) => {
    balanceEl.textContent = formatMoney(state.balance);
});

// top-up.js - unchanged for a year
async function confirmTopUp(txId) {
    const { newBalance } = await api.confirmTopUp(txId);
    store.set({ balance: newBalance });
    await analytics.track("topup_success");     // production SDK: buffers locally, resolves at once
    showModal(\`Transaction succeeded. New balance: \${balanceEl.textContent}\`);
}`, "wallet.js"),
        p("The code reads top to bottom as \"set the balance, render it, then show the modal\". The runtime executes it in a different order, and the difference is not random: it follows a precise algorithm that is the same in every browser. Before reading on, predict what it does."),
        challenge("chal_quiz_101"),

        h2("2. One thread, one call stack"),
        p("Your JavaScript runs on one thread, with one **call stack**. When a function is called, a frame is pushed; when it returns, the frame is popped. Everything else - timers, network, user input - is handled by the **host** (the browser or Node.js) outside your code. The host never interrupts running JavaScript. When a timer expires or a response arrives, it queues a callback, and that callback runs only when the stack is empty."),
        p("This rule is called **run to completion**, and it explains the first surprise: a zero-delay timer cannot run while synchronous code is still busy."),
        code("javascript", `
const start = performance.now();
setTimeout(() => {
    console.log(\`timer ran after \${Math.round(performance.now() - start)} ms\`);
}, 0);

// 200 ms of synchronous work: the timer expires at once, but has to wait.
while (performance.now() - start < 200) {}
// -> "timer ran after 200 ms" (or a little more)`, "run-to-completion.js"),
        callout("info", "Async functions start synchronously",
            "Calling an async function runs its body synchronously, on the caller's stack, up to the first await. Only the code after an await is deferred. That is why \"async\" alone never makes slow code non-blocking - lesson 1.2 shows the consequences."),

        h2("3. Tasks, microtasks and the render step"),
        p("The host keeps callbacks in two kinds of queues, and the **event loop** is the algorithm that empties them. One turn of the loop looks like this:"),
        numbered([
            "**Run one task.** Take the oldest runnable task (a timer callback, a click handler, a network event, a `MessageChannel` message) and run it until the call stack is empty.",
            "**Microtask checkpoint.** Run every microtask in the microtask queue, in FIFO order. Microtasks queued during the checkpoint are added to the end and run in the same checkpoint. The checkpoint ends only when the queue is empty.",
            "**Maybe render.** If it is time for a new frame (typically every 16.7 ms at 60 Hz), run `requestAnimationFrame` callbacks, then style, layout and paint.",
            "Go back to step 1.",
        ]),
        image("event-loop-queues", {
            alt: "Diagram of the call stack, the host's Web APIs feeding a task queue, a microtask queue, and the three steps of one turn of the event loop: run one task, run every microtask, render if a frame is due.",
            caption: "Microtasks always run before the next task. In the incident, showModal is a microtask and renderBalance is a task.",
        }),
        h3("What goes where"),
        bullets([
            "**Tasks (macrotasks)**: `setTimeout` / `setInterval` callbacks, UI events (click, keydown, input), network and I/O callbacks, `MessageChannel` and `postMessage` messages.",
            "**Microtasks**: promise reactions (`then`, `catch`, `finally`), the continuation of an async function after `await`, `queueMicrotask(fn)` and `MutationObserver` callbacks.",
            "**Render step**: `requestAnimationFrame` callbacks, then style recalculation, layout and paint. DOM changes made in a task become visible only here.",
        ]),
        p("`setTimeout(fn, 0)` therefore means \"run `fn` in some **later task**\": after the current task, after every microtask it produces, and possibly after a frame and after other tasks that were already waiting. Browsers also clamp timers nested more than five levels deep to at least 4 ms. It is a way to say \"later\", never a way to say \"next\"."),
        callout("warning", "The checkpoint does not stop until the queue is empty",
            "A microtask that always queues another microtask (for example a recursive promise chain that never awaits anything real) keeps step 2 running forever. No task runs, no frame is painted, and the page freezes exactly like an infinite loop."),

        h2("4. Replaying the incident"),
        p("An `await` is a promise reaction in disguise. These two functions schedule their second half the same way, as a microtask:"),
        code("javascript", `
async function a() {
    await analytics.track("topup_success");
    showModal();
}

function b() {
    return Promise.resolve(analytics.track("topup_success")).then(() => showModal());
}`),
        p("Now trace `confirmTopUp` after the API response has arrived. Its continuation runs as a microtask of the network task:"),
        numbered([
            "`store.set({ balance: 250 })` calls the subscriber wrapper, which only **queues a task**: `setTimeout(render, 0)`.",
            "`await analytics.track(...)` gets an already-resolved promise and **queues a microtask** for the rest of the function.",
            "The current microtask returns. The checkpoint is not over - the new microtask runs immediately: `showModal` reads `balanceEl.textContent`, which still holds the old text.",
            "The checkpoint ends, the browser paints the modal, and only in a later task does `render` write $250 into a balance element hidden behind the modal.",
        ]),
        p("On staging, `analytics.track` waits about 80 ms for the network. During that wait the render task runs, so by the time the continuation reads the DOM it is up to date and the modal looks right. In production the SDK buffers events and resolves at once, the continuation becomes the very next microtask, and the bug appears for every user. The code was always wrong; only the timing that hid it changed."),

        h2("5. Fixing ordering bugs for real"),
        p("The tempting fix is another timer: `setTimeout(showModal, 10)`. It passes on a developer laptop and fails on a busy phone, because nothing guarantees which of two timers from different call sites runs first once other work is involved. The real fix is to remove the hidden dependency on queue order:"),
        bullets([
            "**Derive, don't read back.** Build the message from the value you just wrote (`newBalance`), not from `balanceEl.textContent`. The DOM is an output, not a source of truth.",
            "**Wait for the thing, not for time.** If code must run after a render, make the render return a promise or call a callback - then `await` it. Never sleep and hope.",
            "**Batch with microtasks, paint with rAF.** If you want to coalesce many store updates into one render, schedule the flush with `queueMicrotask` (runs before the next paint, so the screen never shows a half-updated state) or with `requestAnimationFrame` (runs right before the next paint). `setTimeout(0)` lets a frame with stale data slip through.",
        ]),
        code("javascript", `
// wallet-store.js - batched, ordered notifications
let pending = false;

export function set(patch) {
    state = { ...state, ...patch };
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
        pending = false;
        for (const listener of listeners) listener(state); // before the next paint
    });
}

// top-up.js
async function confirmTopUp(txId) {
    const { newBalance } = await api.confirmTopUp(txId);
    store.set({ balance: newBalance });
    showModal(\`Transaction succeeded. New balance: \${formatMoney(newBalance)}\`);
    analytics.track("topup_success").catch(reportError); // fire and forget, never unhandled
}`, "wallet.js"),
        callout("tip", "Node.js has two extra queues",
            "process.nextTick callbacks run before promise microtasks, and setImmediate callbacks run in the check phase after I/O, which makes them the Node equivalent of \"a new task, as soon as possible\". The rule stays the same: synchronous code, then all microtasks, then the next task."),

        h2("6. Build it: a deterministic event loop"),
        p("The best way to make these rules stick is to implement them. The exercise is a small event loop with its own virtual clock: `setTimeout` and `clearTimeout`, a microtask queue, and `run(main, onError)`. The tests feed it programs as data and compare the exact log - the incident from section 1 is the first test."),
        p("The core is two loops: an inner one that drains microtasks until the queue is empty, and an outer one that picks the next timer by due time. Two details decide whether it behaves like a browser:"),
        bullets([
            "**Ordering of equal timers.** Two timers due at the same moment run in the order they were scheduled, so every timer needs a sequence number, not just a due time.",
            "**Error isolation.** An exception in one callback is reported (browsers fire `error` / `unhandledrejection`) and the loop carries on. One broken analytics callback must not stop the rest of the page.",
        ]),
        code("javascript", `
function checkpoint(onError) {
    // Keep going while there is anything left - microtasks may queue more microtasks.
    // Run each one guarded, so one exception does not end the checkpoint.
}`),
        callout("info", "You will use this model again",
            "Fake timers in test frameworks are exactly this: a virtual clock plus queues you can step through. Lesson 6.1 uses them to test retries and debounces without waiting for real time."),
        challenge("chal_coding_js_112", "Give every timer an increasing sequence number and pick the next one by (due time, sequence). Drain microtasks with a while loop that re-checks the queue length, and wrap every callback in try/catch that calls onError."),

        h2("7. Checklist"),
        bullets([
            "Synchronous code runs to completion; nothing - no timer, no response, no click - interrupts it.",
            "After every task, all microtasks run (promise reactions, code after `await`, `queueMicrotask`), then the browser may render, then the next task runs.",
            "`setTimeout(fn, 0)` means \"some later task\", never \"right after this line\"; it is not a synchronisation tool.",
            "No code reads back DOM or shared state that another task is expected to have updated; derive values from the state you hold, or await the operation that produces them.",
            "Batched updates are flushed with `queueMicrotask` or `requestAnimationFrame`, so no frame shows half-applied state.",
            "Microtask chains always reach a real asynchronous boundary; an endless microtask chain freezes the page like an infinite loop.",
            "Fire-and-forget calls (analytics, logging) are not awaited in the user-visible path.",
        ]),
    ],
});
