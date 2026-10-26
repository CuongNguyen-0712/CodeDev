// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-2-1",
    title: "How to manage search, filters & page with a reducer",
    slug: { _type: "slug", current: "catalog-reducer-search-filters-page" },
    description:
        "A learner on page 7 of the React courses switched to SQL, which has 2 pages, and saw an empty catalog: five useState calls each changed their own value and nothing reset the page. Learn when several pieces of state belong in one reducer, how to type its actions as a discriminated union, which rules live there (a new filter means page 1, an impossible page is ignored, a no-op returns the same object), and how to test it as a pure function.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer, CodeDev course catalog",
        problem:
            "Support ticket #4127: \"I was browsing React courses, went to page 7, then picked SQL instead. The page says 'No courses match your filters' but there are SQL courses, my friend sees them.\" The catalog at https://app.codedev.test/courses keeps search, categories, level, sort and page in five separate useState calls. Each chip, select and button updates its own value; only the pager knows about the page. The URL after the switch is /courses?category=sql&page=7, and the API correctly answers that SQL has 2 pages and page 7 is empty.",
    },

    content: [
        h2("1. The incident: five states, one rule nobody owns"),
        p("This is the catalog page as it shipped. Every control got its own piece of state, which is the first thing React teaches and a fine start for one or two values:"),
        code("tsx", `
// features/catalog/CatalogPage.tsx - the version that shipped
export function CatalogPage() {
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);

  const { data } = useCourses({ search, categories, level, sort, page });

  return (
    <>
      <SearchBox value={search} onChange={setSearch} />
      <CategoryChips
        selected={categories}
        onToggle={(c) =>
          setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
        }
      />
      <LevelSelect value={level} onChange={setLevel} />
      <SortSelect value={sort} onChange={setSort} />
      <CourseGrid courses={data?.items ?? []} />
      <Pager page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
    </>
  );
}`, "CatalogPage.tsx"),
        p("Nothing here is wrong line by line. The bug is a rule that belongs to **several** values at once: a page number only means something for one combination of search, categories, level and sort. Change the combination and \"page 7\" points at a page of a different list. With five setters, that rule has to be repeated in every handler, and the first handler that forgets it ships the bug. The category chips forgot it."),

        h2("2. Reproduce it and read the evidence"),
        p("Open https://app.codedev.test/courses, select the React chip and click through to page 7. Then click React off and SQL on. In DevTools, open the **Network** tab and filter by `courses`:"),
        code("text", `
GET https://api.codedev.test/courses?category=react&page=7&pageSize=12   200  {"items":[12 courses],"total":143,"totalPages":12}
GET https://api.codedev.test/courses?page=7&pageSize=12                  200  {"items":[12 courses],"total":412,"totalPages":35}
GET https://api.codedev.test/courses?category=sql&page=7&pageSize=12     200  {"items":[],"total":19,"totalPages":2}`, "Network tab"),
        p("Read the last line as the server did. 19 SQL courses at 12 per page are 2 pages; page 7 is empty. The API is right, and the client asked for a page that cannot exist. The middle request is a second clue: clicking React off produced an intermediate state (no category, still page 7) that the user never meant to look at."),
        p("Now open the **Components** tab of React DevTools and select `CatalogPage`. The **hooks** list shows five `State` entries. After the second click you see `categories: [\"sql\"]` and `page: 7` side by side. That is the evidence that the bug lives in the client's state, not in the API or the grid."),

        h2("3. Core idea: one owner for values that change together"),
        p("A reducer is a pure function `(state, action) => nextState`. `useReducer(reducer, initialState)` gives you the current state and a `dispatch` function; every change goes through the reducer. Three things make it the right tool for the catalog:"),
        bullets([
            "**The rules live in one place.** \"A new filter means page 1\" is written once, next to the code that changes the filter. A new chip, a keyboard shortcut or a link from the home page dispatches the same action and cannot forget the rule.",
            "**Handlers say what happened, not how to change state.** `dispatch({ type: \"categoryToggled\", category: \"sql\" })` reads like the user's intent. The component no longer decides which fields to touch.",
            "**It is a pure function, so you can test it without React.** Feed it a state and a list of actions, compare the result. No render, no DOM, no timers. That is exactly how the challenge in this lesson is graded.",
        ]),
        h3("When not to use a reducer"),
        p("A reducer costs a type for the state, a union for the actions and a switch. Do not pay that for state that has no shared rules:"),
        bullets([
            "**Independent values.** A modal's `isOpen` and a tooltip's text do not constrain each other. Two `useState` calls are simpler and clearer.",
            "**Values you can compute.** The list of visible courses, the result count and \"is any filter active?\" are derived from the state you already have. Storing them is the subject of the next lesson.",
            "**Server data.** The courses themselves come from the API and belong in a server cache (TanStack Query in module 4). The reducer holds what the user chose, not what the server returned. The one exception in this lesson is `totalPages`, which the reducer needs to keep the page valid.",
        ]),
        callout("info", "A reducer is not a global store",
            "useReducer keeps state inside one component, like useState. Moving the catalog's state into a reducer does not make it global and does not require a library. If two distant components need it later, pass state and dispatch down, or put them in a context then."),

        h2("4. Worked example: types first, then the rules"),
        p("Start with the types. The state is one object; the actions are a **discriminated union** on `type`, so each action carries exactly the payload it needs and TypeScript narrows it inside each `case`:"),
        code("typescript", `
// features/catalog/catalogState.ts
export const CATEGORIES = ["react", "node", "sql", "python", "devops"] as const;
export const LEVELS = ["all", "beginner", "intermediate", "advanced"] as const;
export const SORTS = ["newest", "rating", "popular"] as const;

export type Category = (typeof CATEGORIES)[number];
export type LevelFilter = (typeof LEVELS)[number];
export type Sort = (typeof SORTS)[number];

export type CatalogState = {
  search: string;
  categories: Category[];
  level: LevelFilter;
  sort: Sort;
  page: number;
  totalPages: number;
};

export type CatalogAction =
  | { type: "searchTyped"; text: string }
  | { type: "categoryToggled"; category: Category }
  | { type: "levelSet"; level: LevelFilter }
  | { type: "sortChanged"; sort: Sort }
  | { type: "pageChanged"; page: number }
  | { type: "filtersReset" }
  | { type: "resultsLoaded"; totalPages: number };`, "catalogState.ts"),
        p("Name actions after **what happened** (`searchTyped`, `resultsLoaded`), not after the field they set (`setPage`). The difference matters: `setPage` invites every caller to decide the page, which is how the bug started; `categoryToggled` lets the reducer decide that the page goes back to 1."),
        p("Here is one branch of the reducer, to show the shape. You will write the full set of rules, with their runtime checks, in the challenge:"),
        code("typescript", `
export function catalogReducer(state: CatalogState, action: CatalogAction): CatalogState {
  switch (action.type) {
    case "sortChanged":
      if (action.sort === state.sort) return state;          // nothing changed: same object
      return { ...state, sort: action.sort, page: 1 };       // new list order: back to page 1
    // ... searchTyped, categoryToggled, levelSet, pageChanged, filtersReset, resultsLoaded
    default:
      return state;
  }
}`, "catalogReducer.ts"),
        p("Three habits are visible in those few lines:"),
        numbered([
            "**Return a new object for a change, never mutate.** `{ ...state, sort, page: 1 }` creates a new object; the old state stays exactly as it was. React compares the old and new state with `Object.is`: a mutated object returned as itself looks unchanged, and the screen does not update.",
            "**Return the same object when nothing changes.** For `useReducer`, returning `state` itself lets React skip the re-render. It also makes \"nothing happened\" easy to test: `expect(next).toBe(state)`.",
            "**Every action that changes the list resets the page.** Search, categories, level and sort all describe *which* list; the page describes *where* in it.",
        ]),
        h3("Actions that come from outside the types"),
        p("TypeScript checks the actions you write in your own code. It cannot check values that arrive at runtime: a page parsed from `?page=abc`, a session saved by last month's version of the app with a category that no longer exists, a message from another tab. Those reach the reducer as `CatalogAction` only because someone cast them. The reducer is the last place that decides what the state may contain, so it checks the values its rules depend on (`Number.isInteger(page)`, `CATEGORIES.includes(...)`) and ignores the rest by returning the same state."),
        callout("tip", "Ignore or clamp?",
            "Both are valid; pick one per action and write it down. In this lesson pageChanged ignores a page outside 1..totalPages (a click on a page that does not exist is a bug elsewhere, and silently moving the user is surprising), while resultsLoaded clamps the current page, because the user did nothing wrong when the list shrank under them."),
        h3("Wiring it into the page"),
        code("tsx", `
export function CatalogPage() {
  const [state, dispatch] = useReducer(catalogReducer, initialCatalogState);
  const { data } = useCourses(state);              // search, categories, level, sort, page

  useEffect(() => {
    if (data) dispatch({ type: "resultsLoaded", totalPages: data.totalPages });
  }, [data]);

  return (
    <>
      <SearchBox value={state.search} onChange={(text) => dispatch({ type: "searchTyped", text })} />
      <CategoryChips
        selected={state.categories}
        onToggle={(category) => dispatch({ type: "categoryToggled", category })}
      />
      <LevelSelect value={state.level} onChange={(level) => dispatch({ type: "levelSet", level })} />
      <SortSelect value={state.sort} onChange={(sort) => dispatch({ type: "sortChanged", sort })} />
      <CourseGrid courses={data?.items ?? []} />
      <Pager
        page={state.page}
        totalPages={state.totalPages}
        onChange={(page) => dispatch({ type: "pageChanged", page })}
      />
      <button onClick={() => dispatch({ type: "filtersReset" })}>Clear filters</button>
    </>
  );
}`, "CatalogPage.tsx"),
        p("The handlers are now one line each and none of them knows about the page. The `resultsLoaded` effect syncs one fact from the server into the reducer; module 3 explains why that effect is fine (it reacts to new data) and when an effect like it is not."),
        callout("info", "dispatch is stable",
            "React gives you the same dispatch function on every render, so it is safe to pass to children and to leave out of effect dependencies. The reducer itself also sees the latest state on every call, which removes a whole family of stale-value bugs you will meet in lesson 3.3."),

        challenge("chal_quiz_trf_211"),

        h2("5. How to verify it"),
        bullets([
            "**Unit test the reducer.** It is a pure function, so a test is three lines: build a state, call the reducer, compare. Write one test per rule, including the incident: `catalogReducer({ ...s, categories: [\"react\"], page: 7 }, { type: \"categoryToggled\", category: \"sql\" }).page` must be 1. Add `expect(catalogReducer(s, { type: \"sortChanged\", sort: s.sort })).toBe(s)` for the no-op rule.",
            "**Freeze the input in tests.** `Object.freeze(state)` and `Object.freeze(state.categories)` make any mutation throw in strict mode, so a `push` or `state.page = ...` fails the test at the line that does it.",
            "**React DevTools, Components tab.** Select CatalogPage: the hooks list now shows one `Reducer` entry with the whole state. Toggle a chip and watch `page` go to 1 in the same update as `categories`.",
            "**Network tab.** Repeat the incident: page 7 of React, then SQL. You should see one request for `category=sql&page=1`, and no request with a page above `totalPages`.",
        ]),
        code("typescript", `
import { test, expect } from "vitest";
import { catalogReducer } from "./catalogReducer";
import type { CatalogState } from "./catalogState";

const start: CatalogState = {
  search: "", categories: ["react"], level: "all", sort: "newest", page: 7, totalPages: 12,
};
Object.freeze(start);
Object.freeze(start.categories);   // a push or a splice now throws instead of passing silently

test("switching category goes back to page 1", () => {
  const next = catalogReducer(start, { type: "categoryToggled", category: "sql" });
  expect(next.categories).toEqual(["react", "sql"]);
  expect(next.page).toBe(1);
});`, "catalogReducer.test.ts"),

        h2("6. Common mistakes"),
        bullets([
            "**`setPage`-style actions.** An action named after a field (`{ type: \"set\", field: \"category\", value }`) moves the rules back into the components. Spot it when the reducer is one generic `case` and the handlers contain `page: 1`.",
            "**Mutating and returning the same object.** `state.page = n; return state;`, or `state.categories.push(c); return { ...state, page: 1 };` (a new outer object, but the previous state's array was changed under it). Spot it with frozen test inputs, or when a click updates the screen only after some unrelated re-render.",
            "**A new object for every action.** `default: return { ...state }` makes every unknown or no-op action look like a change, so React re-renders and every effect that depends on `state` runs again. Spot it with a test that uses `toBe(state)`, or with the React DevTools Profiler showing renders after clicks that change nothing.",
            "**Trusting the cast.** `JSON.parse(saved) as CatalogState` or `Number(params.get(\"page\"))` turns `\"abc\"` into `NaN` and `2.5` into a page. Spot it by opening `/courses?page=abc` and `/courses?page=999` and reading what the reducer stored.",
            "**Storing what you can compute.** `visibleCount`, `hasFilters` or the filtered course list inside the reducer will drift from the values they come from. Compute them during render (next lesson).",
        ]),

        h2("7. Write the catalog reducer"),
        p("The challenge gives you the state, the action union and a test runner that applies a list of actions, including invalid ones parsed from URLs and old sessions. It prints the state after each action and marks when you returned the same object or changed the previous one. Write `catalogReducer` so the incident cannot happen again:"),
        code("typescript", `
function catalogReducer(state: CatalogState, action: CatalogAction): CatalogState {
  // for each action type:
  //   1. is the payload valid at runtime? if not, return state
  //   2. does it change anything? if not, return state
  //   3. return a new object; reset page to 1 when the list itself changed
}`),
        challenge("chal_coding_trf_212"),

        h2("8. Summary"),
        bullets([
            "Put values in one reducer when a rule connects them: here, \"a different list means page 1\" and \"the page stays inside totalPages\". Independent values can stay in useState.",
            "Type actions as a discriminated union named after what happened; return a new object for a change and the same object for a no-op or an invalid action, and never mutate.",
            "Test the reducer as a pure function, with frozen inputs and `toBe(state)` for no-ops, then confirm in React DevTools and the Network tab that no request asks for a page that cannot exist.",
        ]),

        h2("Sources"),
        bullets([
            "react.dev: Extracting State Logic into a Reducer (learn/extracting-state-logic-into-a-reducer)",
            "react.dev: useReducer reference - the Object.is comparison and why mutating state does not update the screen",
            "TypeScript Handbook: Narrowing - discriminated unions",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Sync the reducer state with the URL: write parseCatalogParams(searchParams) that turns ?q=&category=&level=&sort=&page= into a CatalogState (ignoring invalid values) and catalogToParams(state) for the other direction, then check that every catalog URL survives a round trip and that /courses?page=abc lands on page 1."),
    ],
});
