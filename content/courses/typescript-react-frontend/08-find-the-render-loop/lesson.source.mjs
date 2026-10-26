// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-3-2",
    title: "Find the render loop: an effect that fetches forever",
    slug: { _type: "slug", current: "find-the-render-loop-effect-fetches-forever" },
    description:
        "After Friday's release the CodeDev catalog never stops loading: every open tab sends GET /courses?category=react&page=1 about 40 times a second until the rate limiter answers 429. Work through the incident like an on-call engineer: read the release diff, the Network panel, the React DevTools Profiler and the API log, form a hypothesis, rule out the slow backend and StrictMode, choose a fix that keeps the list following category and page, and prove it with a regression test that counts requests.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer on call, CodeDev learning platform",
        problem:
            "Monday 14:05. The API team pages the frontend on-call: since Friday's release, GET /courses?category=react&page=1 arrives at https://api.codedev.test about 40 times a second from every tab that has the catalog open, and the rate limiter has started answering 429 Too Many Requests. Learners report that the course list at https://app.codedev.test flickers between a spinner and the courses, and then stays on the spinner. The only change to the catalog in Friday's release was a refactor that moved the request parameters of CourseList into a query object.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario: a real kind of bug, with the evidence you would actually have. The release was small, the review was quick, and the page looked fine on the reviewer's machine for the few seconds they looked at it. Here is the component as it shipped:"),
        code("tsx", `
// features/catalog/CourseList.tsx (release 2026.10.23-1)
type CourseQuery = { category: Category; page: number };
type Props = { category: Category; page: number };

export function CourseList({ category, page }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const query: CourseQuery = { category, page };

  useEffect(() => {
    setLoading(true);
    fetchCourses(query).then((result) => {
      setCourses(result);
      setLoading(false);
    });
  }, [query]);

  if (loading) return <Spinner />;
  return courses.length ? <CourseCards courses={courses} /> : <EmptyState />;
}`, "CourseList.tsx"),
        p("Before you read on, resist the urge to fix it. On call, the first job is to **prove** what is happening, because the evidence also tells you what a fix must preserve and how you will know it worked. The goal of this lesson is the method, applied to one loop."),

        h2("2. The evidence pack"),
        p("Four pieces of evidence were collected in the first fifteen minutes. The quiz below refers to them by letter."),
        h3("A. The release diff"),
        code("text", `
 export function CourseList({ category, page }: Props) {
   const [courses, setCourses] = useState<Course[]>([]);
   const [loading, setLoading] = useState(true);
+  const query: CourseQuery = { category, page };

   useEffect(() => {
     setLoading(true);
-    fetchCourses({ category, page }).then((result) => {
+    fetchCourses(query).then((result) => {
       setCourses(result);
       setLoading(false);
     });
-  }, [category, page]);
+  }, [query]);`, "PR #482 \"catalog: group request params into a query object\""),
        h3("B. Network panel, production, one tab"),
        code("text", `
Name                            Status  Started    Time   Initiator
courses?category=react&page=1   200     0.000 s    22 ms  CourseList.tsx:12
courses?category=react&page=1   200     0.024 s    19 ms  CourseList.tsx:12
courses?category=react&page=1   200     0.047 s    23 ms  CourseList.tsx:12
courses?category=react&page=1   200     0.072 s    21 ms  CourseList.tsx:12
... about 2,000 more rows with the same URL ...
courses?category=react&page=1   429     50.310 s   3 ms   CourseList.tsx:12`, "https://app.codedev.test/catalog?category=react, DevTools > Network"),
        h3("C. React DevTools Profiler, local reproduction (npm run dev)"),
        code("text", `
Commit  Component    Why did this render?
41      CourseList   Hook 2 changed
42      CourseList   Hooks 1 and 2 changed
43      CourseList   Hook 2 changed
44      CourseList   Hooks 1 and 2 changed
...
CatalogPage (the parent of CourseList) did not render during the recording.`, "Profiler with \"Record why each component rendered while profiling\" enabled"),
        h3("D. API access log"),
        code("text", `
14:02:07.112 GET /courses?category=react&page=1 200 4ms user=u_8812 build=2026.10.23-1
14:02:07.136 GET /courses?category=react&page=1 200 3ms user=u_8812 build=2026.10.23-1
14:02:07.159 GET /courses?category=react&page=1 200 4ms user=u_8812 build=2026.10.23-1
...
14:02:57.422 GET /courses?category=react&page=1 429 0ms user=u_8812 limit=2000/min
14:02:57.447 GET /courses?category=react&page=1 429 0ms user=u_8812 limit=2000/min`, "api.codedev.test, filtered by one user"),

        h2("3. Reading the evidence"),
        p("Read each piece for what it **shows**, not for what you expect. Write one line per piece:"),
        bullets([
            "**A** changes two things: an object `query` is now created in the render body, and the effect depends on `query` instead of on `category` and `page`.",
            "**B** shows the same URL over and over, each request starting right after the previous one finishes, about 40 per second. The initiator is the effect in `CourseList`, not a user action. The 429 at 50 s is the rate limiter reacting, not the cause.",
            "**C** shows `CourseList` rendering again and again while its parent does not render at all. In React DevTools, hooks are numbered in call order: Hook 1 is the `courses` state, Hook 2 is `loading`. So every render is caused by the component's own state: `loading` turns `true`, then `courses` and `loading` change together when the response arrives.",
            "**D** shows the server answering in 3-4 ms with 200, from the production build of Friday's release, until the per-user limit of 2,000 requests a minute is used up.",
        ]),
        p("Notice what the Profiler rules out on its own: nothing above `CourseList` is re-rendering it. The loop is closed **inside** the component."),

        h2("4. Hypothesis: a dependency that is never equal to itself"),
        p("Put the facts in order and you get a cycle. Follow one turn of it with the rules from lesson 3.1:"),
        numbered([
            "The response arrives. `setCourses(result)` and `setLoading(false)` update state (Hooks 1 and 2).",
            "React renders `CourseList`. The render body runs `const query = { category, page }`: a **new** object.",
            "React compares the dependency with `Object.is(previousQuery, query)`. Two different objects: `false`. The dependency \"changed\".",
            "The effect runs: `setLoading(true)` (Hook 2) and a new `fetchCourses(query)`.",
            "The response arrives. Back to step 1.",
        ]),
        p("Before Friday the dependencies were the strings and numbers `category` and `page`, which compare by value, so step 3 returned \"unchanged\" and the cycle stopped after one request. The refactor did not change what is fetched; it changed what React compares. A good hypothesis explains **all** the evidence: the repeated URL (B), the self-caused renders (C), the fast 200s (D) and the timing of the release (A). This one does."),
        h3("Rule out the tempting wrong ones"),
        p("Two other explanations come up in every incident channel. Check them against the evidence before anyone acts on them:"),
        bullets([
            "**\"The backend is slow, requests pile up.\"** D says each request takes 3-4 ms on the server and B says about 20 ms end to end. Each new request starts *after* the previous one finished. A faster API would make this loop spin faster, not stop it, and a client timeout would never fire.",
            "**\"It is StrictMode running the effect twice.\"** StrictMode's extra setup and cleanup happens once per mount and only in development. B and D come from the production build and show thousands of requests, not two.",
            "**\"Learners keep reloading the page.\"** C shows no parent render and B shows no navigation, only the same fetch from the same initiator.",
        ]),
        callout("info", "The linter saw it first",
            "eslint-plugin-react-hooks reports this pattern: its exhaustive-deps rule warns that the query object makes the dependencies of the effect change on every render. The project had the rule set to \"warn\", and warnings do not fail the CI build. Lint output is evidence too: check it before you open DevTools."),

        h2("5. Choose the fix"),
        p("A fix has to stop the loop **and** keep the behaviour the component exists for. Write those requirements down from the evidence and the feature, before you write code:"),
        bullets([
            "One request when `CourseList` mounts.",
            "One more request each time `category` or `page` actually changes.",
            "No request when the parent re-renders `CourseList` with the same props.",
            "The spinner still shows while a request is in flight.",
        ]),
        p("Now test each candidate fix against the list, not just against \"the loop stops\":"),
        bullets([
            "**An empty dependency array.** The loop stops, so it passes a quick look. It fails the second requirement: switching to page 2 never fetches page 2.",
            "**Removing the dependency array.** The effect runs after every render, which is the loop again, without even the pretence of a condition.",
            "**`useMemo` around `query`.** It works only while its own dependency list is complete; leave out `page` and page changes stop fetching. It moves the problem instead of removing it.",
            "**A guard such as `if (loading) return;` or a `useRef` flag inside the effect.** It hides the symptom and leaves an effect whose dependencies lie about what it reads.",
            "**Reverting the release.** A valid emergency step while you prepare the real fix, and the right call if the fix needs more than a few minutes. Revert, then fix forward with a test.",
        ]),
        p("The fix that meets all four requirements follows the rule from lesson 3.1: the effect should depend on the values that **define** the request, and those values compare by value. You will make that change in the challenge below."),

        challenge("chal_quiz_trf_321"),

        h2("6. The challenge: a mini React in one file"),
        p("The code runner has no browser and no React, so the challenge file brings a small hook runtime of about a hundred lines that follows the same rules for this case. You do not need to read all of it. What matters:"),
        bullets([
            "**Hooks are stored in call order.** Each `useState`, `useEffect` or `useMemo` call takes the next slot, which is why hooks must be called in the same order on every render (and why DevTools can name them Hook 1, Hook 2...).",
            "**`useEffect(effect, deps)`** compares each dependency with the previous one using `Object.is`, exactly like React. With no array it runs after every render. Effects run after the render, and the previous cleanup runs first.",
            "**`setState`** ignores a value that is `Object.is`-equal to the current one; otherwise it schedules one re-render for the batch, on a microtask, like React's automatic batching.",
            "**The API stub** answers on the next microtask with a new array every time, like `fetch` plus `json()`. After 20 requests in one step it stops answering, the way the rate limiter did, so a loop cannot run forever.",
            "**The test runner** mounts `CourseList` with the first props, then re-renders it with each next props object. After each step it prints the requests sent during that step and what the screen showed before and after the requests settled.",
        ]),
        p("Run the starter first and look at its output: you will see the loop as a request count, the same evidence as the Network panel. Then make the change and run it again."),
        challenge("chal_coding_trf_322"),

        h2("7. How to verify the fix"),
        p("\"The page loads now\" is not verification: the shipped code also looked fine for a few seconds. Verify each requirement with something that counts:"),
        bullets([
            "**A regression test that counts requests.** Mount the component with a fake API, re-render with the same props, then with a new page, and assert the number of calls after each step. On Friday's code it fails on the very first assertion; after the fix it passes. It also fails if someone later \"fixes\" the loop with an empty array.",
            "**Network panel, locally and on staging.** Filter by `courses?`: one row on load (plus StrictMode's cancelled extra in development), one per page or category change, none while typing in unrelated inputs.",
            "**Profiler.** `CourseList` renders when its props change and when its own request completes, then stops.",
            "**Production after the deploy.** The API dashboard shows `GET /courses` back near its normal rate and the 429 count for that route back to zero.",
        ]),
        code("tsx", `
// CourseList.test.tsx (Vitest + React Testing Library)
vi.mock("../api/courses");

test("fetches once per category and page, never on a same-props re-render", async () => {
  vi.mocked(fetchCourses).mockImplementation(async (q) => fakeCatalog(q));

  const { rerender } = render(<CourseList category="react" page={1} />);
  await screen.findByText("React Basics");
  expect(fetchCourses).toHaveBeenCalledTimes(1);

  rerender(<CourseList category="react" page={1} />);
  await screen.findByText("React Basics");
  expect(fetchCourses).toHaveBeenCalledTimes(1);

  rerender(<CourseList category="react" page={2} />);
  await screen.findByText("Testing React");
  expect(fetchCourses).toHaveBeenCalledTimes(2);
});`, "CourseList.test.tsx"),
        p("Finally, close the gap that let it ship: set `react-hooks/exhaustive-deps` to `error` in the ESLint config so the warning in section 4 fails CI next time."),

        h2("8. Common mistakes in a render-loop incident"),
        bullets([
            "**Blaming the most visible symptom.** The 429s and the spinner are effects of the loop. Spot it: a proposed fix that raises the rate limit or adds a retry. Ask what sends the requests.",
            "**Fixing the loop by breaking the feature.** `[]` stops the requests and also stops page changes. Spot it: test the fix against the written requirements, not only against \"no more loop\".",
            "**Trusting a quick look in the browser.** A loop that waits for a 20 ms response looks like a normal page for a moment. Spot it: count requests in the Network panel or in a test, do not eyeball.",
            "**Dismissing double requests as StrictMode without counting.** StrictMode adds exactly one extra setup per mount, in development only. Spot it: more than two requests, or any in production, is not StrictMode.",
            "**Leaving lint warnings as warnings.** exhaustive-deps reported this before the release. Spot it: run the linter on the diff and read the warnings on the files you touched.",
        ]),

        h2("9. Summary"),
        numbered([
            "A render loop through an effect is a cycle: state update, render, a dependency that is a new object, effect, state update. The Profiler's \"Hook N changed\" with no parent render shows the cycle is inside the component.",
            "Use the evidence to rule out explanations: fast 200s rule out a slow backend, production traffic and thousands of requests rule out StrictMode.",
            "A fix must meet all the requirements (mount, changes, same-props re-render, loading), and a regression test that counts requests is the proof.",
        ]),

        h2("Sources"),
        bullets([
            "React documentation: useEffect reference, \"My Effect runs after every re-render\" and \"My Effect keeps re-running in an infinite cycle\" - react.dev/reference/react/useEffect",
            "React documentation: Removing Effect Dependencies - react.dev/learn/removing-effect-dependencies",
            "React Developer Tools: Profiler, \"Why did this render?\"",
        ]),
        callout("tip", "Self-practice (not graded): write the root-cause note",
            "Write the root-cause note for this incident as you would post it in the incident channel, in at most ten lines: what users saw, the impact (requests per tab, 429s, how long), the root cause in one sentence, why review did not catch it, the fix, how it was verified, and two follow-ups that would prevent the next loop (for example the exhaustive-deps rule as an error and the regression test). Every claim should point at one piece of evidence, A to D."),
    ],
});
