// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-fwp-1-2",
    title: "Long tasks and yielding to the main thread",
    slug: { _type: "slug", current: "long-tasks-yielding-main-thread" },
    description:
        "Applying a promo code to a big group order froze Rice Rocket's cart for 600 ms on budget phones, and every tap waited. Learn how the main thread runs one task at a time, what makes a task long, and how to split work into slices with scheduler.yield() so input runs in between, then rewrite the cart repricing loop.",
    estimatedTime: 15,

    scenario: {
        role: "Frontend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Office group orders reach 400 lines. Applying a promo code reprices every line in one synchronous loop. The RUM summary from lesson 1 shows INP 640 ms on /cart with the attribution target input#promo-code and almost all of it in processing duration.",
    },

    content: [
        h2("Situation"),
        p("The handler as it shipped:"),
        code("ts", `
function applyPromo(code: string) {
  const promo = promos[code];
  let subtotal = 0, discount = 0;
  for (const item of cart.items) {             // 400 lines, about 1.5 ms each on a budget phone
    const line = priceLine(item);              // tax, toppings, restaurant surcharge
    subtotal += line;
    if (promo?.category === item.category) discount += Math.round(line * promo.percent / 100);
  }
  setTotals({ subtotal, discount, total: subtotal - discount });
}`, "cart/applyPromo.ts"),
        bullets([
            "The Performance panel (CPU 4x slowdown) shows one task of 612 ms under the click, marked as a long task.",
            "Taps on \"+\" during that time are handled only afterwards: input delay up to 590 ms.",
            "Typing a second promo code while the first is being applied runs both loops to the end, and the first one renders stale totals.",
        ]),

        h2("The core you need"),
        bullets([
            "**One main thread, one task at a time.** Event handlers, rendering and your loop all run there. A tap that arrives during a task waits until the task ends; that wait is INP's input delay.",
            "**A long task is any task over 50 ms.** The goal is not less work but shorter tasks: split the loop into slices of a few dozen milliseconds.",
            "**Yield between slices.** `await scheduler.yield()` ends the current task and continues the work in a new one; pending input runs in between, and the continuation goes ahead of other queued tasks. Where `scheduler.yield` is missing, `await new Promise((r) => setTimeout(r, 0))` is the fallback.",
            "**Yield on time, not on every item.** Each yield costs a little; check the clock and yield once a slice has used its budget. A small job that fits in one slice should not yield at all.",
            "**Work can become stale while it waits.** After a yield, check an `AbortSignal` (or a version counter): if a newer request started, stop without rendering.",
        ]),

        h2("Apply it in the project"),
        code("ts", `
const yieldToMain = () =>
  "scheduler" in globalThis && "yield" in scheduler
    ? scheduler.yield()
    : new Promise<void>((resolve) => setTimeout(resolve, 0));

let current: AbortController | null = null;

export async function applyPromo(code: string) {
  current?.abort();                              // a newer code replaces the running one
  const controller = (current = new AbortController());
  const promo = promos[code];
  let subtotal = 0, discount = 0;
  let sliceStart = performance.now();
  for (const item of cart.items) {
    const line = priceLine(item);
    subtotal += line;
    if (promo?.category === item.category) discount += Math.round(line * promo.percent / 100);
    if (performance.now() - sliceStart >= 40) {   // budget below the 50 ms long-task line
      await yieldToMain();
      sliceStart = performance.now();
    }
    if (controller.signal.aborted) return;
  }
  setTotals({ subtotal, discount, total: subtotal - discount });
}`, "cart/applyPromo.ts"),
        callout("info", "When a Web Worker is the better answer",
            "Pure computation with no DOM access can move off the main thread entirely, into a Web Worker. Yielding is the right tool when the work touches the DOM or app state, or when posting the data to a worker would cost as much as the work."),

        h2("Verify"),
        code("text", `
DevTools > Performance, CPU 4x slowdown, record, apply the promo code, tap "+" twice
  before: 1 task of 612 ms (long task), input delay 590 ms
  after:  16 tasks of 38-42 ms, taps handled within 40 ms
RUM summary (lesson 1), a week later:
  /cart INP p75 180 ms  good   culprit input#promo-code`, "check"),

        h2("Pitfalls"),
        bullets([
            "**`yieldToMain()` without `await`.** The promise is created and the loop keeps running in the same task, so nothing changes. Detect it in the Performance panel: still one long task.",
            "**Yielding every iteration.** 400 yields add scheduling overhead and let other tasks interleave everywhere. Yield on a time budget instead.",
            "**Rendering stale results.** Without the abort check, the first promo's loop finishes after the second and overwrites the correct totals. Check the signal after each yield.",
        ]),

        p("Now rewrite the repricing loop. The editor holds `cart/recalc.js` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run plays it on a simulated main thread with taps arriving during the work, and checks the longest task, every tap's delay and the number of yields."),
        challenge("chal_coding_fwp_122"),
    ],
});
