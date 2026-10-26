// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-4-3",
    title: "Debounced search that cancels stale requests, tested with fake timers",
    slug: { _type: "slug", current: "debounced-search-cancel-stale-requests" },
    description:
        "Typing \"react hooks\" in the catalog search sent 11 requests, and the slow answer for \"re\" arrived last and replaced the right results. Learn the three separate jobs of a search box - wait until the user pauses (debounce), stop work nobody needs (abort) and never let an old answer reach the screen (latest wins) - how TanStack Query covers the last two with query keys and the AbortSignal, and how to test all of it in milliseconds with fake timers.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "Bug report from QA: \"Search for 'react hooks' on the catalog. The list flickers while I type, and about one time in five it ends up showing courses that do not contain 'hooks' - Node Streams in Practice is in the results. Typing slower makes it go away.\" The API dashboard shows the search endpoint at eleven requests per search, and its p95 latency doubled since the search box went live. The box calls GET /courses?search= on every keystroke and writes whichever response arrives into the results.",
    },

    content: [
        h2("1. The incident: the last answer is not the latest question"),
        p("The search box was written in an afternoon, and it looks reasonable:"),
        code("tsx", `
function CatalogSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Course[]>([]);

    useEffect(() => {
        if (!query) return;
        fetch(\`https://api.codedev.test/courses?search=\${encodeURIComponent(query)}\`)
            .then((res) => res.json())
            .then(setResults);
    }, [query]);

    return (
        <>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            <CourseList courses={results} />
        </>
    );
}`, "CatalogSearch.tsx - the version that shipped"),
        p("Every keystroke changes `query`, every change runs the effect, and every effect sends a request. Typing `react hooks` is 11 keystrokes, so 11 requests. The responses do not come back in the order they were sent: a short prefix such as `re` matches many courses and is the slowest query of the eleven. When it finishes last, its `setResults` runs last, and the screen shows the answer to a question the user stopped asking a second ago."),

        h2("2. Reproduce it and read the evidence"),
        p("Open the catalog, open DevTools, select **Network**, filter by `search=` and set throttling to **Slow 4G** so that differences in latency become visible. Type `react hooks` at normal speed. The waterfall shows something like this:"),
        code("text", `
Name                       Start     Time      Finished at
?search=r                  0 ms      140 ms    140
?search=re                 80 ms     1.10 s    1180   <- finished last
?search=rea                160 ms    210 ms    370
?search=reac               240 ms    190 ms    430
?search=react              320 ms    230 ms    550
?search=react%20           400 ms    220 ms    620
...
?search=react%20hooks      800 ms    260 ms    1060`, "Network panel, Slow 4G"),
        p("The request for the full text finished at 1060 ms; the one for `re` at 1180 ms. Whatever renders last wins, so the list ends up showing every course containing `re`, Node Streams in Practice included. You can confirm it without the network: in the React DevTools **Components** tab, select `CatalogSearch` and watch `results` change one last time after the input stopped."),
        p("There are three different problems in that waterfall, and each needs its own fix:"),
        numbered([
            "**Too many requests.** Ten of the eleven were never needed: the user had not finished typing. Fix: wait until the user pauses - **debounce**.",
            "**Wasted work.** Requests that are already outdated keep downloading and keep the server busy. Fix: **abort** the previous request when a new one starts.",
            "**A wrong answer on screen.** An old response overwrote a newer one. Fix: only the **latest** request may update the screen.",
        ]),

        h2("3. The core idea: three jobs, three tools"),
        h3("Debounce: send after a pause, not on every key"),
        p("A debounce restarts a timer on every keystroke and acts only when the timer completes, that is, after `N` ms without typing. With 300 ms, typing `react hooks` at 80 ms per key sends one request, 300 ms after the last key. A **throttle** is different: it acts at most once per interval while events keep coming, which suits scroll and resize handlers, not search, because it still sends prefixes the user is about to extend."),
        p("Pick the delay from how people type, not from a blog post: 200 to 400 ms is common. Too short and you are back to one request per key; too long and the box feels unresponsive. Trim the text before deciding anything: `react` and `react ` are the same question, and a box containing only spaces is an empty box - clear the results and send nothing."),
        h3("Abort: stop work nobody is waiting for"),
        p("`fetch` accepts an `AbortSignal`. Calling `controller.abort()` rejects the pending `fetch` with a `DOMException` named `AbortError`, frees the connection in the browser and shows the row as **(canceled)** in the Network panel. That `AbortError` is not a failure: it is the result you asked for, so never show it as an error."),
        p("Abort is not a guarantee. The server may already have done the work and sent the answer; a wrapper or SDK may accept a signal and ignore it; a cache layer may resolve from memory before the abort. That is why the third job exists on its own."),
        h3("Latest wins: an answer must still be wanted"),
        p("Before writing a response to the screen, check that the request that produced it is still the latest one. In an effect, the cleanup sets a flag the old `.then` can read; in plain code, a counter that each new request increments and each response compares with the value it started with. This check alone keeps the screen correct even when abort does nothing; abort alone saves work but leaves the screen exposed. Use both."),
        h3("When not to do this"),
        bullets([
            "**The data is already in memory.** Filtering 50 courses that are already loaded needs no request, no debounce and no abort: compute the filtered list during render (lesson 2.2). `useDeferredValue` can keep typing smooth if rendering is slow.",
            "**Search on submit.** If the product wants results after Enter, there is nothing to debounce: one request per submit, still with abort and latest-wins if the user can submit twice.",
            "**Do not debounce the input itself.** The `<input>` must show every key immediately; only the request waits. Debouncing `setQuery` makes typing lag and loses characters.",
        ]),

        challenge("chal_quiz_trf_431"),

        h2("4. Worked example: the search box, fixed"),
        h3("With TanStack Query"),
        p("A small hook debounces a value; the query key does the rest:"),
        code("tsx", `
function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(id);              // every new value restarts the timer
    }, [value, delayMs]);
    return debounced;
}

function CatalogSearch() {
    const [text, setText] = useState("");
    const query = useDebouncedValue(text.trim(), 300);

    const search = useQuery({
        queryKey: ["courses", "search", query],
        queryFn: ({ signal }) => searchCourses(query, signal),   // pass the signal to fetch
        enabled: query !== "",
        placeholderData: keepPreviousData,           // keep the old list while the new one loads
    });
    const courses = query === "" ? [] : search.data ?? [];

    return (
        <>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} />
            <CourseList courses={courses} />
        </>
    );
}`, "CatalogSearch.tsx"),
        bullets([
            "**Latest wins by construction.** Each response is stored under its own key. A late answer for `re` lands in `[\"courses\",\"search\",\"re\"]`, while the component reads `[\"courses\",\"search\",\"react hooks\"]`: it can never reach the screen.",
            "**Abort comes from the signal.** Because the query function consumes `signal`, TanStack Query aborts the request when its query becomes unused before it settles, for example when the key changes. A query function that ignores `signal` still gets the correct screen, only without the saved work.",
            "**Debounce the trimmed value.** Adding a trailing space changes `text` but not `query`, so it sends nothing.",
            "**`keepPreviousData`** shows the previous results until the new ones arrive, which removes the flicker of an empty list on every pause.",
        ]),
        h3("Without a library"),
        p("The same three jobs in a plain effect, for code that does not use TanStack Query. `query` is the debounced, trimmed value from the hook above:"),
        code("tsx", `
useEffect(() => {
    if (query === "") return;                       // the list is derived as [] during render
    const controller = new AbortController();
    let current = true;
    searchCourses(query, controller.signal)
        .then((courses) => { if (current) setResults(courses); })
        .catch((error: unknown) => {
            if (!current || (error instanceof DOMException && error.name === "AbortError")) return;
            setError(error);
        });
    return () => {                                  // runs before the next query, and on unmount
        current = false;                            // latest wins, even if the abort is ignored
        controller.abort();                         // stop the work
    };
}, [query]);`, "useCourseSearch.ts"),

        h2("5. Testing time without waiting for it"),
        p("A debounce is about time, and tests that really wait are slow and flaky: on a busy CI machine a 300 ms timer fires at 320 ms, and the test cannot tell. **Fake timers** replace `setTimeout` and `Date` with a clock the test moves by hand. Time in the code under test is then exactly what the test says, to the millisecond:"),
        code("typescript", `
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("sends one request 300 ms after the last key", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const box = createSearchBox({ debounceMs: 300, search });

    for (const text of ["r", "re", "rea", "reac", "react"]) {
        box.onInput(text);
        await vi.advanceTimersByTimeAsync(80);      // typing speed
    }
    await vi.advanceTimersByTimeAsync(219);         // 299 ms since the last key
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);           // 300 ms
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("react", expect.anything());
});`, "search.test.ts"),
        p("To test response order, make the fake API answer when you decide: return a promise whose `resolve` the test keeps, send two queries, resolve the **newer** one first and then the older one, and assert that the screen shows the newer results. `advanceTimersByTimeAsync` also lets pending promises settle between timers, which plain `advanceTimersByTime` does not. Jest has the same API under `jest.useFakeTimers()` and `jest.advanceTimersByTimeAsync()`."),
        p("The exercise uses the same idea without a test framework: the runner owns a fake clock and a fake search API whose latency is set per query, replays a timeline of keystrokes, pauses and unmounts, and prints every request, abort, response and screen update with its time."),
        challenge("chal_coding_trf_432"),

        h2("6. How to verify in the browser"),
        bullets([
            "**Network panel, Slow 4G.** Type a long query at normal speed: one request after you stop. Type, pause just long enough for a request, and type again: the earlier row shows **(canceled)**.",
            "**Force the out-of-order case.** Add a temporary delay for short queries in a local mock (or use DevTools **Override content** with a slow local server) so that `re` answers after `react`, and check that the list keeps the `react` results.",
            "**Clear the box.** Select all and delete: the results disappear at once and no request is sent; an in-flight request is canceled.",
            "**Leave the page while a request is in flight.** Navigate away: the row shows (canceled), and no error appears in the console.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**A debounce function created on every render.** `const debounced = debounce(send, 300)` in the component body is a new function with a new timer each render, so nothing is ever debounced. Spot it in the Network panel: still one request per key. Keep the timer in an effect (as above) or in a ref.",
            "**Abort without latest-wins.** Correct as long as every layer honours the signal; wrong the day one of them does not. Spot it by forcing a slow, ignored request in a test.",
            "**Showing `AbortError` as an error.** A red \"Search failed\" flashes on every pause. Spot it when the error state appears while typing, together with (canceled) rows.",
            "**Not trimming, not handling empty.** A space sends a new request; clearing the box sends `?search=` and shows the whole catalog. Spot both in the Network panel.",
            "**Testing with real timers.** `await new Promise((r) => setTimeout(r, 350))` in a test makes the suite slow and still cannot pin the boundary. Spot it in test durations: a debounce test should take milliseconds.",
        ]),

        h2("8. Summary"),
        numbered([
            "A search box has three separate jobs: debounce (send only after a pause, for the trimmed text), abort (stop requests nobody waits for) and latest-wins (an answer reaches the screen only if its request is still the latest).",
            "Abort saves work but is not a guarantee; latest-wins keeps the screen correct even when the server or a wrapper ignores the abort. TanStack Query gives you both through the query key and the `signal`; without it, use an AbortController and a flag or counter in the cleanup.",
            "Test time with fake timers: move the clock by hand, check the exact boundary of the debounce, and resolve responses out of order on purpose.",
        ]),

        h2("Sources"),
        bullets([
            "MDN Web Docs: AbortController and AbortSignal (fetch rejects with an AbortError DOMException)",
            "TanStack Query docs, Query Cancellation guide (the signal passed to the query function)",
            "Vitest docs: vi.useFakeTimers, vi.advanceTimersByTime and vi.advanceTimersByTimeAsync",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Find a search or autocomplete field in a project you work on. Record its Network waterfall on Slow 4G while typing a long query, count the requests and look for a response that finished after a newer one. Then write one fake-timer test that resolves two responses out of order and fails on the current code."),
    ],
});
