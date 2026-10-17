// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-5-3",
    title: "Event listeners, subscriptions & memory leaks",
    slug: { _type: "slug", current: "event-listeners-subscriptions-memory-leaks" },
    description:
        "In a single-page app nothing is cleaned up for you when the route changes. Learn how forgotten listeners, intervals and WebSocket subscriptions keep whole views alive, how to clean up with removeEventListener, once and AbortSignal, how to write leak-free framework effects, and how to prove a leak with heap snapshots.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, customer support chat app",
        problem:
            "Support agents keep the chat app open for a whole shift and switch between conversations hundreds of times. By the afternoon the tab uses 1.8 GB, typing lags by half a second, and every incoming message is rendered several times - once for each conversation the agent has opened today. A full page reload fixes it, until the next afternoon. Nothing in the code \"leaks\" on purpose: every view removes its DOM when it closes.",
    },

    content: [
        h2("1. The incident: views that never die"),
        p("A multi-page site gets a clean slate on every navigation: the browser throws away the whole JavaScript heap. A single-page app never does. Every listener, timer and subscription you register lives until you remove it - or until the tab closes. In the chat app, opening a conversation does this:"),
        code("javascript", `
function openConversation(id, root) {
    const listEl = renderConversation(id, root);

    window.addEventListener("resize", () => layoutMessages(listEl));
    socket.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (msg.conversationId === id) appendMessage(listEl, msg);
    });
    presence.subscribe(id, (status) => renderPresence(listEl, status));
    const typingTimer = setInterval(() => refreshTyping(listEl), 3000);

    return function close() {
        root.replaceChildren();          // the DOM is gone...
        clearInterval(typingTimer);      // ...one timer is cleared, nothing else
    };
}`, "conversation.js"),
        p("Closing the conversation removes its DOM, but `window`, the shared `socket` and the `presence` store are still alive, and each of them holds a closure that references `listEl`. Those closures keep the whole message list in memory - and keep running for every resize and every socket message."),
        bullets([
            "**Memory grows** with every navigation: each closed view stays reachable.",
            "**Work multiplies**: 50 stale `message` listeners all parse and process every incoming message.",
            "**Bugs appear**: stale handlers write into views that are no longer on screen, or into shared state.",
        ]),

        h2("2. Why the garbage collector cannot help"),
        p("The garbage collector frees objects that are no longer **reachable** from a root (the global object, the current call stack, active timers and pending callbacks). A DOM subtree removed from the document but still referenced from JavaScript becomes a **detached** tree: invisible, but reachable, so it is kept."),
        image("listener-leak-retainers", {
            alt: "Long-lived objects (window, WebSocket, price store, timer list) point to listener closures, which point into an unmounted, detached conversation view. A cleanup band shows abort, unsubscribe and clearInterval cutting those links.",
            caption: "The view is not leaked by itself. It is retained by a chain that starts at something that outlives it.",
        }),
        p("A leak is therefore always a **retainer chain**: long-lived object -> listener or callback -> closure -> your view. Cleanup means cutting the first link. Typical long-lived holders in browser apps:"),
        bullets([
            "`window` and `document` listeners (`resize`, `scroll`, `keydown`, `visibilitychange`).",
            "Shared connections: WebSocket, EventSource, BroadcastChannel, a Pusher or Firebase channel.",
            "Stores and event buses that live at module level.",
            "Timers: `setInterval` callbacks run (and stay reachable) until cleared.",
            "Observers: `ResizeObserver`, `IntersectionObserver` and `MutationObserver` keep their callbacks until `disconnect()`.",
        ]),

        p("Before reading on, look at a cleanup that seems correct and predict what it does."),
        challenge("chal_quiz_js_531"),

        h2("3. Removing listeners correctly"),
        p("`removeEventListener(type, listener, options)` removes exactly one registration: the one with the same **type**, the same **function object** and the same **capture flag**. If any of the three differ, the call silently does nothing."),
        code("javascript", `
// Matches nothing: a new arrow function is not the registered one.
window.addEventListener("resize", () => layoutMessages(listEl));
window.removeEventListener("resize", () => layoutMessages(listEl));

// Matches: keep the reference.
const onResize = () => layoutMessages(listEl);
window.addEventListener("resize", onResize);
window.removeEventListener("resize", onResize);

// Matches nothing: registered for the capture phase, removed for bubbling.
document.addEventListener("keydown", onKeyDown, { capture: true });
document.removeEventListener("keydown", onKeyDown);
document.removeEventListener("keydown", onKeyDown, { capture: true }); // this one works`),
        callout("warning", "Only capture counts when removing",
            "passive and once are not part of a listener's identity; capture is. A listener added with capture: true must be removed with capture: true, otherwise it stays registered."),
        h3("once: listeners that remove themselves"),
        p("For one-shot events - the first user interaction, a `transitionend`, a `load` - register with `{ once: true }`. The browser removes the listener right after its first call. It does not help when the event never fires, so a view that may close first still needs cleanup."),

        h2("4. AbortSignal: one switch for all cleanup"),
        p("Tracking every handler reference by hand is how bugs creep in. Since all modern browsers support it, the cleaner pattern is to pass a `signal` when registering and abort one controller on teardown. Every listener registered with that signal is removed, whatever its capture flag, and you never need the function reference again:"),
        code("javascript", `
function openConversation(id, root) {
    const controller = new AbortController();
    const { signal } = controller;
    const listEl = renderConversation(id, root);

    window.addEventListener("resize", () => layoutMessages(listEl), { signal });
    document.addEventListener("keydown", onShortcut, { capture: true, signal });
    socket.addEventListener("message", onMessage, { signal });

    const unsubscribePresence = presence.subscribe(id, (s) => renderPresence(listEl, s));
    const typingTimer = setInterval(() => refreshTyping(listEl), 3000);
    const resizeObserver = new ResizeObserver(() => layoutMessages(listEl));
    resizeObserver.observe(listEl);

    // Things that do not take a signal are tied to it explicitly.
    signal.addEventListener("abort", () => {
        unsubscribePresence();
        clearInterval(typingTimer);
        resizeObserver.disconnect();
    });

    return () => {
        controller.abort();   // idempotent: a second call does nothing
        root.replaceChildren();
    };
}`, "conversation.js"),
        bullets([
            "**One controller per mounted instance.** A module-level controller is shared by every instance: unmounting one kills the others, and anything registered after the first abort is never added at all.",
            "**The same signal can cancel fetches.** Pass it to `fetch(url, { signal })` and a request for a closed conversation is aborted too - the AbortController lesson's pattern, now owning the whole lifetime of the view.",
            "**Subscriptions return their own cleanup.** Keep the returned unsubscribe function; calling `subscribe` returns a new registration, it does not give you a way to undo the old one.",
        ]),
        challenge("chal_fix_js_532", "There is more than one leak. For each thing mountWidget registers, check that unmount() releases exactly that registration - same reference, same capture flag - or switch to a per-widget AbortController."),

        h2("5. Cleanup in framework effects"),
        p("Frameworks give you a place for teardown, but they do not write it for you. In React, the function returned from `useEffect` runs before the effect re-runs and when the component unmounts:"),
        code("javascript", `
useEffect(() => {
    const controller = new AbortController();
    const onMessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.conversationId === conversationId) setMessages((m) => [...m, msg]);
    };
    socket.addEventListener("message", onMessage, { signal: controller.signal });
    const unsubscribe = presence.subscribe(conversationId, setPresence);

    return () => {
        controller.abort();
        unsubscribe();
    };
}, [conversationId]);`, "Conversation.jsx"),
        bullets([
            "**Dependencies matter.** When `conversationId` changes, the old subscription must be torn down before the new one starts - the cleanup function does exactly that. A missing cleanup leaks one subscription per conversation switch.",
            "**Strict Mode helps you.** In development React mounts, unmounts and mounts every component once more on purpose. If a handler fires twice in development, your cleanup is incomplete.",
            "**Vue and Svelte** have the same contract: `onUnmounted` / `onBeforeUnmount` and the function returned from `onMount` or an `$effect`.",
        ]),

        h2("6. Proving a leak with heap snapshots"),
        p("Memory graphs that only go up are a hint; a heap snapshot is proof. The workflow in Chrome DevTools, Memory panel:"),
        numbered([
            "Load the page, do the action once (open and close a conversation) to warm up caches, then take **snapshot 1**.",
            "Repeat the action a known number of times, for example 10.",
            "Click the trash-can icon to force garbage collection, then take **snapshot 2**.",
            "Select snapshot 2, switch to **Comparison** against snapshot 1 and sort by **# Delta**. Objects whose count grew by roughly 10 are your suspects.",
            "Type `Detached` in the class filter to find detached DOM trees, select one and read the **Retainers** panel from the bottom up: it shows the chain from a GC root to the node.",
        ]),
        callout("tip", "Count listeners directly",
            "In the Console, getEventListeners(window) lists every listener on an object (a DevTools-only helper). The Elements panel has an Event Listeners tab for the selected node. The Performance monitor shows live JS heap size, DOM node count and listener count while you click around."),
        challenge("chal_quiz_js_533"),

        h2("7. Checklist"),
        bullets([
            "Every mount has a matching teardown that releases listeners, subscriptions, timers, observers and in-flight requests.",
            "Listeners are removed with the same function reference and the same capture flag - or, better, registered with a per-instance `AbortSignal`.",
            "`once: true` for one-shot events, but never as the only cleanup for events that might not fire.",
            "The unsubscribe function returned by stores and channels is kept and called; teardown is idempotent.",
            "Framework effects return a cleanup function, and effects with dependencies clean up before re-subscribing.",
            "Long-lived objects (window, sockets, stores, module-level caches) never keep references to views after teardown.",
            "Leak checks are part of QA: repeat a navigation 10 times, compare heap snapshots, and look for detached trees and growing listener counts.",
        ]),
    ],
});
