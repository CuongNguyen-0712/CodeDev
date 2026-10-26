// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-4-2",
    title: "Server state as a cache: query keys & invalidation after a mutation",
    slug: { _type: "slug", current: "query-keys-invalidation-after-mutation" },
    description:
        "After enrolling, the My courses tab kept showing Enroll until a full reload; the hotfix invalidated every query and turned one click into 40 requests. Learn to treat server data as a cache of someone else's state: a query key names exactly one request, a key factory with normalized filters keeps keys consistent, and after a mutation you invalidate the keys it made wrong - found by prefix - and nothing else.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "Support ticket #4471: \"I clicked Enroll on Node Streams in Practice, the button said Enrolled, but My courses still lists only React Basics and the catalog card still says Enroll. After F5 everything is right.\" The enroll mutation posts to the API and updates its own button, but nothing tells the query cache that the enrollments and the course detail it holds are now out of date. On Thursday a hotfix added queryClient.invalidateQueries() with no filter to every mutation; on Friday the API dashboard shows 40 GET requests per enroll click from the admin dashboard, and the rate limiter starts answering 429.",
    },

    content: [
        h2("1. The incident: a button that lies until F5"),
        p("The enroll button and the My courses tab read the same server data through TanStack Query, but they do not talk to each other:"),
        code("tsx", `
// features/enrollments/MyCourses.tsx
const { data: enrollments } = useQuery({
    queryKey: ["enrollments", userId],
    queryFn: () => getEnrollments(userId),
    staleTime: 60_000,                       // reuse the answer for a minute without refetching
});

// features/catalog/EnrollButton.tsx
const enroll = useMutation({
    mutationFn: (courseId: string) => postEnrollment(courseId),
    onSuccess: () => setEnrolled(true),     // the button's own state, nothing else
});`, "before"),
        p("The POST succeeds, the button flips to Enrolled from its own local state, and the cache still holds the enrollments list fetched a few seconds ago. It is fresh for 60 seconds by configuration, so switching to My courses shows it without a request. A reload throws the cache away, which is why F5 \"fixes\" it."),
        p("The hotfix made the opposite mistake:"),
        code("tsx", `
onSuccess: () => queryClient.invalidateQueries(),   // no filter: every query in the cache`, "hotfix"),
        p("On a learner's catalog page that refetches four or five mounted queries. On the admin dashboard, with charts, tables and per-course panels on screen, it refetches about 40 at once, after every enroll, edit or publish."),

        h2("2. Read the evidence"),
        p("Install the TanStack Query Devtools (`@tanstack/react-query-devtools`, rendered as `<ReactQueryDevtools />` next to your app) and open the panel. It lists every cached query by key with its state - **fresh**, **stale**, **fetching** or **inactive** - and the number of components observing it."),
        code("text", `
Query key                                              Observers  State
["courses","list",{"category":"react"}]                1          fresh
["courses","detail","c_214"]                           1          fresh
["enrollments","u_7"]                                  0          inactive (fresh for 41 s)
["leaderboard","weekly"]                               0          inactive

Network after clicking Enroll on c_214:
POST /enrollments                 201   48 ms
(nothing else)`, "Devtools and Network, before the hotfix"),
        p("Read it as the cache sees it: the server state changed, the cache was never told, and `[\"enrollments\",\"u_7\"]` will be served as fresh for another 41 seconds. With the hotfix, the same click is followed by a GET for every **mounted** query, related or not. Neither version answers the real question: which cached answers did this mutation make wrong?"),

        h2("3. The core idea: a cache of someone else's state"),
        p("Data from the API is not your state. The server owns it, other people change it, and what your app holds is a **copy at a point in time**: a cache. TanStack Query is a cache manager, and it needs two things from you that it cannot guess:"),
        numbered([
            "**A name for every answer: the query key.** The key must contain everything that changes the response - the resource, the user, every filter - and nothing that does not. Two components that need the same answer must build the same key, so they share one request and one cache entry.",
            "**A list of the answers each change makes wrong: invalidation.** After a mutation succeeds, you tell the cache which keys are stale. Stale queries that are on screen refetch at once; the others refetch the next time a component uses them.",
        ]),
        h3("Hierarchical keys and prefix matching"),
        p("Keys are arrays, ordered from general to specific: `[\"courses\"]`, then `[\"courses\", \"list\"]`, then `[\"courses\", \"list\", { category: \"react\" }]`. `invalidateQueries({ queryKey })` matches every cached key that **starts with** the given elements, so one call can target one detail, all lists, or everything about courses:"),
        code("text", `
filter                          matches
["courses"]                     every list and every detail
["courses","list"]              every list, whatever its filters
["courses","detail","c_214"]    that course, and keys below it such as ["courses","detail","c_214","reviews"]
                                not ["courses","detail","c_2140"]: elements are compared whole, not as text`, "prefix matching"),
        p("For an object element, TanStack Query also matches partially: `[\"courses\", \"list\", { category: \"react\" }]` matches a cached list whose filters are `{ category: \"react\", page: 2 }`. Use `exact: true` when you mean one key and nothing below it."),
        h3("A key factory, so keys cannot drift"),
        p("Writing keys by hand in every file is how `[\"enrollment\", userId]` ends up next to `[\"enrollments\", userId]`: an invalidation that matches nothing fails silently. Build every key in one place instead:"),
        code("typescript", `
export const courseKeys = {
    all: ["courses"] as const,
    lists: () => [...courseKeys.all, "list"] as const,
    list: (filters: CatalogFilters) => [...courseKeys.lists(), normalizeFilters(filters)] as const,
    details: () => [...courseKeys.all, "detail"] as const,
    detail: (id: string) => [...courseKeys.details(), id] as const,
};

export const enrollmentKeys = {
    all: ["enrollments"] as const,
    byUser: (userId: string) => [...enrollmentKeys.all, userId] as const,
};`, "features/catalog/queryKeys.ts"),
        p("Each level is built from the level above it, so the prefix relation is guaranteed by construction, and a typo becomes a compile error (`courseKeys.detial`) instead of a silent miss."),
        h3("Normalize filters before they become a key"),
        p("Filters usually come from the URL, and the URL carries things the server does not care about. `?category=react`, `?category=react&page=1` and `?category=react&utm_source=newsletter` all ask the API for the same list, but as raw objects they are three different keys: three cache entries and three requests for one answer. TanStack Query hashes keys with object properties sorted, so property order already does not matter there; default values, empty strings and unknown parameters still do. Normalize them in the factory: keep only the filters the API understands, drop defaults (page 1, the default sort, an empty search) and canonicalize what the server treats as equal (a search the API matches case-insensitively, surrounding spaces)."),
        h3("Invalidate what the mutation changed, from a table"),
        p("Write down, per mutation, which server data it changes and where that data is shown. For the catalog:"),
        code("text", `
mutation                 what changed on the server            keys to invalidate
enroll / unenroll        the user's enrollments,               courseKeys.detail(courseId)
                         the course's enrolled count            enrollmentKeys.byUser(userId)
edit course              title, level, rating... of a course    courseKeys.detail(courseId)
                                                               courseKeys.lists()
                                                               enrollmentKeys.all   (My courses shows titles)
publish course           a course appears in lists             courseKeys.lists()`, "the invalidation table"),
        p("Lists are deliberately not invalidated after an enroll: the enrolled count on a catalog card may be a minute late, and the product team accepted that in exchange for not refetching every list on every click. That is a decision, written in one table, not an accident of whoever wrote the mutation."),
        h3("When not to invalidate"),
        bullets([
            "**The mutation's response already contains the new data.** If `PATCH /courses/c_214` returns the updated course, write it into the cache with `queryClient.setQueryData(courseKeys.detail(id), updated)` and skip a GET. Invalidate the lists anyway if they are sorted or filtered by what changed.",
            "**Data the user must never see stale**, such as a balance before a payment: do not rely on a cache with a `staleTime`; fetch it at the moment of the decision, and let the server check it again.",
            "**`invalidateQueries()` with no filter.** It is a reset button, not a fix: it hides a missing row in your table and costs one request per mounted query on every mutation.",
        ]),

        challenge("chal_quiz_trf_421"),

        h2("4. Worked example: the enroll mutation, fixed"),
        p("The catalog reads lists and details through the factory:"),
        code("tsx", `
export function useCourseList(filters: CatalogFilters) {
    return useQuery({
        queryKey: courseKeys.list(filters),          // the key holds every filter the API uses
        queryFn: ({ signal }) => getCourses(filters, signal),
        staleTime: 60_000,
    });
}

export function useCourse(id: string) {
    return useQuery({ queryKey: courseKeys.detail(id), queryFn: () => getCourse(id) });
}`, "features/catalog/queries.ts"),
        p("The mutation invalidates exactly the rows of the table, after the server confirmed the change:"),
        code("tsx", `
export function useEnroll(userId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (courseId: string) => postEnrollment(courseId),
        onSuccess: (_data, courseId) =>
            // returning the promise keeps the mutation pending until the refetches finish,
            // so the button does not say "Enrolled" over a My courses tab that does not yet
            Promise.all([
                queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) }),
                queryClient.invalidateQueries({ queryKey: enrollmentKeys.byUser(userId) }),
            ]),
    });
}`, "features/enrollments/useEnroll.ts"),
        bullets([
            "**`onSuccess`, not `onMutate`.** Invalidating before the server finished refetches the old data and marks it fresh.",
            "**No local `enrolled` state in the button.** It reads `enrollments` from the cache like My courses does, so both show the same truth after the refetch.",
            "**Only mounted queries refetch now** (`refetchType: \"active\"` is the default in v5). `[\"enrollments\",\"u_7\"]` is inactive while the catalog is on screen: it is marked stale and refetches when the learner opens My courses.",
        ]),

        h2("5. Your turn: a key factory and keysToInvalidate"),
        p("The exercise rebuilds the two pieces that decide whether this works, without a library: a factory whose `list(filters)` gives identical keys for filters that mean the same request, and a function that takes the keys currently in the cache and a mutation and returns the keys to invalidate, matched by prefix element by element. The tests replay the incident, URL filters with junk in them, look-alike ids such as `c_1` and `c_10`, and a cache of 155 keys."),
        challenge("chal_coding_trf_422"),

        h2("6. How to verify"),
        bullets([
            "**Count requests per click.** In the Network panel, clear the log, click Enroll and count the GETs: one for the course detail if it is on screen, one for enrollments if My courses is mounted, none for unrelated features. With the no-filter hotfix, the count equals the number of mounted queries.",
            "**Watch the Devtools.** After the mutation, the invalidated keys turn stale (and fetching, if mounted); everything else keeps its state. A key that should have turned stale and did not is a missing row in the table or a typo in a key.",
            "**Unit-test the pure parts.** The factory and the invalidation table are plain functions: test that `courseKeys.list({ category: \"react\", page: 1 })` equals `courseKeys.list({ category: \"react\" })`, and that an enroll on `c_1` does not reach `c_10`.",
            "**Reproduce the bug report.** Open the catalog and My courses in two tabs of the same app (or switch between them), enroll, and check that My courses is right without F5.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Keys written by hand in each file.** `[\"enrollment\", id]` in one place and `[\"enrollments\", id]` in another: the invalidation matches nothing and reports nothing. Spot it with a search for `queryKey: [`; every hit outside the factory is a candidate.",
            "**A variable missing from the key.** `queryKey: [\"courses\", \"list\"]` with `category` used only inside `queryFn`: changing the filter shows the cached answer for the old one. The ESLint plugin `@tanstack/eslint-plugin-query` (rule `exhaustive-deps`) flags it.",
            "**Raw URL filters as the key.** `utm_source`, `page: 1` and `search: \"\"` split one answer into several cache entries. Spot it in the Devtools: two keys that differ only by a default or a tracking parameter.",
            "**Invalidating everything.** `invalidateQueries()` or `queryKey: [\"courses\"]` after every mutation. Spot it by counting GETs per click on the busiest page.",
            "**Flat string keys.** `\"courses-react-2\"` cannot be matched by prefix without string tricks, and string prefixes confuse `c_1` with `c_10`. Keep keys as arrays from general to specific.",
        ]),

        h2("8. Summary"),
        numbered([
            "Server data in the browser is a cache of someone else's state. A query key names one answer: it holds everything that changes the response and nothing that does not, so build keys in one factory and normalize filters before they become part of a key.",
            "After a mutation succeeds, invalidate the keys whose answers it made wrong, from a written table: hierarchical keys let one prefix reach a detail, all lists or a user's enrollments.",
            "Invalidating too little leaves the UI wrong until a reload; invalidating everything costs one request per mounted query on every click. Verify both by counting requests in the Network panel and watching stale keys in the Devtools.",
        ]),

        h2("Sources"),
        bullets([
            "TanStack Query docs, Query Invalidation guide: https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation",
            "TanStack Query docs, Query Keys guide (keys are hashed deterministically; array order matters, object property order does not)",
            "TanStack Query docs, Invalidations from Mutations and Updates from Mutation Responses",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the invalidation table for three mutations in a project you work on: what each one changes on the server, where that data is shown, and which keys follow. Then open the Network panel on the busiest page, perform each mutation once and compare the requests you see with the table."),
    ],
});
