// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-1-2",
    title: "How to type UI state with discriminated unions: loading, error, empty & success",
    slug: { _type: "slug", current: "typed-ui-state-discriminated-unions" },
    description:
        "The CodeDev catalog told learners \"No courses found\" while it was still loading, and showed a blank page when the API failed, because its state was three independent values: isLoading, isError and data. Learn to model a screen as a discriminated union of loading, error, empty and success, so that impossible combinations do not compile, to derive that state from the request instead of storing it, to keep a list on screen during a background refetch, and to decide which errors deserve a Retry button.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "Two support tickets about the catalog at https://app.codedev.test/courses arrived in the same week. Learners on slow mobile connections see \"No courses found - try another search\" for a second or two before the courses appear, and some of them leave. And during a 12-minute API incident on Thursday, when GET /courses answered 503, the catalog showed an empty white area: no message, no Retry button, no way to tell the page was broken. Both bugs come from the same 20 lines of state handling in CatalogPage.",
    },

    content: [
        h2("1. The incident: three booleans, eight combinations"),
        p("This is the state handling that shipped. It looks reasonable line by line:"),
        code("tsx", `
// CatalogPage.tsx - the version that shipped
const [isLoading, setIsLoading] = useState(false);
const [isError, setIsError] = useState(false);
const [data, setData] = useState<Course[]>([]);

useEffect(() => {
    setIsLoading(true);
    fetchCourses({ search })
        .then((courses) => setData(courses))
        .catch(() => setIsError(true))
        .finally(() => setIsLoading(false));
}, [search]);

if (data.length === 0) return <EmptyState text="No courses found - try another search" />;
if (isLoading) return <Spinner />;
if (isError) return null; // TODO: error UI
return <CourseGrid courses={data} />;`, "CatalogPage.tsx"),
        p("Count the states this code can be in. Three independent values give 2 x 2 x 2 = 8 combinations (treating `data` as empty or not), but the screen only has four honest answers: we are loading, it failed, there is nothing to show, here are the courses. The other combinations are states nobody designed, and the code renders them anyway:"),
        bullets([
            "**Loading with no data yet** (`isLoading: true, data: []`): the first `if` wins, so a slow request shows \"No courses found\". That is ticket one.",
            "**Error** (`isError: true`): on a first load `data` is `[]`, so the first `if` wins and the failure is reported as \"No courses found\". On any later search `data` still holds the previous results, so the third `if` returns `null`: a blank area. That is ticket two.",
            "**Error and loading at once** (`isError: true, isLoading: true`): after one failure `isError` is never reset, so the next search shows a spinner while an old error flag waits for its turn.",
            "**Stale data while loading a new search**: `data` still holds the previous search's results, so the grid shows courses for \"react\" under the heading for \"sql\" until the new response lands.",
        ]),
        p("Reordering the `if`s fixes one combination and breaks another. The problem is not the order; it is that the type allows states the screen cannot explain."),

        h2("2. Reproduce it and read the evidence"),
        p("Open https://app.codedev.test/courses in Chrome with DevTools open. In the **Network** tab, set throttling to **Slow 4G** and type a search: \"No courses found\" appears while the `GET /courses?search=...` row is still pending. Then right-click that row, choose **Block request URL**, and search again: the request fails and the page goes blank."),
        p("React DevTools shows the same thing from the inside. Select `CatalogPage` in the **Components** panel and watch its hooks while the request is pending:"),
        code("text", `
CatalogPage
  hooks
    State: false        <- isLoading (the effect has not set it yet on the first render)
    State: false        <- isError
    State: []           <- data
    Effect

# after the effect ran, request still pending:
    State: true
    State: false
    State: []           <- the render picks EmptyState because data.length === 0 is checked first`, "React DevTools"),
        p("The evidence points at the shape of the state, not at the network: the screen chose \"empty\" because nothing in the code could tell \"empty\" from \"not loaded yet\"."),

        h2("3. The core idea: one state, one kind at a time"),
        p("A **discriminated union** is a union of object types that share one literal property, the discriminant. TypeScript narrows the type when you check it, and each member carries only the fields that make sense for it:"),
        code("typescript", `
type CatalogUiState =
    | { kind: "loading" }
    | { kind: "error"; message: string; canRetry: boolean }
    | { kind: "empty"; query: string }
    | { kind: "success"; courses: Course[]; refreshing: boolean };`, "catalogUiState.ts"),
        p("Compare it with the three booleans. There is no way to write a value that is loading and failed at once, there is no `courses` field to read while loading, and an error always comes with a message. The eight combinations collapse to the four the designer drew. This is often summed up as **make impossible states impossible**: the compiler, not a careful reader, rejects the screens nobody designed."),
        bullets([
            "**`loading`** carries nothing: there is nothing to show yet.",
            "**`error`** carries what the UI needs to explain the failure: a message for a human and whether a Retry button can help.",
            "**`empty`** is a successful answer with no rows. It is not an error and not loading; it carries the query so the UI can say: No courses match \"kubernetes\".",
            "**`success`** carries the courses and a `refreshing` flag: a background refetch keeps the list on screen and shows a small indicator instead of replacing everything with a spinner.",
        ]),
        h3("Derive it, do not store it"),
        p("Do not add a `useState<CatalogUiState>` and keep it in sync by hand: that brings back the bug class you just removed, because now the request state and the UI state can disagree. Compute the UI state from the request on every render. With TanStack Query v5 the request already has a well-defined status: `status` is `\"pending\"` (no data yet), `\"error\"` or `\"success\"`, and `isFetching` is true whenever a request is in flight, including a background refetch of data you already have."),
        code("tsx", `
// features/catalog/hooks/useCatalogState.ts
export function useCatalogState(search: string): CatalogUiState {
    const query = useQuery({
        queryKey: ["courses", { search }],
        queryFn: ({ signal }) => fetchCourses({ search, signal }),
    });
    return deriveUiState({
        status: query.status,
        isFetching: query.isFetching,
        query: search,
        data: query.data,
        error: query.error ? toApiError(query.error) : undefined,   // { status, message }, from the API layer (lesson 4.1)
    });
}`, "useCatalogState.ts"),
        p("`deriveUiState` is a plain function: snapshot in, UI state out, no React. That is what makes the rules testable without a browser, and it is what you write in the exercise below."),
        callout("info", "When you do not need a union",
            "A single boolean is fine for a single yes/no fact: `isMenuOpen`, `isDirty`. A union pays off when several values are only meaningful together (a message only when failed, rows only when loaded). Also, if a library already returns a discriminated union and the screen maps it one to one, use it directly: TanStack Query's result narrows on `status`, so `if (query.status === \"success\") query.data` is already typed. Write your own `deriveUiState` when the screen has rules the library does not know, such as \"zero rows is its own screen\" or \"a 401 is not retryable\"."),

        challenge("chal_quiz_trf_121"),

        h2("4. Worked example: render every kind, and let the compiler check"),
        p("The component switches on `kind`. Inside each `case`, TypeScript knows exactly which fields exist. The `default` branch passes the value to `assertNever`, whose parameter has type `never`: if someone adds a fifth kind (say `{ kind: \"offline\" }`) and forgets to render it, this line stops compiling."),
        code("tsx", `
// features/catalog/components/CatalogBody.tsx
function assertNever(value: never): never {
    throw new Error(\`Unhandled catalog state: \${JSON.stringify(value)}\`);
}

type CatalogBodyProps = { state: CatalogUiState; onRetry: () => void };

export function CatalogBody({ state, onRetry }: CatalogBodyProps) {
    switch (state.kind) {
        case "loading":
            return <CourseGridSkeleton />;
        case "error":
            return (
                <ErrorPanel message={state.message}>
                    {state.canRetry && <button type="button" onClick={onRetry}>Try again</button>}
                </ErrorPanel>
            );
        case "empty":
            return <EmptyState text={state.query ? \`No courses match "\${state.query}"\` : "No courses yet"} />;
        case "success":
            return (
                <>
                    {state.refreshing && <RefreshingBadge />}
                    <CourseGrid courses={state.courses} />
                </>
            );
        default:
            return assertNever(state);
    }
}`, "CatalogBody.tsx"),
        p("The deriving function follows the same shape. Its skeleton checks the request status first, because \"pending\" must win over \"no rows\":"),
        code("typescript", `
function deriveUiState(snapshot: RequestSnapshot): CatalogUiState {
    switch (snapshot.status) {
        case "pending":
            return { kind: "loading" };
        case "error":
            // which message? can a retry help? (401: no; network error, 503: yes)
        case "success":
            // zero rows -> empty; rows -> success, refreshing while a refetch runs
    }
}`),
        h3("Which errors get a Retry button"),
        p("`canRetry` is a product decision you make once, in this function, instead of in every component. The course uses the policy from the HTTP fundamentals course: a network error, a timeout (`408`), `429` and `5xx` can go away on their own, so a Retry button can help. A `401` means the session expired: retrying sends the same expired token, so the UI should ask the learner to sign in again instead. Other `4xx` errors (`400`, `403`, `404`) describe the request itself; show the API's message and no Retry button."),

        h2("5. The exercise"),
        p("Write `deriveUiState` for the catalog. The starter gives you the snapshot type, the union and the exact rules; the test runner feeds it snapshots from real catalog sessions (first load, slow searches, a background refetch, a 401, a 503, an incomplete snapshot) and prints the UI state for each."),
        challenge("chal_coding_trf_122"),

        h2("6. How to verify"),
        bullets([
            "**The compiler.** Try to read `state.courses` outside the `success` branch, or delete the `case \"empty\"`: `tsc --noEmit` must fail. Errors like `Property 'courses' does not exist on type 'CatalogUiState'` are the union doing its job.",
            "**Unit tests on the pure function.** A table of snapshots and expected states (pending -> loading, success with `[]` -> empty, success with `isFetching` -> success with `refreshing: true`, error 401 -> not retryable) runs in milliseconds in Vitest, no DOM needed.",
            "**DevTools throttling and request blocking.** With **Slow 4G**, a new search must show the skeleton, never the empty state. With **Block request URL**, the page must show the error panel. With **Offline**, the Retry button must appear and work once you go back online.",
            "**React DevTools.** Select `CatalogBody`: its `state` prop shows one `kind` and only that kind's fields at any moment.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Checking data before status.** `if (!data?.length) return <Empty />` placed before the loading check is the incident. Spot it by testing a pending snapshot with no data: it must be `loading`.",
            "**Storing the UI state with useState and syncing it in an effect.** Two sources of truth drift apart (the effect runs after the render, so one frame shows the old state). Spot it by searching for `setUiState(` inside a `useEffect`; derive the value during render instead.",
            "**Optional fields instead of a union.** `{ status: string; data?: Course[]; error?: string }` compiles with any combination, so it gives the same guarantees as the three booleans. Spot it when the component needs `!` or `?.` to read fields it should already know are there.",
            "**A spinner on every refetch.** Using `isFetching` instead of `status === \"pending\"` to decide `loading` wipes the list every time the window regains focus. Spot it in the Network tab: each background request makes the grid disappear.",
            "**A Retry button for every error.** A learner with an expired session clicks Retry and gets the same 401 forever. Spot it by blocking with a 401 response (or signing out in another tab) and checking what the page offers.",
        ]),

        h2("8. Summary"),
        numbered([
            "Several booleans that only make sense together allow states nobody designed; a discriminated union with one `kind` at a time makes those states fail to compile.",
            "Derive the UI state from the request on every render with a pure function (status first, then rows), and render it with an exhaustive `switch` that ends in `assertNever`.",
            "Put product rules in that one function: zero rows is `empty`, a background refetch keeps the list with `refreshing`, and only failures that can go away get a Retry button.",
        ]),

        h2("Sources"),
        bullets([
            "TypeScript Handbook, Narrowing: discriminated unions and exhaustiveness checking with never - typescriptlang.org/docs/handbook/2/narrowing.html",
            "TanStack Query v5 docs, Queries: status and fetchStatus - tanstack.com/query/latest/docs/framework/react/guides/queries",
            "React docs, Choosing the State Structure: avoid contradictions in state - react.dev/learn/choosing-the-state-structure",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one screen in an app you know (a profile page, a checkout, a dashboard widget) and list every state its current code can be in by multiplying its booleans and optional fields. Then write the union you would want instead, with only the fields each kind needs, and the table of request snapshots that maps to each kind. Compare the two numbers."),
    ],
});
