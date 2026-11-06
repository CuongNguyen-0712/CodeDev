// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-fwp-2-1",
    title: "Debounce, throttle and input responsiveness",
    slug: { _type: "slug", current: "debounce-throttle-input-responsiveness" },
    description:
        "Rice Rocket's dish search sent a request per keystroke and sometimes showed results for an older query, and its sticky cart bar forced a layout on every scroll event. Learn when to debounce, when to throttle or use requestAnimationFrame, and how to cancel and ignore stale requests, then fix the search box.",
    estimatedTime: 15,

    scenario: {
        role: "Frontend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Typing \"com tam suon\" into the menu search sent 12 requests. When the network was slow, the list jumped back to the results for \"pho\" after showing \"pho bo\". On budget phones, scrolling the menu stuttered while the sticky cart bar recalculated its position.",
    },

    content: [
        h2("Situation"),
        p("The search box as it shipped:"),
        code("ts", `
searchInput.addEventListener("input", async (e) => {
  const query = (e.target as HTMLInputElement).value;
  const results = await searchClient.search(query);   // old SDK: no cancellation
  renderResults(results);                             // whatever arrives last wins
});`, "search/searchBox.ts"),
        bullets([
            "12 requests for 12 keystrokes; the API's rate limit started answering 429 at lunch time.",
            "The broad query \"pho\" took 900 ms, \"pho bo\" 100 ms: the late answer for \"pho\" replaced the right results.",
            "The scroll handler ran about 120 times a second, each time forcing a layout.",
        ]),

        h2("The core you need"),
        bullets([
            "**Debounce: act once the burst is over.** Every event restarts a timer; the work runs only when no event came for `wait` ms. Right for search-as-you-type, autosave and window-resize recalculations that only need the final value.",
            "**Throttle: act at most once per interval during the burst.** Right for continuous signals you want to follow while they happen: scroll position, drag, pointer move. For anything visual, `requestAnimationFrame` is the natural throttle: once per frame.",
            "**Requests are not answered in order.** Cancel the one you no longer need with `AbortController` (fetch rejects with an `AbortError`), and still ignore any answer that is not for the newest query: some clients cannot cancel, and an answer can already be on its way.",
            "**Do not force layout in a handler.** Reading a layout value (`getBoundingClientRect`, `offsetTop`) right after writing a style makes the browser lay out synchronously. Read first, write after, once per frame; mark scroll and touch listeners `{ passive: true }`.",
        ]),

        h2("Apply it in the project"),
        code("ts", `
export function createSearchBox(show: (r: Result[]) => void, waitMs = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let latest = 0;

  async function search(query: string) {
    controller?.abort();                       // the previous request is no longer needed
    controller = new AbortController();
    const id = ++latest;
    try {
      const res = await fetch(\`/api/search?q=\${encodeURIComponent(query)}\`, { signal: controller.signal });
      const results = await res.json();
      if (id === latest) show(results);       // an older answer never overwrites a newer one
    } catch (err) {
      if ((err as Error).name !== "AbortError") throw err;
    }
  }

  return (text: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => search(text.trim()), waitMs);
  };
}`, "search/searchBox.ts"),
        p("And the sticky bar, once per frame, reading before writing:"),
        code("ts", `
let scheduled = false;
window.addEventListener("scroll", () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const y = window.scrollY;                  // read
    bar.style.transform = \`translateY(\${Math.min(0, lastY - y)}px)\`; // write
    lastY = y;
  });
}, { passive: true });`, "cart/stickyBar.ts"),
        callout("info", "In React",
            "`useDeferredValue` keeps typing responsive while an expensive list re-renders, but it does not reduce requests: debounce the fetch itself. TanStack Query passes an `AbortSignal` to the query function, so a changed query key cancels the old request for you."),

        h2("Verify"),
        code("text", `
Network panel, type "com tam suon" at normal speed
  before: 12 requests        after: 1 request, q=com%20tam%20suon
Throttle the network to "Slow 4G", type "pho", pause, type " bo"
  before: list ends on "pho" results      after: request for "pho" (canceled), list shows "pho bo"
Performance panel, scroll the menu
  before: Layout inside every scroll handler      after: one rAF callback per frame, no forced reflow`, "check"),

        h2("Pitfalls"),
        bullets([
            "**A debounce that never clears its timer.** Without `clearTimeout`, every keystroke still runs, only later. Detect it by counting requests in the Network panel.",
            "**Relying on abort alone.** An SDK that ignores the signal, or an answer already parsed when abort is called, still arrives. Keep the newest-query check.",
            "**Debouncing something that must feel instant.** A debounced \"+\" button or checkbox makes the UI feel broken; give immediate visual feedback and debounce only the network call.",
        ]),

        challenge("chal_quiz_fwp_131"),
        p("Now fix the search box. The editor holds the corrected `search/searchBox.js` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. The wrong pieces are last week's bugs. Run types into the box on a fake clock against a search API whose answers arrive out of order, once with a client that cancels and once with one that cannot."),
        challenge("chal_coding_fwp_132"),
    ],
});
