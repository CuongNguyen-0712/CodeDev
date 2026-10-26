// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-3-1",
    title: "How useEffect dependencies work, and when you don't need an effect",
    slug: { _type: "slug", current: "useeffect-dependencies-when-you-dont-need-an-effect" },
    description:
        "Typing in the catalog search box sent a stats request on every keystroke, and the course count showed the previous number for a frame after every filter change. Learn what an effect is for (synchronizing with something outside React), how React compares dependencies with Object.is, why objects, arrays and functions created during render are new every time, how to depend on primitives or build the object inside the effect, when useMemo and useCallback are the right last resort, how cleanup and StrictMode's extra mount in development work, and which code needs no effect at all.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "A support ticket on the CodeDev catalog at https://app.codedev.test: \"When I type in the search box, the Levels panel on the left blinks on every key, and after I change the level filter the header shows the old number of courses for a moment.\" The API dashboard for https://api.codedev.test agrees: GET /courses/stats went from about 2 requests per catalog visit to about 14 since the search box was added, although the stats do not depend on the search text at all.",
    },

    content: [
        h2("1. The incident: a stats panel that refetches on every keystroke"),
        p("The catalog page has three parts: a search box, a **Levels** panel that shows how many courses exist per level for the selected category, and the course grid with a header such as \"12 courses\". Last sprint the search box was added. Since then the ticket above, and this code, which looked harmless in review:"),
        code("tsx", `
// features/catalog/CatalogPage.tsx
function CatalogPage({ courses }: { courses: Course[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("react");
  const [level, setLevel] = useState<Level | "all">("all");

  return (
    <>
      <SearchBox value={search} onChange={setSearch} />
      <CategoryTabs value={category} onChange={setCategory} />
      <LevelFilter value={level} onChange={setLevel} />
      <CatalogStats filters={{ category, level }} />
      <CourseGrid courses={courses} category={category} level={level} search={search} />
    </>
  );
}

// features/catalog/CatalogStats.tsx
function CatalogStats({ filters }: { filters: StatsFilters }) {
  const [stats, setStats] = useState<LevelStats | null>(null);

  useEffect(() => {
    fetchStats(filters).then(setStats);
  }, [filters]);

  return stats ? <LevelsPanel stats={stats} /> : <Skeleton />;
}

// features/catalog/CourseGrid.tsx
function CourseGrid({ courses, category, level, search }: GridProps) {
  const [visible, setVisible] = useState<Course[]>([]);

  useEffect(() => {
    setVisible(filterCourses(courses, { category, level, search }));
  }, [courses, category, level, search]);

  return <CourseCards title={\`\${visible.length} courses\`} courses={visible} />;
}`, "catalog (as shipped)"),
        p("Both components use an effect, and both effects are wrong in different ways. `CatalogStats` runs its effect far more often than its data changes. `CourseGrid` runs an effect it never needed. To fix either one you need a precise model of when React runs an effect."),

        h2("2. Reproduce it and read the evidence"),
        p("Open the catalog with DevTools, select the **Network** tab and type `stats` in the filter box. Type the word `hooks` into the search box: five keystrokes, five `GET /courses/stats?category=react&level=all` rows, all with the same URL and the same response body. The stats never changed; only the search text did."),
        code("text", `
Name                                   Status  Time   Initiator
stats?category=react&level=all         200     31 ms  CatalogStats.tsx:6
stats?category=react&level=all         200     29 ms  CatalogStats.tsx:6
stats?category=react&level=all         200     34 ms  CatalogStats.tsx:6
stats?category=react&level=all         200     30 ms  CatalogStats.tsx:6
stats?category=react&level=all         200     28 ms  CatalogStats.tsx:6`, "Network panel, after typing \"hooks\""),
        p("Then open React DevTools, select the **Profiler** tab, enable \"Record why each component rendered while profiling\" in its settings, record, and type one letter. Select `CatalogStats` in the flame graph: the reason is **Props changed: (filters)**. The parent rendered because `search` changed, and it passed a `filters` prop that React considers different. Select `CourseGrid` after changing the level: there are two commits for one click, the second one with **Hook 1 changed**, which is `setVisible` running inside the effect."),

        h2("3. What an effect is for"),
        p("An effect is code that **synchronizes your component with something outside React**: a network request, a timer, a browser API such as `document.title`, a WebSocket, a third-party widget. React renders, commits the result to the screen, and then runs your effects. Rendering itself must stay pure: given the same props and state, return the same JSX, with no requests and no subscriptions."),
        p("That definition gives you the first question for every effect in code review: **which external system does this effect synchronize with?** `CatalogStats` has a good answer: the stats endpoint. `CourseGrid` has none: it reads props and writes state, all inside React. That is the first sign an effect is not needed (section 6)."),

        h3("How React decides to run an effect again"),
        p("After every render, React compares each value in the dependency array with the value at the same position from the previous render, using `Object.is`. If **any** value is different, React runs the previous effect's cleanup and then the effect again. If all are the same, it skips the effect."),
        bullets([
            "**No array**: `useEffect(fn)` runs after every render.",
            "**Empty array**: `useEffect(fn, [])` runs after the first render (the mount) and its cleanup runs on unmount.",
            "**With values**: `useEffect(fn, [a, b])` runs on mount and after every render where `a` or `b` is not `Object.is`-equal to the previous one.",
        ]),
        p("`Object.is` behaves like `===` with two small exceptions (`NaN` equals `NaN`, and `+0` does not equal `-0`). For strings, numbers and booleans it compares values: `\"react\"` from this render equals `\"react\"` from the last one. For objects, arrays and functions it compares **identity**: two objects with identical contents are still two different objects."),
        code("typescript", `
Object.is("react", "react");                                         // true
Object.is(1, 1);                                                     // true
Object.is({ category: "react" }, { category: "react" });            // false: two objects
Object.is(["react"], ["react"]);                                     // false: two arrays
Object.is(() => {}, () => {});                                       // false: two functions

const filters = { category: "react" };
Object.is(filters, filters);                                         // true: the same object`, "Object.is in the console"),
        p("Now look at `CatalogPage` again. `filters={{ category, level }}` is an object literal written in the render body. Every time `CatalogPage` renders - every keystroke, because `search` is its state - that line creates a **new** object. `CatalogStats` receives it, React compares it with `Object.is`, finds it different, and runs the fetch. The same is true for an array (`[category, level]`), an inline function (`() => load(category)`) or any value computed with `{ ...spread }`, `.map` or `.filter` during render."),
        callout("info", "Dependencies are not something you choose",
            "The dependency array is not a list of \"when I want the effect to run\". It must list every reactive value the effect reads: props, state, and anything computed from them in the component body. The eslint-plugin-react-hooks rule `exhaustive-deps` checks this, and lesson 3.3 shows what happens when it is silenced. To change when an effect runs, change the code so it reads different values, not the array."),

        h2("4. Fix the dependencies: primitives first"),
        p("The simplest fix is to make the effect depend on values that compare by value. Pass the primitives instead of an object, and build the object **inside** the effect, where it is created only when the effect actually runs:"),
        code("tsx", `
// features/catalog/CatalogStats.tsx
type StatsProps = { category: Category; level: Level | "all" };

function CatalogStats({ category, level }: StatsProps) {
  const [stats, setStats] = useState<LevelStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const filters: StatsFilters = { category, level };      // created only when the effect runs
    fetchStats(filters, controller.signal)
      .then(setStats)
      .catch((error) => {
        if (error.name !== "AbortError") throw error;
      });
    return () => controller.abort();                         // cleanup: cancel the previous request
  }, [category, level]);                                     // strings: compared by value

  return stats ? <LevelsPanel stats={stats} /> : <Skeleton />;
}

// in CatalogPage
<CatalogStats category={category} level={level} />`, "CatalogStats.tsx (fixed)"),
        p("Typing in the search box still renders `CatalogPage` and `CatalogStats`, and rendering is cheap. What changed is that `\"react\"` equals `\"react\"`, so the effect is skipped. Only a real change of category or level sends a request."),
        p("The same move works for functions. If an effect calls a helper that is defined in the component body, move the helper into the effect, or out of the component entirely when it uses no props or state:"),
        code("tsx", `
// Before: buildUrl is a new function every render, so [buildUrl] changes every render
const buildUrl = () => \`/courses/stats?category=\${category}&level=\${level}\`;
useEffect(() => { load(buildUrl()); }, [buildUrl]);

// After: the effect only reads strings
useEffect(() => {
  const url = \`/courses/stats?category=\${category}&level=\${level}\`;
  load(url);
}, [category, level]);`, "functions as dependencies"),

        h3("useMemo and useCallback: the last resort"),
        p("Sometimes you cannot pass primitives: the object comes from a hook you do not own, or many fields would make the props awkward. Then `useMemo` (for an object or array) or `useCallback` (for a function) keeps the same identity between renders until one of its own dependencies changes:"),
        code("tsx", `
const filters = useMemo(() => ({ category, level }), [category, level]);
<CatalogStats filters={filters} />`, "keeping one object identity"),
        p("Prefer the primitive fix when you can, for three reasons. Memoization moves the same dependency problem one level up: forget one field in the `useMemo` array and you get a stale object, which is worse than an extra request. Every component in between must also pass the object through without recreating it. And the React documentation describes `useMemo` as a performance optimization: code must still be correct if a cached value is recomputed."),
        callout("tip", "Server data with TanStack Query",
            "Module 4 replaces hand-written fetching effects with TanStack Query. There the query key is hashed by value, so `queryKey: [\"stats\", { category, level }]` with a new object each render is fine. The rule in this lesson applies to dependency arrays of useEffect, useMemo and useCallback, which compare with Object.is."),

        challenge("chal_quiz_trf_311"),

        h2("5. Cleanup, and why development runs your effect twice"),
        p("An effect that starts something must stop it. React calls the function you return from the effect **before the next run** of that effect and **when the component unmounts**. For the stats request, the cleanup aborts the old request, so a slow answer for `level=all` can never overwrite a newer answer for `level=beginner` (an out-of-order response). Timers are cleared, subscriptions closed, listeners removed: whatever setup did, cleanup undoes."),
        p("In development, `<StrictMode>` makes this visible on purpose. Right after the first mount it runs your effect's **cleanup and then the setup once more**, as if the component were unmounted and mounted again. In the Network panel you see the first stats request cancelled (or two identical requests if there is no cleanup), and then one that completes."),
        bullets([
            "It happens **only in development** and only once, on mount. A production build does not do it.",
            "It exists to find effects that are not symmetrical: a subscription without unsubscribe, an interval without clearInterval, a request whose late answer is still applied. If setup, cleanup, setup behaves like setup alone, the effect is correct.",
            "Do not \"fix\" it with a `useRef` flag that skips the second run. That hides the missing cleanup, and the bug comes back in production when the user navigates away and back, or when the dependencies change.",
        ]),

        h2("6. When you do not need an effect"),
        p("Many effects in real code do not synchronize with anything outside React. They make the component render twice and show a stale frame in between. Two cases cover most of them."),
        h3("Data you can compute from props and state"),
        p("`CourseGrid` copies a filtered list into state after every change. Read the sequence after a level change: React renders `CourseGrid` with the new `level` but the old `visible`, commits that (the header holds the old count, and the browser may paint it), runs the effect, which calls `setVisible`, and renders again. That is the flicker in the ticket, and the second commit in the Profiler. Even when the stale frame is not painted, every change costs two renders. Compute the value during render instead (lesson 2.2 covers derived state in depth):"),
        code("tsx", `
function CourseGrid({ courses, category, level, search }: GridProps) {
  const visible = filterCourses(courses, { category, level, search });   // derived, never stale
  return <CourseCards title={\`\${visible.length} courses\`} courses={visible} />;
}`, "CourseGrid.tsx (fixed)"),
        p("If `filterCourses` is measurably slow - check with the Profiler, not by guessing - wrap it in `useMemo(() => filterCourses(...), [courses, category, level, search])`. That is still computed during render, with no extra commit."),
        h3("Work caused by a user action"),
        p("The other common case: an effect that watches a state flag to do something the user asked for."),
        code("tsx", `
// Before: the click only sets a flag, an effect does the work
const [enrolling, setEnrolling] = useState(false);
useEffect(() => {
  if (enrolling) enroll(course.id).then(() => showToast("Enrolled"));
}, [enrolling, course.id]);
<button onClick={() => setEnrolling(true)}>Enroll</button>

// After: the work belongs to the event
async function handleEnroll() {
  await enroll(course.id);
  showToast("Enrolled");
}
<button onClick={handleEnroll}>Enroll</button>`, "event handler instead of an effect"),
        p("The test is the reason the code runs. If it runs **because the component is on the screen** (show the stats for the selected category), it is an effect. If it runs **because the user did something** (clicked Enroll, submitted a form), it belongs in the event handler. The effect version also misbehaves when `course.id` changes while `enrolling` is still `true`: it enrolls in the next course too."),

        h2("7. How to verify"),
        bullets([
            "**Network panel.** Filter by the endpoint, type in the search box: zero stats requests. Change the level: exactly one. In development, expect one cancelled plus one completed request on mount from StrictMode.",
            "**React DevTools Profiler** with \"Record why each component rendered\" enabled. A component that renders twice per change with \"Hook N changed\" on the second commit usually has a state copy written in an effect.",
            "**A unit test** that renders the component, re-renders it with the same props, and counts calls to a mocked API. It fails as soon as someone passes an object literal again:",
        ]),
        code("tsx", `
// CatalogStats.test.tsx (Vitest + React Testing Library)
vi.mock("../api/stats");

test("re-rendering with the same category and level does not refetch", async () => {
  vi.mocked(fetchStats).mockResolvedValue({ beginner: 4, intermediate: 2, advanced: 1 });

  const { rerender } = render(<CatalogStats category="react" level="all" />);
  rerender(<CatalogStats category="react" level="all" />);
  await screen.findByText("4 beginner");

  expect(fetchStats).toHaveBeenCalledTimes(1);

  rerender(<CatalogStats category="react" level="beginner" />);
  await waitFor(() => expect(fetchStats).toHaveBeenCalledTimes(2));
});`, "CatalogStats.test.tsx"),

        h2("8. Common mistakes"),
        bullets([
            "**An object, array or function literal in a dependency array, or passed as a prop that ends up in one.** Spot it: the effect runs on unrelated state changes; the Profiler shows \"Props changed\" with values that look identical.",
            "**Removing a dependency or using `[]` to stop extra runs.** The effect then reads values from an old render and never sees new ones. Spot it: an `eslint-disable` comment above the array, or a list that stops updating after a filter change (lesson 3.3).",
            "**Wrapping everything in useMemo and useCallback.** It hides the real question (does the effect need this value?) and one missing memo dependency gives stale data. Spot it: memo hooks whose only purpose is to feed a dependency array that could take primitives.",
            "**State that copies props or computed values through an effect.** Spot it: `useEffect(() => setX(f(props)), [props])`, two commits per change, a stale frame in between.",
            "**No cleanup for a request, timer or subscription.** Spot it: StrictMode shows two completed requests on mount, or a slow response overwrites a newer one when you switch filters quickly.",
        ]),

        h2("9. Summary"),
        numbered([
            "An effect synchronizes with something outside React. React runs it after a render when any dependency is not `Object.is`-equal to the previous value, and runs its cleanup before the next run and on unmount.",
            "Objects, arrays and functions created during render are new every time. Depend on primitives and build objects inside the effect; use `useMemo` or `useCallback` only when you cannot.",
            "Computed data belongs in render and user actions belong in event handlers. StrictMode's extra mount in development is a check of your cleanup, not a bug to suppress.",
        ]),

        h2("Sources"),
        bullets([
            "React documentation: useEffect reference (dependencies, cleanup, StrictMode) - react.dev/reference/react/useEffect",
            "React documentation: You Might Not Need an Effect - react.dev/learn/you-might-not-need-an-effect",
            "MDN Web Docs: Object.is()",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Search your own React project for useEffect calls. For each one, write the external system it synchronizes with in one phrase. Any effect without an answer is a candidate for derived data or an event handler. For the rest, check that every dependency is a primitive or a value with a stable identity, and that the effect has a cleanup if it starts something."),
    ],
});
