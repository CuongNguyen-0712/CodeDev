// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-2-2",
    title: "Derived state: compute it, don't copy it",
    slug: { _type: "slug", current: "derived-state-compute-dont-copy" },
    description:
        "The catalog kept showing yesterday's results after the course list reloaded, and the details panel kept a course's old title after an instructor renamed it. Both bugs were copies: a filtered list and a selected course stored in state next to the data they came from. Learn to compute derived values during render, store ids instead of objects, reach for useMemo only after measuring, lift state to the closest common owner and reset state with a key.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev course catalog",
        problem:
            "Two tickets on the same day. Ticket #4188, from an instructor: \"I published 'SQL Window Functions' an hour ago. It shows up in search on my phone but not on my laptop, even after the list refreshed.\" Ticket #4191, from the content team: \"I renamed 'React Hooks 101' to 'React Hooks in Depth'. The card in the grid shows the new title, the details panel next to it still shows the old one.\" In both cases the Network tab shows the fresh data arriving from https://api.codedev.test/courses. The data reached the component; the screen did not use it.",
    },

    content: [
        h2("1. The incident: two copies that stopped listening"),
        p("Here is the catalog's results component as it shipped. It receives the courses (from the server cache) and the current filter as props, and keeps two pieces of state of its own:"),
        code("tsx", `
// features/catalog/CourseResults.tsx - the version that shipped
type Props = { courses: Course[]; filter: CatalogFilter };

export function CourseResults({ courses, filter }: Props) {
  const [visible, setVisible] = useState(filterCourses(courses, filter));
  const [selected, setSelected] = useState<Course | null>(null);

  return (
    <div className="results">
      <CourseGrid courses={visible} onSelect={(course) => setSelected(course)} />
      {selected && <CourseDetails course={selected} />}
    </div>
  );
}`, "CourseResults.tsx"),
        p("Both state variables are **copies**. `visible` is a copy of something you can compute from `courses` and `filter`. `selected` is a copy of one object from `courses`. A copy is correct at the moment it is made and then has to be kept in sync by hand forever. Nobody wrote that sync code, so both copies kept the values from the moment they were created."),
        p("The argument of `useState` is an **initial** value. React uses it on the first render and ignores it on every render after that. `filterCourses(courses, filter)` still runs on every render (it is an ordinary function call), but its result is thrown away."),

        h2("2. Reproduce it and read the evidence"),
        p("Open https://app.codedev.test/courses with React DevTools. In another tab, as an instructor, publish a course; then come back so the course list refetches (TanStack Query refetches on window focus by default)."),
        numbered([
            "**Network tab:** `GET https://api.codedev.test/courses?category=sql` returns 20 items, including \"SQL Window Functions\".",
            "**Components tab, select CourseResults:** under **props**, `courses` has 20 entries. Under **hooks**, the first `State` (that is `visible`) still has 19.",
            "Change the filter and back. The new course appears - but only because the user typed, and only until the next refetch.",
        ]),
        p("The rename is the same story. Click a card, rename the course in the admin, return: `props.courses` contains `{ id: \"c_12\", title: \"React Hooks in Depth\" }`, while the second `State` holds a separate object `{ id: \"c_12\", title: \"React Hooks 101\" }`. Two objects for one course, and the panel renders the old one."),
        callout("info", "The rule to remember",
            "If a value can be calculated from props or other state, it is not state. When DevTools shows the same fact in props and in state with different values, you are looking at a copy."),

        h2("3. Core idea: one source of truth, everything else computed"),
        p("Every fact on the screen should have exactly **one** place where it is stored. Everything else that depends on it is calculated from it during render. React re-renders the component whenever props or state change, so a value computed in the component body is always as fresh as its inputs. You do not need an effect to keep it in sync, and you cannot forget to update it."),
        p("For each piece of state, ask three questions (react.dev's guide on choosing a state structure asks the same ones in its own words):"),
        bullets([
            "**Is it passed in from a parent?** Then it is a prop, not state. Do not mirror it.",
            "**Does it stay the same over time?** Then it is not state either; it can be a constant or a prop.",
            "**Can you compute it from other props or state?** Then compute it. The filtered list, the result count, \"is any filter active?\", the selected course object and the total price of a cart all fall here.",
        ]),
        p("What is left is real state: the things only the user's actions create, like the filter they chose and *which* course they clicked."),
        h3("When a copy is what you want"),
        bullets([
            "**A deliberate snapshot.** A form that edits a course starts from the saved title and must *not* follow later changes while the user types. That is state initialized from a prop on purpose. Name the prop `initialTitle` or `defaultTitle` so readers know updates are ignored, and reset it with a key (section 4).",
            "**An expensive computation you measured.** Computing is still the right model; `useMemo` caches the result between renders. It is an optimization of a computed value, not a copy in state.",
            "**Server data.** It is already a copy of the database. Keep it in one cache (module 4) and derive from that cache; do not copy it again into component state.",
        ]),

        h2("4. Worked example: four fixes"),
        h3("Compute the filtered list during render"),
        code("tsx", `
export function CourseResults({ courses, filter }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = filterCourses(courses, filter);                       // derived: always fresh
  const selected = courses.find((c) => c.id === selectedId) ?? null;    // derived from the id

  return (
    <div className="results">
      <CourseGrid courses={visible} onSelect={(course) => setSelectedId(course.id)} />
      {selected && <CourseDetails course={selected} />}
    </div>
  );
}`, "CourseResults.tsx"),
        p("`visible` is recomputed on every render from the current `courses` and `filter`. When the list refetches, the parent re-renders `CourseResults` with the new array and the new course appears. There is no effect, no extra render and nothing to forget."),
        h3("Store the id, not the object"),
        p("`selectedId` is the only thing the user's click creates. The object is looked up during render, so a renamed course shows its new title in the details panel the moment the list refetches. The id also gives you a sensible behaviour for free: if the selected course disappears from the list (unpublished, or filtered out), `find` returns `undefined` and the panel closes instead of showing a course that is no longer there."),
        h3("useMemo only when you measured a cost"),
        p("Filtering 200 courses is a loop over 200 small objects; it takes a fraction of a millisecond. Measure before you cache:"),
        code("tsx", `
console.time("filterCourses");
const visible = filterCourses(courses, filter);
console.timeEnd("filterCourses");   // filterCourses: 0.06 ms  -> leave it alone`, "CourseResults.tsx"),
        p("React's own guidance is that a calculation is worth memoizing when it takes about 1 ms or more, measured on a production build and preferably with CPU throttling in DevTools. If it is, wrap the **computation**, list every input it reads, and keep it a computed value:"),
        code("tsx", `
const visible = useMemo(() => filterCourses(courses, filter), [courses, filter]);`, "CourseResults.tsx"),
        p("`useMemo` re-runs the function when `courses` or `filter` changes (compared with `Object.is`). A missing dependency brings the stale list back: with `[filter]` alone, a refetched `courses` array is ignored until the filter changes. The `react-hooks/exhaustive-deps` lint rule catches exactly that."),
        h3("Lift shared state to the closest common owner"),
        p("The sidebar shows \"19 results\" and the results panel shows the grid. A first attempt gave each component its own copy of the filter, synced through an effect, and the count lagged one keystroke behind the grid. When two components need the same state, move it up to their **closest common parent**, keep one copy there and pass it down:"),
        code("tsx", `
export function CatalogPage() {
  const [filter, setFilter] = useState<CatalogFilter>(emptyFilter);   // one owner
  const { data: courses = [] } = useCourses();

  const visible = filterCourses(courses, filter);                     // computed once, shared

  return (
    <>
      <FilterSidebar filter={filter} onChange={setFilter} resultCount={visible.length} />
      <CourseResults courses={visible} />
    </>
  );
}`, "CatalogPage.tsx"),
        p("Lift only as far as needed. State that only one component uses stays in that component; lifting it to the page re-renders the whole page on every change and makes the page own details it does not care about."),
        h3("Reset state with a key, not an effect"),
        p("The course editor keeps a draft title while the instructor types. When they pick another course in the list, the draft must start over from that course:"),
        code("tsx", `
function CourseEditor({ course }: { course: Course }) {
  const [draft, setDraft] = useState(course.title);   // deliberate snapshot of the saved title
  return <input value={draft} onChange={(e) => setDraft(e.target.value)} />;
}

// in the parent: a different course id means a different editor, with fresh state
<CourseEditor key={course.id} course={course} />`, "CourseEditor.tsx"),
        p("React keeps state for a component as long as the same component type is rendered at the same position in the tree. Without the key, switching from course A to course B renders the same `CourseEditor` in the same place, so the draft from A stays. A different `key` tells React it is a different component: the old one unmounts with its state and a new one mounts with B's title. The tempting alternative, `useEffect(() => setDraft(course.title), [course.id])`, first renders B with A's draft, then renders again with the right one, and every new piece of state in the editor needs another line in that effect."),

        challenge("chal_quiz_trf_221"),

        h2("5. How to verify it"),
        bullets([
            "**React DevTools, Components tab.** Select the component and compare props and hooks. After the fix, the filtered list and the selected course appear nowhere under hooks; only `selectedId` and the filter do. If you see the same data in both places, you have a copy.",
            "**Refetch on purpose.** Leave the tab and come back, or call `queryClient.invalidateQueries({ queryKey: [\"courses\"] })` from the console in development. A new or renamed course must appear in the grid and in the details panel without touching the filter.",
            "**Profiler.** Record a keystroke in the search box. The deleted sync effect shows up as a second commit per keystroke in the old version and is gone in the new one. Use the same recording to decide whether a computation is slow enough for `useMemo`.",
            "**Unit tests on the pure parts.** `filterCourses` and the selection lookup are plain functions: test them with a list, a filter and an id, including an id that is not in the list.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Mirroring a prop in state.** `const [title, setTitle] = useState(props.title)` ignores every later `props.title`. Spot it in DevTools when the prop and the state disagree; fix it by using the prop, or rename it `initialTitle` and reset with a key if a snapshot is what you meant.",
            "**Syncing derived state with an effect.** `useEffect(() => setVisible(filterCourses(courses, filter)), [courses, filter])` works, but renders once with the stale list and again with the fresh one, and adds a second state that can still be set by mistake elsewhere. Spot it as two commits per change in the Profiler; delete the state and the effect and compute the value.",
            "**Storing the selected object.** `setSelected(course)` freezes a copy of the course. Spot it when an edit shows in the list but not in the details; store the id and look the object up.",
            "**useMemo everywhere, with partial dependencies.** It does not make a stale bug go away; with a missing dependency it creates one. Spot it with the exhaustive-deps lint rule, and remove memos that the Profiler cannot justify.",
            "**Resetting state with an effect.** An effect that copies `course.title` into the draft when `course.id` changes shows the previous course's data for one render and grows with every new field. Use a key on the component.",
        ]),

        h2("7. Summary"),
        bullets([
            "Keep each fact in one place. Compute everything you can derive from props and state during render; React re-renders with fresh inputs, so the result is never stale.",
            "Store what the user's actions create (an id, a filter), not copies of objects that live elsewhere; lift shared state to the closest common owner, and reset state with a key.",
            "Add useMemo only when a measured computation costs about a millisecond or more, list every input in its dependencies, and confirm in React DevTools that no derived value appears under hooks.",
        ]),

        h2("Sources"),
        bullets([
            "react.dev: You Might Not Need an Effect - https://react.dev/learn/you-might-not-need-an-effect",
            "react.dev: Choosing the State Structure, Sharing State Between Components, Preserving and Resetting State",
            "react.dev: useMemo reference - how to tell whether a calculation is expensive",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Open a component you wrote recently and list every useState with the three questions from section 3. For each one that turns out to be derived, delete it and compute the value; for each object stored in state, store its id instead. Check the result with React DevTools after a refetch."),
    ],
});
