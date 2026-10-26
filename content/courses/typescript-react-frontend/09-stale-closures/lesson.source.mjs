// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-3-3",
    title: "Stale closures: when an effect keeps the old filter",
    slug: { _type: "slug", current: "stale-closures-effect-keeps-old-filter" },
    description:
        "An AI assistant added a 30-second refresh to the live catalog, silenced the lint warning with an eslint-disable comment, and the change was merged. Now the catalog jumps back to the old category. Learn why every function created during a render keeps that render's props and state, what the exhaustive-deps rule protects, the four ways to give an effect the latest value (dependencies with cleanup, functional updates, a ref, useEffectEvent), and how to review AI-generated React code for exactly this kind of mistake.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer and code reviewer, CodeDev learning platform",
        problem:
            "Learners report that the live catalog at https://app.codedev.test \"jumps back\": they switch the category from React to Node, see the Node courses, and up to 30 seconds later the list shows React courses again, with the Node tab still selected. Support finds GET /courses?category=react in the logs of https://api.codedev.test from tabs that show Node. The only recent change to the page is a 30-second refresh, written with an AI coding assistant and approved because the page looked right in review.",
    },

    content: [
        h2("1. The incident: a refresh that remembers the past"),
        p("The request to the assistant was short: \"LiveCatalog shows the courses of the selected category. Refresh the list every 30 seconds so courses published by instructors appear without a page reload.\" This is the change it produced:"),
        code("tsx", `
// features/catalog/LiveCatalog.tsx
export function LiveCatalog({ filter }: { filter: Category }) {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    fetchCourses(filter).then(setCourses);
  }, [filter]);

  // Refresh every 30 seconds so newly published courses show up.
  useEffect(() => {
    const id = setInterval(() => {
      fetchCourses(filter).then(setCourses);
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <CourseCards courses={courses} />;
}`, "LiveCatalog.tsx (as merged)"),
        p("The code has a cleanup, a comment that explains the intent, and it passes lint. In the pull request preview the reviewer opened the React tab, waited for a refresh, saw the list stay correct, and approved. Nobody switched the category and then waited 30 seconds."),

        h2("2. Reproduce it and read the evidence"),
        p("Open the catalog with DevTools, select **Network** and filter by `courses?`. Select React, then Node, then wait. The rows tell the story:"),
        code("text", `
Name                        Status  Started     Initiator
courses?category=react      200     0.0 s       LiveCatalog.tsx:6    (mount)
courses?category=node       200     12.4 s      LiveCatalog.tsx:6    (filter changed)
courses?category=react      200     30.0 s      LiveCatalog.tsx:12   (interval)
courses?category=react      200     60.0 s      LiveCatalog.tsx:12   (interval)`, "Network panel: React, switch to Node at 12 s, wait"),
        p("Line 6 is the first effect and it follows the filter. Line 12 is the interval, and it still asks for React at 30 s and 60 s although the screen shows the Node tab. Its responses overwrite the Node courses: the \"jump back\". Now remove the `eslint-disable` line and run the linter on the file:"),
        code("bash", `
npx eslint src/features/catalog/LiveCatalog.tsx

  14:6  warning  React Hook useEffect has a missing dependency: 'filter'.
                 Either include it or remove the dependency array
                 react-hooks/exhaustive-deps`, "terminal"),
        p("The tool reported the bug before the merge. The comment switched the report off."),

        h2("3. Core idea: every render has its own values"),
        p("Inside a component, props and state are plain constants **for one render**. When `filter` changes, React does not update a variable called `filter`; it calls `LiveCatalog` again, and that new call has its own `filter`. Every function created during a render - event handlers, effect bodies, the callback you pass to `setInterval` - is a **closure**: it keeps the variables of the call that created it."),
        code("typescript", `
function makeRefresh(filter: string) {
  return () => console.log("refreshing", filter);   // closes over this call's filter
}

const fromRender1 = makeRefresh("react");
const fromRender2 = makeRefresh("node");

fromRender1();   // refreshing react  - forever, whatever happens later
fromRender2();   // refreshing node`, "closures in plain TypeScript"),
        p("Each render of `LiveCatalog` is like one call of `makeRefresh`. With `[]`, the interval effect runs only after the first render, so `setInterval` receives the callback of render 1, which holds `filter = \"react\"`. Render 2 creates a new callback with `\"node\"`, but React never runs the effect again, so nobody hands the new callback to a timer. A **stale closure** is a function that keeps running after the render whose values it holds is no longer the one on screen."),
        h3("Why exhaustive-deps exists"),
        p("The dependency array is the only thing that tells React when the closure inside an effect is out of date. `react-hooks/exhaustive-deps` reads the effect body, finds every prop, state value and render-scope variable it uses, and checks they are all in the array. When it complains, it is saying \"this effect will keep an old value of X\". There are honest answers to that warning (section 4), and every one of them changes the code. Deleting the warning changes nothing except the evidence."),
        callout("warning", "A silenced exhaustive-deps warning is a review red flag",
            "Treat `// eslint-disable-next-line react-hooks/exhaustive-deps` in a diff like a disabled test: ask which value the effect will read stale, and what happens when that value changes. The React documentation recommends treating this rule as an error. If a team does allow a suppression, it should carry a comment that explains why the stale value is harmless, and a reviewer should be able to verify that claim."),

        challenge("chal_quiz_trf_331"),

        h2("4. Four honest fixes, and when each one fits"),
        p("The examples use a different component, the leaderboard panel of a course page, which polls `GET /courses/:id/leaderboard` every 15 seconds and has the same bug. Pick the fix by asking what the callback actually needs."),
        h3("Fix 1: list the dependency and let cleanup replace the timer"),
        p("The simplest fix and the default. The effect reads `courseId`, so it lists `courseId`. When it changes, React runs the cleanup (clearing the old interval) and then the effect (starting a new one whose callback holds the new id):"),
        code("tsx", `
useEffect(() => {
  let active = true;
  const refresh = () => fetchLeaderboard(courseId).then((rows) => { if (active) setRows(rows); });
  const id = setInterval(refresh, 15_000);
  return () => {
    active = false;            // a response for the old course arrives late: ignore it
    clearInterval(id);         // exactly one interval at a time
  };
}, [courseId]);`, "dependency + cleanup"),
        p("The cost: the 15-second period restarts when `courseId` changes. For a refresh that is usually what you want anyway. Without the cleanup, every change would add one more interval, each holding a different id: more requests, and still some for the old course."),
        h3("Fix 2: a functional update, when the callback only needs the previous state"),
        p("Some callbacks read state only to compute the next state. Then the updater form removes the read, and `[]` becomes honest because the callback uses no render value at all:"),
        code("tsx", `
// "Updated 45 s ago": ticks every second, needs only the previous count
useEffect(() => {
  const id = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
  return () => clearInterval(id);
}, []);`, "functional update"),
        p("It only helps with **state you are updating**. It does nothing for a prop or for another state value that the callback reads, such as the course id or the filter it sends to the API."),
        h3("Fix 3: a ref that holds the latest value"),
        p("When restarting the effect is expensive or wrong - a WebSocket you do not want to reconnect, a timer that must keep its phase - keep the subscription and let the callback read the latest value through a ref. The ref must be **updated after every render** where the value changes; a ref set once is just another stale copy:"),
        code("tsx", `
const latestCourseId = useRef(courseId);
useEffect(() => {
  latestCourseId.current = courseId;          // keep it current after each commit
}, [courseId]);

useEffect(() => {
  const id = setInterval(() => {
    fetchLeaderboard(latestCourseId.current).then(setRows);
  }, 15_000);
  return () => clearInterval(id);
}, []);`, "latest value in a ref"),
        p("Update the ref in an effect, not during render: React expects rendering to be pure, and a ref written during a render that is later discarded would hold a value that never reached the screen."),
        h3("Fix 4: useEffectEvent (check your React version)"),
        p("React added `useEffectEvent` for exactly this split: the *subscription* depends on some values, while the *code that runs on each tick* should always see the latest props and state. It is a newer API: it shipped as stable in React 19.2 after a long time as an experimental API, so check the React version of your project, and the version of eslint-plugin-react-hooks that understands it, before you use it."),
        code("tsx", `
const onTick = useEffectEvent(() => {
  fetchLeaderboard(courseId).then(setRows);   // always the latest courseId
});

useEffect(() => {
  const id = setInterval(() => onTick(), 15_000);
  return () => clearInterval(id);
}, []);                                         // onTick is not a dependency`, "useEffectEvent (React 19.2+)"),
        p("Call an Effect Event only from inside effects; do not pass it to other components or call it during render. When none of the special cases apply, prefer Fix 1: it is the easiest to read and the easiest to test."),

        h2("5. Reviewing AI-generated React code"),
        p("Coding assistants are fast at producing an effect that looks complete. They are also good at making a warning disappear, which is not the same as answering it, and generated code is often reviewed by looking at it run once. You are the one who has to prove it works. Read every generated effect with this list:"),
        numbered([
            "**Search the diff for `eslint-disable`.** Each `react-hooks/exhaustive-deps` suppression gets the question: which value is stale, and what happens when it changes? `git diff main -- '*.tsx' | grep -n \"eslint-disable\"` finds them in seconds.",
            "**Read every `[]` against the effect body.** If the body uses a prop, state or a function from the component, the empty array is a claim that the value never changes. Is that true?",
            "**Pair every setup with a cleanup.** `setInterval`, `setTimeout`, `addEventListener`, `subscribe`, `new WebSocket` and `fetch` each need their undo in the returned function. Missing cleanup shows up as doubled requests in StrictMode.",
            "**Check refs are written where the value changes.** A `useRef(prop)` that is never assigned again holds the first value forever.",
            "**Ask for the test that would have failed.** For this bug: change the category, advance a fake clock by 30 seconds, assert which category was requested. If the change comes without a test, write that test before approving.",
        ]),
        p("You will review the assistant's code yourself in the challenge. The file contains the same small hook runtime as lesson 3.2, plus a fake clock (`timers.setInterval`, `timers.clearInterval`) so 30 seconds pass instantly. The test runner mounts `LiveCatalog`, changes its `filter`, advances the clock and unmounts it, and prints the requests after each step. The public tests pass on the assistant's code, as the reviewer's quick check did; the hidden ones change the category before the timer fires."),
        challenge("chal_coding_trf_332"),

        h2("6. How to verify the fix"),
        bullets([
            "**A test with fake timers.** It controls time, so it can do what the reviewer did not: change the category, then wait.",
            "**Network panel.** React, then Node, then wait 60 seconds: every interval row must say `category=node`, and only one interval row per 30 seconds (two would mean an interval without cleanup).",
            "**Lint as an error.** Set `react-hooks/exhaustive-deps` to `error` in CI, so a suppression is a visible, reviewable decision instead of a quiet one.",
        ]),
        code("tsx", `
// LiveCatalog.test.tsx (Vitest + React Testing Library)
vi.mock("../api/courses");

test("the refresh asks for the category on screen, and stops after unmount", async () => {
  vi.useFakeTimers();
  vi.mocked(fetchCourses).mockResolvedValue([]);

  const { rerender, unmount } = render(<LiveCatalog filter="react" />);
  rerender(<LiveCatalog filter="node" />);
  vi.mocked(fetchCourses).mockClear();

  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetchCourses).toHaveBeenCalledTimes(1);
  expect(fetchCourses).toHaveBeenLastCalledWith("node");

  unmount();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchCourses).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});`, "LiveCatalog.test.tsx"),

        h2("7. Common mistakes"),
        bullets([
            "**Silencing exhaustive-deps instead of answering it.** Spot it: an `eslint-disable` comment above a dependency array, often next to an empty `[]`.",
            "**Adding the dependency but forgetting the cleanup.** Every change of the value starts one more interval. Spot it: request count per 30 seconds grows after each category switch.",
            "**Using a functional update to fix a stale prop.** `setCourses((prev) => ...)` gives the latest courses, not the latest filter. Spot it: the stale value is a prop or another state, not the state being set.",
            "**A ref that is created and never updated.** `useRef(filter)` captures the first filter just like `[]` did. Spot it: no assignment to `.current` after the first render.",
            "**Testing only the happy path in time.** The bug needs a change followed by a wait. Spot it: tests and manual checks that never change a value before the timer fires.",
        ]),

        h2("8. Summary"),
        numbered([
            "A function created during a render keeps that render's props and state. An effect with too few dependencies keeps its callback from an old render: a stale closure.",
            "exhaustive-deps is the check that the closure and the dependency array agree. A suppression is a red flag in review; the honest fixes are dependencies with cleanup, functional updates, a ref kept current, or useEffectEvent on React 19.2+.",
            "Review generated effects for `eslint-disable`, empty arrays, missing cleanup and refs that never update, and prove the fix with a fake-timer test that changes a value and then waits.",
        ]),

        h2("Sources"),
        bullets([
            "React documentation: Removing Effect Dependencies (do not suppress the linter) - react.dev/learn/removing-effect-dependencies",
            "React documentation: Separating Events from Effects (useEffectEvent) - react.dev/learn/separating-events-from-effects",
            "React documentation: useEffect reference - react.dev/reference/react/useEffect",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Search your codebase for eslint-disable comments on react-hooks/exhaustive-deps. For each one, write which value the effect reads stale and what the user would see when that value changes, then pick one of the four fixes and write the fake-timer or re-render test that proves it. Next time you ask an AI assistant for an effect, ask it for that test in the same prompt and review the two together."),
    ],
});
