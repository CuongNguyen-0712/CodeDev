// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-6-2",
    title: "Modeling async flows as state machines",
    slug: { _type: "slug", current: "modeling-async-flows-as-state-machines" },
    description:
        "isLoading, isError, data and a few more flags can describe dozens of combinations - most of them impossible. Replace boolean soup with explicit states, events and a pure transition function that ignores stale responses, treats retries and cancellation as transitions, and can be tested without a network.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, mobile web team of a home-services marketplace",
        problem:
            "The job-search panel has collected three support tickets in one week: \"it says Something went wrong above the results\", \"the spinner never stops after I go back\", and \"I typed electrician but it shows plumbers\". The component tracks its request with isLoading, isError, isCancelled, isRetrying and data. Each bug fix added another if, and each if created a new bug. You are asked to make the panel's states impossible to get wrong.",
    },

    content: [
        h2("1. Boolean soup"),
        p("This is the shape of the code behind the tickets - every flag added by a different person for a good reason:"),
        code("javascript", `
let isLoading = false;
let isError = false;
let isCancelled = false;
let isRetrying = false;
let data = null;

async function load(query) {
    isLoading = true;
    isCancelled = false;
    try {
        data = await api.searchJobs(query);
    } catch (error) {
        isError = true;
    } finally {
        isLoading = false;
        isRetrying = false;
    }
}`, "jobSearchPanel.js"),
        p("Four booleans and a nullable value allow 2^5 = 32 combinations. The panel only has five meaningful situations: nothing asked yet, waiting, showing results, showing an error, cancelled. The other 27 combinations are **impossible states** - and the code still has to do something when it lands in one, such as `isLoading && isError` or `isCancelled && data` from a response that arrived after the user pressed Back."),
        p("Follow the flags through a common sequence before reading on."),
        challenge("chal_quiz_js_621"),
        callout("warning", "Every if is a promise to keep flags consistent",
            "With independent flags, each branch has to remember to reset every other flag. Forgetting one line - isError = false - is enough to show an error banner over valid results. The compiler cannot help, because every combination is a valid set of booleans."),

        h2("2. Name the states, not the flags"),
        p("Replace the flags with one `status` field and make each status carry only the data that is meaningful in it. This is a **discriminated union**: the `status` value tells you, and the type checker, which other fields exist."),
        code("typescript", `
type SearchState =
    | { status: "idle"; requestId: 0 }
    | { status: "loading"; requestId: number; attempt: number }
    | { status: "success"; requestId: number; data: Job[] }
    | { status: "error"; requestId: number; attempt: number; error: string }
    | { status: "cancelled"; requestId: number };

function render(state: SearchState) {
    switch (state.status) {
        case "idle":      return emptyHint();
        case "loading":   return spinner(state.attempt > 1 ? "Retrying..." : "Searching...");
        case "success":   return results(state.data);     // data only exists here
        case "error":     return errorBanner(state.error);
        case "cancelled": return emptyHint();
        default: {
            const unreachable: never = state;          // compile error if a status is not handled
            return unreachable;
        }
    }
}`, "searchState.ts"),
        p("In plain JavaScript you get most of the same checking from JSDoc in an editor with type checking on (`// @ts-check`):"),
        code("javascript", `
/**
 * @typedef {{ status: "idle", requestId: 0 }} Idle
 * @typedef {{ status: "loading", requestId: number, attempt: number }} Loading
 * @typedef {{ status: "success", requestId: number, data: Job[] }} Success
 * @typedef {{ status: "error", requestId: number, attempt: number, error: string }} Failure
 * @typedef {{ status: "cancelled", requestId: number }} Cancelled
 * @typedef {Idle | Loading | Success | Failure | Cancelled} SearchState
 */`),
        p("The quiz bug is now impossible by construction: entering `loading` builds a brand-new object, so there is no `error` field left over to render."),

        h2("3. Events and a pure transition function"),
        p("States say where you are; **events** say what happened: the user asked for data (`FETCH`), the network answered (`RESOLVE`, `REJECT`), the user gave up (`CANCEL`) or asked to try again (`RETRY`). A **transition function** decides the next state from the current state and an event - nothing else."),
        image("request-state-machine", {
            alt: "State diagram with idle, loading, success, error and cancelled. FETCH goes from idle, success and cancelled to loading and from loading back to loading with a new request id. RESOLVE and REJECT with the current request id go to success and error. CANCEL goes from loading to cancelled. RETRY goes from error back to loading while attempts remain. A note says stale events return the same state object.",
            caption: "Arrows are the only legal moves. Anything else - including a response for an older request - leaves the state untouched.",
        }),
        p("Written as a reducer, it is a `switch` on the event with a guard per case:"),
        code("javascript", `
function transition(state, event) {
    switch (event.type) {
        case "FETCH":
            // allowed from every state: a new request supersedes the old one
            return { status: "loading", requestId: state.requestId + 1, attempt: 1 };

        case "CANCEL":
            return state.status === "loading"
                ? { status: "cancelled", requestId: state.requestId }
                : state; // nothing to cancel: same object, no re-render

        // RESOLVE, REJECT and RETRY follow the same pattern: check the guard,
        // build a new object, or return \`state\` unchanged.
        default:
            return state;
    }
}`, "requestMachine.js"),
        p("Three properties make this worth the ceremony:"),
        bullets([
            "**Pure**: no `await`, no timers, no network. Testing it is a table of `(state, event) -> expected` rows - no fake timers needed, which is the cheapest kind of deterministic test from the previous lesson.",
            "**Total**: every event is handled in every state, even if the answer is \"ignore it\". Out-of-order events stop being bugs and become rows in that table.",
            "**Same object when nothing changes**: returning the identical `state` lets `useReducer`, a store's `subscribe` or a signal skip the re-render - and makes \"was this event ignored?\" a simple `next === state` check.",
        ]),

        h2("4. Stale responses: the request id"),
        p("The \"electrician shows plumbers\" ticket is a race: the user typed two queries, and the first, slower response arrived last. Lesson 3.2 fixed this kind of race with `AbortController`, and you should still abort superseded requests to save bandwidth. But aborting is not enough on its own to keep the state correct:"),
        bullets([
            "The response may already be parsed and queued as a microtask when you abort; the `await` still resumes with data.",
            "Some sources cannot be aborted at all: a Web Worker computation, an IndexedDB read, a third-party SDK.",
            "A retry creates a new attempt while the old one may still answer late.",
        ]),
        p("So the machine itself refuses stale events. Every `FETCH` (and every `RETRY`) creates a new `requestId`; `RESOLVE` and `REJECT` carry the id of the request that produced them and are applied only while `loading` that exact id. The UI can no longer show an answer to a question the user is not asking anymore."),
        challenge("chal_coding_js_622", "Compute once whether the event belongs to the current request (status is loading and the ids match) and reuse it for RESOLVE and REJECT. Every ignored case must return the original state object, not a copy."),

        h2("5. Retries and cancellation are transitions too"),
        p("In the boolean version, `isRetrying` was a flag that could be true while nothing was retrying. In the machine, a retry is just an arrow from `error` back to `loading`, with a guard (`attempt < 3`) and a new request id. Cancellation is an arrow from `loading` to `cancelled`. Neither needs a flag."),
        p("The machine only decides. The side effects - calling the API, aborting it, scheduling an automatic retry - live in a small **controller** around it, which turns the outside world into events:"),
        numbered([
            "On user input: `dispatch({ type: \"FETCH\" })`, then start the request for the new state's `requestId` with a fresh `AbortController`.",
            "When the request settles: dispatch `RESOLVE` with the data or `REJECT` with the error message, each with a `requestId`.",
            "On `CANCEL` (Back button, panel closed): dispatch it and abort the in-flight request.",
            "When the state becomes `error` and attempts remain, the controller may schedule `RETRY` after a backoff delay - the retry engine from lesson 3.3 plugs in here unchanged.",
        ]),
        p("A correct machine can still be fed wrong events. The panel's controller looked fine in review, yet the third ticket kept coming back:"),
        challenge("chal_fix_js_623"),
        callout("tip", "A response must carry its own identity",
            "Whatever identifies a request - an id, a version, a query string - has to be captured when the request starts and travel with its result. Reading \"the current id\" when the result arrives asks the wrong question: by then the current request may be a different one."),

        h2("6. When to reach for a library"),
        p("A hand-written reducer is enough for a single request lifecycle. When flows grow - nested states (`editing.saving`), parallel regions (upload progress while the form stays editable), delayed transitions, many machines talking to each other - a statechart library pays off. **XState** is the best-known one in JavaScript. Its machines are data, so they can be visualised, and it ties invoked promises to states: leaving `loading` stops the invoked actor, so a stale result is dropped by construction."),
        code("javascript", `
import { createMachine, fromPromise } from "xstate";

const searchMachine = createMachine({
    initial: "idle",
    states: {
        idle: { on: { FETCH: "loading" } },
        loading: {
            invoke: {
                src: fromPromise(({ input, signal }) => searchJobs(input.query, { signal })),
                input: ({ event }) => ({ query: event.query }),
                onDone: "success",
                onError: "error",
            },
            on: {
                FETCH: { target: "loading", reenter: true }, // restart: the old invocation is stopped and aborted
                CANCEL: "cancelled",
            },
        },
        success: { on: { FETCH: "loading" } },
        error: { on: { FETCH: "loading", RETRY: "loading" } },
        cancelled: { on: { FETCH: "loading" } },
    },
});`, "searchMachine.js"),
        p("Whether you use XState, React's `useReducer` or a 30-line reducer, the design work is the same: list the states, list the events, and decide for every pair what happens - including \"nothing\"."),
        callout("info", "Testing the machine",
            "Because transition is pure, the best tests are table-driven: one row per (state, event) pair you care about, asserting the next state and whether it is the same object. Out-of-order sequences - RESOLVE for request 1 after FETCH number 2 - are just more rows."),

        h2("7. Checklist"),
        bullets([
            "If a component has two or more booleans describing one request, list the combinations; the impossible ones are bugs waiting for a sequence.",
            "Model the request as a discriminated union on `status`; each state carries only its own fields.",
            "Put every decision in a pure `transition(state, event)`; keep `await`, timers and `fetch` in the controller.",
            "Give every `FETCH` and `RETRY` a new `requestId` and apply `RESOLVE`/`REJECT` only for the current one.",
            "Capture the request id when the request starts and send it with the result.",
            "Return the same state object for ignored events so subscribers can skip work.",
            "Retries and cancellation are transitions with guards, not flags.",
            "Reach for XState when you need nested or parallel states, delays or many cooperating machines.",
        ]),
    ],
});
