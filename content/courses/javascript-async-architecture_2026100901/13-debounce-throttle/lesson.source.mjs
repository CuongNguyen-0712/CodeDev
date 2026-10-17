// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-5-1",
    title: "Debounce, throttle & rate-shaping user input",
    slug: { _type: "slug", current: "debounce-throttle-rate-shaping-user-input" },
    description:
        "Input, scroll and resize events fire hundreds of times per second, and handlers that run on every one of them hammer the API and stall the page. Learn when to debounce, when to throttle, what happens to the last value, and build a production-grade debounce with leading, trailing, maxWait, cancel and flush.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, merchant dashboard of an e-commerce platform",
        problem:
            "After the new product editor shipped, the API team paged frontend: PUT /products/:id traffic is up 40x. The description field autosaves on every input event, so a merchant typing one paragraph sends about 300 requests, and some of them arrive out of order and overwrite newer text with older text. On the same page the sticky header recalculates its layout on every scroll event and the page janks on mid-range laptops. And twice this week a customer double-clicked \"Place order\" in the storefront and got two orders.",
    },

    content: [
        h2("1. The incident: handlers that run hundreds of times"),
        p("Browsers deliver user input at the rate the hardware produces it. A fast typist produces 8-12 `input` events per second, a trackpad scroll produces a `scroll` event for every frame (60-120 per second), and dragging a window edge fires `resize` continuously. None of this is a problem until the handler does something expensive: a network request, a layout read, a re-render of a large list."),
        p("The autosave in the product editor looks innocent:"),
        code("javascript", `
const editor = document.querySelector("#description");

editor.addEventListener("input", () => {
    // One PUT per keystroke - about 300 per paragraph.
    api.put(\`/products/\${productId}\`, { description: editor.value });
});

window.addEventListener("scroll", () => {
    // Forces layout on every scroll event, many times per frame on some devices.
    header.classList.toggle("compact", window.scrollY > header.offsetHeight);
});`, "product-editor.js"),
        p("There are three separate problems hiding here, and each one needs a different tool:"),
        bullets([
            "**Too many calls for a value that only matters at the end** (autosave, typeahead, validation): wait until the input settles - **debounce**.",
            "**Too many calls for a value that matters continuously** (scroll position, drag, resize, progress): run at a steady, bounded rate - **throttle**.",
            "**Accidental repeats of a one-shot action** (double-clicked submit): run the first one and swallow the echoes - a **leading-edge debounce**, backed by an idempotent server.",
        ]),
        callout("info", "Rate shaping is not cancellation",
            "Debounce and throttle decide how many times your handler starts. They do nothing about requests that are already in flight. Keep that distinction in mind - section 5 comes back to it."),

        h2("2. Debounce and throttle on one timeline"),
        p("A **debounce** groups calls into bursts. A burst starts with the first call and ends once `wait` milliseconds pass without another call. A **throttle** guarantees the handler runs at most once per interval, no matter how long the stream lasts."),
        image("debounce-throttle-timeline", {
            alt: "Timeline with a short and a long burst of input events, and the invocations produced by a trailing debounce, a leading debounce, a debounce with maxWait, and a throttle.",
            caption: "The trailing debounce stays silent for the whole long burst. maxWait bounds that silence; a throttle runs on a fixed rhythm.",
        }),
        h3("Leading and trailing edges"),
        bullets([
            "**Trailing** (the default): run once, after the burst ends, with the **latest** arguments. Right for autosave and search: you want the final text, not the first letter.",
            "**Leading**: run immediately on the first call, then ignore calls until the burst ends. Right for click guards: the user gets instant feedback and the echoes are dropped.",
            "**Both**: run on the first call and again at the end of the burst - but only if there were further calls. A single click must not run twice.",
        ]),
        h3("maxWait: the never-ending burst"),
        p("A trailing debounce has a nasty failure mode: if the burst never ends, the handler never runs. A merchant pasting and editing for ten minutes without a 1-second pause would lose everything on a crash. `maxWait` caps that: whenever `maxWait` milliseconds have passed since the burst started (or since the last invocation), run with the latest arguments even though the user is still typing."),
        p("This also shows that the two tools are one idea: a throttle is a debounce with `leading: true` and `maxWait` equal to `wait`. That is exactly how lodash implements `throttle`."),
        challenge("chal_quiz_js_511"),

        h2("3. What happens to the last value"),
        p("Most debounce bugs are not about timing - they are about the value that gets lost. Three rules keep data safe:"),
        numbered([
            "**Invoke with the latest arguments.** Remember the arguments of every call and overwrite them; a trailing call that uses the first call's arguments saves `\"h\"` instead of `\"hello\"`.",
            "**Read live state at invocation time, or pass it in.** A debounced `save()` that reads `editor.value` when it runs is fine; one that closes over a value captured on the first keystroke is not.",
            "**Decide what leaving means.** When the user navigates away, closes the modal or the component unmounts, there may be a pending trailing call. Either **flush** it (autosave: save now) or **cancel** it (typeahead: nobody wants those results any more). Never just drop it silently.",
        ]),
        code("javascript", `
const saveDescription = debounce(
    (text) => api.put(\`/products/\${productId}\`, { description: text }),
    1000,
    { maxWait: 5000 },
);

editor.addEventListener("input", () => saveDescription(editor.value));

// Leaving the editor: the last keystrokes must not be lost.
editor.addEventListener("blur", () => saveDescription.flush());
window.addEventListener("pagehide", () => saveDescription.flush());

// Discarding the draft: whatever is pending must never reach the server.
discardButton.addEventListener("click", () => saveDescription.cancel());`, "product-editor.js"),
        callout("warning", "flush() on pagehide is best-effort",
            "A normal fetch started while the page is being unloaded may be dropped. For the very last save pass keepalive: true to fetch (or use navigator.sendBeacon) and keep the payload small - keepalive requests share a budget of about 64 KB."),

        h2("4. Build it: a debounce you can trust"),
        p("Library debounces are fine in production, but the options interact in subtle ways, and you can only choose them well if you know what each one does to the timeline. The core state is small:"),
        bullets([
            "**timer id** - non-null while a burst is active. A call with no active timer starts a new burst.",
            "**pending arguments** - the latest call that has not been invoked yet. Leading invocations consume them; trailing and maxWait invocations use whatever is there.",
            "**last call time** - the burst ends at `lastCallTime + wait`.",
            "**anchor time** - when the burst started or last invoked; `maxWait` is measured from here.",
        ]),
        p("On every call you push the deadline back; when the timer fires you check which deadline you reached. Here is the skeleton of that decision - the full version, with cancel and flush, is your exercise:"),
        code("javascript", `
function onTimer() {
    const time = timers.now();
    if (time >= lastCallTime + waitMs) {
        // The user paused: the burst is over.
        // trailing enabled and something pending? -> invoke with the latest args
    } else {
        // We got here because maxWait ran out mid-burst.
        // invoke the pending args (if any) and schedule the next deadline
    }
}`),
        callout("tip", "Inject the clock",
            "The exercise passes a timers object with setTimeout, clearTimeout and now into debounce. In the app you wrap the real setTimeout/clearTimeout and performance.now(); in tests you pass a fake clock and replay a whole minute of typing in microseconds - the same trick the harness uses."),
        challenge("chal_coding_js_512", "Use only the injected timers. Overwrite the pending arguments on every call, and clear them whenever they are invoked, so a single call with leading and trailing runs once. cancel() must clear both the timer and the pending arguments."),

        h2("5. Throttling scroll, and combining with cancellation"),
        h3("Throttle visual updates to the frame"),
        p("For scroll-driven and drag-driven UI, the natural interval is the display frame. Instead of a time-based throttle, coalesce events and do the work once per animation frame - and read layout values in that frame, not in the event handler:"),
        code("javascript", `
let scheduled = false;

window.addEventListener("scroll", () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        header.classList.toggle("compact", window.scrollY > 64);
    });
}, { passive: true });`, "sticky-header.js"),
        p("`passive: true` tells the browser the handler will never call `preventDefault()`, so scrolling can start without waiting for your JavaScript. For questions like \"is this element visible?\" skip the scroll handler entirely and use `IntersectionObserver`; for size changes use `ResizeObserver`, which already batches to once per frame."),
        h3("Debounce decides when to start; AbortController decides what to keep"),
        p("A debounced typeahead sends far fewer requests, but two of them can still overlap: the user pauses on \"lap\", types \"top\", pauses again. The responses can arrive in either order. The fix is the latest-request-wins pattern from the AbortController lesson, layered under the debounce:"),
        code("javascript", `
let inflight = null;

const runSearch = debounce(async (query) => {
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    try {
        const res = await fetch(\`/api/search?q=\${encodeURIComponent(query)}\`, { signal: controller.signal });
        renderResults(await res.json());
    } catch (err) {
        if (err.name !== "AbortError") showError(err);
    }
}, 250);

input.addEventListener("input", () => runSearch(input.value));`, "typeahead.js"),
        challenge("chal_quiz_js_513"),
        callout("success", "Rule of thumb",
            "Debounce the decision to start work, throttle work that tracks a continuous value, and cancel work whose result is no longer wanted. Most production input handlers need two of the three."),

        h2("6. Choosing the numbers"),
        bullets([
            "**Typeahead**: 150-300 ms trailing. Shorter waits feel snappier but send more requests; above about 400 ms users notice the delay.",
            "**Autosave**: 800-2000 ms trailing with `maxWait` of 5-10 s, plus `flush()` on blur and page hide.",
            "**Validation messages**: about 500 ms trailing so the field does not shout \"invalid email\" after the first character - but validate immediately on blur.",
            "**Scroll, drag, pointer move**: once per animation frame (requestAnimationFrame), never a fixed 16 ms timer.",
            "**Resize-driven layout**: `ResizeObserver`, or a 100-200 ms trailing debounce for expensive recalculations such as chart redraws.",
            "**Submit buttons**: leading-only, a few hundred milliseconds - and an idempotency key on the request, because the network can still duplicate it.",
        ]),

        h2("7. Checklist"),
        bullets([
            "Classify each hot handler: value at the end (debounce), continuous value (throttle / frame), one-shot action (leading guard).",
            "Trailing invocations use the latest arguments; leading + trailing never runs a single call twice.",
            "Long bursts are bounded with `maxWait` wherever losing data is worse than an extra call.",
            "Every debounced function with a pending call is flushed or cancelled on unmount, navigation or page hide.",
            "Debounce is combined with abort-or-ignore for requests whose responses can overlap.",
            "Scroll and pointer handlers are passive and do their work once per frame; observers replace polling of layout.",
            "Timers and the clock are injectable so the behaviour can be tested deterministically.",
        ]),
    ],
});
