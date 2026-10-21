// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-jsf-2-1",
    title: "Closures & scope bugs in loops",
    slug: { _type: "slug", current: "closures-scope-bugs-in-loops" },
    description:
        "Five retry callbacks, one message id: the last user gets the same reminder five times and four users get nothing. Learn lexical and block scope, why closures capture variables and not values, how let fixes the classic loop bug, how closures keep private state (counters, once, memoize), and how to spot stale closures in callbacks.",
    estimatedTime: 20,

    scenario: {
        role: "Full-stack engineer, notification center of a clinic booking app",
        problem:
            "A 40-minute push outage left thousands of appointment reminders in the widget's retry queue. When the push service came back, the retry code fired as designed - and support woke up to two kinds of tickets. Patients at the end of each retry batch got the same reminder five times; everyone else got nothing, and 212 of them missed their appointment. Worse, nurses who pressed \"Cancel reminder\" for one patient either cancelled the whole batch or nothing at all. The logs show five retries per batch, all sending the same message id.",
    },

    content: [
        h2("1. The incident: five retries, one message"),
        p("The retry code is old, small and was never touched during the outage. For every failed push it schedules a retry, a little later each time, so the push service is not flooded when it recovers:"),
        code("javascript", `
// notification-widget.js - retry the pushes that failed during the outage
function retryFailed(failed) {
    for (var i = 0; i < failed.length; i++) {
        var reminder = failed[i];
        setTimeout(function () {
            pushService.send(reminder.patientId, reminder.messageId);
        }, 2000 * (i + 1));
    }
}

retryFailed([
    { patientId: "p-11", messageId: "r-801" },
    { patientId: "p-12", messageId: "r-802" },
    { patientId: "p-13", messageId: "r-803" },
    { patientId: "p-14", messageId: "r-804" },
    { patientId: "p-15", messageId: "r-805" },
]);
// 2 s, 4 s, 6 s, 8 s, 10 s later: send("p-15", "r-805") - five times`, "notification-widget.js"),
        p("The delays are right - retries go out every 2 seconds, as designed. The **payload** is wrong: every callback sends the last reminder. The bug is not in the push service and not in `setTimeout`; it is in what each callback can see when it finally runs. Before reading on, predict a smaller version of it."),
        challenge("chal_quiz_jsf_211"),

        h2("2. Reproduce it in five lines"),
        p("You do not need a push service or real timers to see the bug. Any callback that runs after the loop shows it:"),
        code("javascript", `
const later = [];
for (var i = 0; i < 3; i++) {
    later.push(() => console.log("retry", i));
}
later.forEach((run) => run());
// retry 3
// retry 3
// retry 3`, "repro.mjs"),
        p("Run it with `node repro.mjs`. Every callback prints `3`, a value the loop body never even saw (the loop stops when `i` becomes 3). That one detail tells you what happened: the callbacks did not remember the value of `i` from their iteration - they all read the **same variable** after the loop had moved it on."),

        h2("3. Scope: where a name lives"),
        p("**Scope** is the region of code where a name refers to a particular variable. JavaScript uses **lexical scope**: you can tell which variable a name means by reading the source, from the inside out. A function sees its own variables, then those of the block or function around it, and so on up to the module scope."),
        code("javascript", `
const tenant = "clinic-a";          // module scope

function buildUrl(path) {           // function scope: path
    const base = "https://api.example.com";
    if (path.startsWith("/")) {     // block scope
        const clean = path.slice(1);
        return \`\${base}/\${tenant}/\${clean}\`;   // sees clean, base, path, tenant
    }
    // clean does not exist here
    return \`\${base}/\${tenant}/\${path}\`;
}`),
        h3("var is function-scoped, let and const are block-scoped"),
        bullets([
            "**`var`** belongs to the nearest **function** (or the module/script). A `var` inside a loop or an `if` is one variable for the whole function. It is also hoisted: it exists, as `undefined`, before the line that declares it.",
            "**`let`** and **`const`** belong to the nearest **block** - the `{ ... }` of a loop body, an `if`, or a plain block. Every time execution enters the block, a new set of these variables is created. Reading them before their declaration throws a `ReferenceError` (the temporal dead zone) instead of quietly giving `undefined`.",
            "**`const`** only stops you from reassigning the variable. An object held in a `const` can still be mutated.",
        ]),
        callout("info", "Strict mode does not change this",
            "ES modules (.mjs, or \"type\": \"module\" in package.json - the default for new Node 24 projects) are always in strict mode. Strict mode forbids some sloppy habits, but var is still function-scoped there. The only fix is to stop using var."),

        h2("4. Closures capture variables, not values"),
        p("A **closure** is a function together with the scope it was created in. When a function is created, it keeps a reference to the variables around it - not a snapshot of their values. When it runs later, it reads whatever those variables hold **at that moment**."),
        p("In the incident, `var reminder` and `var i` belong to `retryFailed`, so there is exactly **one** `reminder` for the whole call. Each iteration assigns a new object to that one variable. Five callbacks are created, all pointing at the same variable, and by the time the first timer fires, the loop has long finished and `reminder` holds the fifth object."),
        image("shared-vs-per-iteration-binding", {
            alt: "Two panels. Left, var: five retry callbacks all point to a single reminder variable in the function scope that holds r-805, so all five send r-805. Right, let and const: each iteration has its own block scope with its own reminder variable, r-801 to r-805, and each callback points to its own.",
            caption: "With var there is one binding, shared by every callback. With let or const in the loop, every iteration gets its own binding, and each callback keeps the one it was created next to.",
        }),
        h3("Why let fixes the loop"),
        p("A `const` or `let` declared in the loop **body** is created fresh on every iteration, because the body is a block that is entered again each time. The `for (let i = ...)` header is special-cased too: the language creates a new `i` for each iteration and copies the previous value into it before `i++` runs. So each callback closes over its own `i` and its own `reminder`:"),
        code("javascript", `
for (let i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 0);   // 0, 1, 2
}

for (const reminder of failed) {            // for...of: a new const per item
    setTimeout(() => pushService.send(reminder.patientId, reminder.messageId), 0);
}`),
        callout("warning", "Fixing half the loop is not enough",
            "Changing for (var i ...) to for (let i ...) but keeping var reminder inside the body still leaves one shared reminder for the whole function. Every variable a later callback reads must be a fresh binding per iteration."),

        h2("5. Closures on purpose: private state"),
        p("The same mechanism that caused the bug is one of the most useful tools in the language. A function that returns another function gives the inner one private variables that nothing else can reach - no class, no global."),
        code("javascript", `
// A counter: each call of makeCounter() creates a new count
function makeCounter(start = 0) {
    let count = start;
    return {
        next: () => ++count,
        peek: () => count,
    };
}
const sent = makeCounter();
const failed = makeCounter();
sent.next(); sent.next(); failed.next();
console.log(sent.peek(), failed.peek());   // 2 1

// once: the wrapped function runs at most one time
function once(fn) {
    let done = false;
    let result;
    return (...args) => {
        if (!done) {
            done = true;
            result = fn(...args);
        }
        return result;
    };
}
const showOutageBanner = once(() => console.log("Push is delayed, we are retrying"));
showOutageBanner(); showOutageBanner();    // logs once

// memoize: remember results by key
function memoize(fn) {
    const cache = new Map();
    return (key) => {
        if (!cache.has(key)) cache.set(key, fn(key));
        return cache.get(key);
    };
}
const getClinicName = memoize((id) => lookupClinic(id).name);`, "private-state.mjs"),
        p("Each pattern relies on the rule you just learned: the returned function keeps a reference to `count`, `done` or `cache`, and sees every change made to them. That is exactly what you want here - the state is shared between calls of **one** wrapper, and separate between wrappers."),
        callout("tip", "A memo cache never forgets",
            "The Map inside memoize lives as long as the returned function does. Memoizing by user id or request id in a long-running Node server grows memory forever. Bound the cache (drop the oldest entry past a limit) or memoize only small, fixed key sets."),

        h2("6. Stale closures in callbacks"),
        p("The loop bug is one case of a more general problem: a callback runs later than it was created, and reads its variables at a different moment than you assumed. Two shapes show up again and again:"),
        numbered([
            "**The variable moved on.** The callback reads a variable that was reassigned after it was created - the loop counter, a shared `current` item, a `let` that holds \"the latest\" value. You wanted the value from creation time and got the latest one.",
            "**The value was copied too early.** The callback copied a value when it was created and keeps using it after it changed - a config read once at start-up, a user captured before they switched accounts. You wanted the latest value and got the one from creation time.",
        ]),
        code("javascript", `
// Shape 2: the handler copied the locale once
let settings = { locale: "en-US" };
const locale = settings.locale;
pushService.onDelivered((msg) => log(formatTime(msg.at, locale)));
settings = { locale: "vi-VN" };   // the handler still formats with "en-US"

// Decide explicitly which moment you need:
const startupLocale = settings.locale;   // value NOW: copy it into a const, on purpose
pushService.onDelivered((msg) => log(formatTime(msg.at, settings.locale)));   // LATEST: read when it runs`),
        p("A third, sneakier variant: a callback that reads `failed[i]` with a correct per-iteration `i`. The index is right, but the closure captured the **array variable**, not the reminder. If the widget empties or reorders its queue before the timer fires, `failed[i]` is now a different reminder - or `undefined`. Capture the thing you need (`const reminder = failed[i]`) at scheduling time."),

        h2("7. Fix the retry scheduler"),
        p("The fix for the incident is small - declare the per-reminder variables with `const` and `let`, so every iteration has its own:"),
        code("javascript", `
function retryFailed(failed) {
    for (const [i, reminder] of failed.entries()) {
        setTimeout(() => {
            pushService.send(reminder.patientId, reminder.messageId);
        }, 2000 * (i + 1));
    }
}`, "notification-widget.js"),
        p("The production version is a little bigger: it takes an injected `schedule` function (so tests can use a fake clock instead of real timers) and returns a `cancel(messageId)` function for the nurses' \"Cancel reminder\" button. It still has the original bug. Fix it so that each retry sends its own notification once, cancelling one reminder affects only that one, and retries keep working after the widget empties its queue."),
        challenge("chal_fix_jsf_212", "Count the item variables the loop creates: with var there is one for the whole function. Make every value a later callback needs a new binding per iteration, and capture the notification itself, not a position in an array that the widget clears."),

        h2("8. Pitfalls"),
        bullets([
            "**`var` in any loop that creates callbacks** - `setTimeout`, event listeners, promise `then` handlers, `array.push(() => ...)`. Replace it with `let`/`const`; a linter rule (`no-var`, `no-loop-func`) catches it before review does.",
            "**Half-fixes.** `for (let i ...)` with `var item = list[i]` in the body still shares `item`. So does a `let item` declared **above** the loop and reassigned inside it.",
            "**Reading the collection later.** `list[i]` inside a callback depends on the array at call time. Capture the element when you schedule the work.",
            "**Fixing the symptom.** A \"don't send the same id twice\" guard hides the duplicates and turns five wrong sends into one wrong send; the other users still get nothing. Fix the binding, not the output.",
            "**The old IIFE trick.** `(function (r) { setTimeout(() => send(r), 0); })(reminder)` creates a new scope per iteration and works, but it exists only because `var` had no block scope. In ES2015+ code, `const` does the same job with less noise.",
            "**Unbounded closures.** A closure keeps every variable it references alive. A long-lived callback that closes over a large array or a cache keeps all of it in memory until the callback itself is released (for example with `removeEventListener` or `clearTimeout`).",
        ]),

        h2("9. Checklist"),
        bullets([
            "New code never uses `var`; `const` by default, `let` only when the variable is reassigned.",
            "Every callback created in a loop reads only per-iteration bindings (`for (let ...)`, `for (const x of ...)`, or a `const` in the body).",
            "Callbacks capture the value they need at scheduling time, not an index into a collection that can change.",
            "For each callback, you know whether it needs the value from creation time (copy into a `const`) or the latest value (read it when the callback runs).",
            "Private state lives in a closure (counter, once, memoize) instead of a global, and caches in long-lived closures are bounded.",
            "Code that schedules work takes the scheduler as a parameter, so tests can run it on a fake clock and check exactly what each callback sent.",
        ]),
    ],
});
