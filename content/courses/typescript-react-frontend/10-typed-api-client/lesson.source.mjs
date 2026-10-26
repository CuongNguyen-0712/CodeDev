// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-4-1",
    title: "A typed API layer: response types & errors as a union",
    slug: { _type: "slug", current: "typed-api-layer-errors-as-union" },
    description:
        "The API renamed rating to averageRating and the catalog crashed deep inside CourseCard, while tsc reported zero errors, because the client cast the JSON to Course[]. Learn why types end at the network boundary, how to parse unknown JSON into a Course at runtime, how to model network, timeout, HTTP and invalid-response failures as one union the UI can switch on, and how to handle problem+json bodies and 204 responses in one place.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer, CodeDev learning platform",
        problem:
            "On Monday at 10:40 the error tracker for https://app.codedev.test fills with one error: \"TypeError: Cannot read properties of undefined (reading 'toFixed')\" in CourseCard. The catalog page is blank for every learner. Nothing changed in the web app since Friday; the API team deployed v2.14 at 10:35, which renamed the course field rating to averageRating. The web client read GET /courses with `(await res.json()) as Course[]`, so TypeScript kept believing every course had a numeric rating. The same week, support reported that unenrolling shows \"Something went wrong\" although the course does leave the list after a reload.",
    },

    content: [
        h2("1. The incident: a crash far away from its cause"),
        p("The stack trace in the error tracker points at a component that has not changed in months:"),
        code("text", `
TypeError: Cannot read properties of undefined (reading 'toFixed')
    at CourseCard (src/features/catalog/CourseCard.tsx:18:38)
    at renderWithHooks (react-dom.development.js)
    at CourseGrid (src/features/catalog/CourseGrid.tsx:24:9)
    at CatalogPage (src/features/catalog/CatalogPage.tsx:41:7)

Release: web 2026.10.24 (unchanged since Friday)
First seen: Mon 10:41  Events: 18,204  Users: 3,912`, "error tracker"),
        p("Line 18 of CourseCard is ordinary code that has worked since the first release:"),
        code("tsx", `
// src/features/catalog/CourseCard.tsx
export function CourseCard({ course }: { course: Course }) {
    return (
        <article className="course-card">
            <h3>{course.title}</h3>
            <span aria-label="rating">{course.rating.toFixed(1)} / 5</span>   {/* line 18 */}
            <span>{course.enrolled} learners</span>
        </article>
    );
}`, "CourseCard.tsx"),
        p("The cause is in a different file, written months earlier, and it still compiles without a single error:"),
        code("typescript", `
// src/features/catalog/api.ts
export async function getCourses(): Promise<Course[]> {
    const res = await fetch("https://api.codedev.test/courses");
    return (await res.json()) as Course[];
}`, "api.ts - the version that shipped"),
        p("Every piece of this function is legal TypeScript. The problem is a promise it cannot keep: it says it returns `Course[]`, but it never looks at what the server sent. On Monday the server started to send something else, and the first code that noticed was a component three calls away, at the moment it rendered."),

        h2("2. Read the evidence"),
        p("Open https://app.codedev.test, open DevTools, select the **Network** tab, filter by `courses` and reload. Click the `GET /courses` row and open **Response**. The body has every field except one:"),
        code("json", `
[
  { "id": "c_101", "title": "React Basics", "category": "react", "level": "beginner",
    "averageRating": 4.6, "enrolled": 1820, "publishedAt": "2026-03-02T09:00:00Z" },
  { "id": "c_305", "title": "SQL Joins Without Fear", "category": "sql", "level": "beginner",
    "averageRating": 4.8, "enrolled": 2210, "publishedAt": "2026-01-11T09:00:00Z" }
]`, "Network > Response"),
        p("Now check what the compiler thinks. `npx tsc --noEmit` finishes with no output. You can reproduce the whole incident in the browser console in two lines, without React:"),
        code("typescript", `
const course = JSON.parse('{"id":"c_101","averageRating":4.6}') as Course;
course.rating.toFixed(1);   // TypeError: Cannot read properties of undefined (reading 'toFixed')`, "console"),
        p("Two facts explain everything. First, TypeScript types are erased when the code is compiled: no check of `Course` exists at runtime. Second, `res.json()` returns `Promise<any>`, and `as Course[]` is a **type assertion**: an instruction to the compiler to stop checking, which produces no code. Between them, nothing ever compared the response with the type."),
        p("The second report has the same root. Unenrolling calls `DELETE /enrollments/c_214`, the Network panel shows `204 No Content` with a size of 0 B, and the console shows `SyntaxError: Failed to execute 'json' on 'Response': Unexpected end of JSON input`. The server did its job; the client called `res.json()` on a response that has no body, and the catch block turned that into \"Something went wrong\"."),

        h2("3. The core idea: types end at the network boundary"),
        p("Inside your app, TypeScript can prove things because it sees both sides of every call. A response from the network is different: the other side is a server deployed on its own schedule, a proxy that can answer with an HTML error page, or a connection that never answers at all. The type you write for the response is a hope until code checks it."),
        p("A **typed API layer** is the one module where that check happens. It has a single job: turn whatever `fetch` produced into a value whose type is honest. Everything outside it - hooks, components, reducers - can then trust its types, because the only door from the network into the app checks what goes through."),
        h3("Parse, do not assert"),
        p("The response body starts as `unknown`: a value you may not use until you have checked what it is. A parser narrows it step by step with checks the compiler understands (`typeof`, `Array.isArray`, comparisons with allowed values) and returns a **new** object built from the checked fields. Two things fall out of that for free: a renamed field fails at the boundary with a clear reason (`courses[0].rating is invalid`) instead of a crash in a component, and extra fields the server adds never leak into your state."),
        h3("Every failure gets a name"),
        p("A request can fail in four ways that need different reactions in the UI, so the API layer returns them as one discriminated union instead of a generic `Error`:"),
        code("typescript", `
type ApiError =
    | { kind: "network" }                                   // fetch rejected: offline, DNS, CORS
    | { kind: "timeout" }                                   // our own limit fired (TimeoutError)
    | { kind: "http"; status: number; message: string }     // the server answered with 4xx or 5xx
    | { kind: "invalid-response"; reason: string };         // 2xx, but not the shape we expect

type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };`, "api/types.ts"),
        bullets([
            "**network** and **timeout**: the user can retry, or check their connection (the Timeouts & retries lesson of Web Application Fundamentals covers which ones to retry automatically).",
            "**http**: the server gave a reason. With `Content-Type: application/problem+json` (RFC 9457, Problem Details for HTTP APIs) the body is an object with `title` (a short summary of the problem type) and `detail` (an explanation of this occurrence), which you can show to the user.",
            "**invalid-response**: a contract bug between the API and the client. The user cannot fix it, so show a neutral message and report the `reason` to your error tracker with the endpoint, where it points straight at the field that changed.",
        ]),
        p("Because `kind` is a literal, a `switch` over it is exhaustive: add a fifth kind later and every `switch` that ends with an `assertNever` stops compiling until it handles it (lesson 1.2)."),
        h3("When not to do this"),
        bullets([
            "**Calls inside your own code.** A function in the same bundle is checked by the compiler; parsing its result again only adds noise. The boundary is the network (and `localStorage`, `postMessage`, URL parameters: anything another program wrote).",
            "**When a schema library is already there.** If the project uses zod or valibot, write the schema once and let it parse; do not hand-write a second parser. If the API publishes an OpenAPI document, generate the types from it and still validate at runtime: generated types describe the contract, they do not enforce it.",
            "**Throwaway prototypes.** A spike that will be deleted on Friday can cast. The moment it ships to learners, it gets a parser.",
        ]),
        callout("info", "Reject the list, or skip the bad item?",
            "This lesson rejects the whole response when one course is invalid: a contract change is loud, gets fixed fast and never shows half a catalog that looks complete. Some teams prefer to drop invalid items and report them, so that one bad record does not hide 119 good ones. Both are defensible; what matters is that the choice is made once, in the API layer, and that it is visible in your error tracker."),

        challenge("chal_quiz_trf_411"),

        h2("4. Worked example: the enrollments endpoint"),
        p("Here is the pattern on a different resource, `GET /users/{id}/enrollments`, which the My courses tab reads. The shape is small, so the whole parser fits on screen:"),
        code("typescript", `
type Enrollment = { courseId: string; progress: number; status: "active" | "completed" };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A checked Enrollment, or the reason this element is not one. */
function parseEnrollment(value: unknown, i: number): Enrollment | string {
    if (!isRecord(value)) return \`enrollments[\${i}] is not an object\`;
    const { courseId, progress, status } = value;
    if (typeof courseId !== "string" || courseId === "") return \`enrollments[\${i}].courseId is invalid\`;
    if (typeof progress !== "number" || progress < 0 || progress > 100) return \`enrollments[\${i}].progress is invalid\`;
    if (status !== "active" && status !== "completed") return \`enrollments[\${i}].status is invalid\`;
    return { courseId, progress, status };   // a new object: unknown fields stay behind
}`, "features/enrollments/parse.ts"),
        p("No `as` anywhere: after `typeof progress !== \"number\"` returns early, the compiler knows `progress` is a number; after the two comparisons, it knows `status` is `\"active\" | \"completed\"`. If someone deletes a check, the `return` line stops compiling, which is exactly the safety net the cast removed."),
        p("The fetch wrapper decides, in order, whether there is anything to parse at all:"),
        code("typescript", `
async function request(url: string): Promise<Result<unknown>> {
    let res: Response;
    try {
        res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch (error) {
        const kind = error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network";
        return { ok: false, error: { kind } };
    }
    if (!res.ok) return { ok: false, error: { kind: "http", status: res.status, message: await problemMessage(res) } };
    if (res.status === 204) return { ok: true, data: null };     // success, and nothing to parse
    const text = await res.text();
    try {
        return { ok: true, data: JSON.parse(text) as unknown };  // unknown: the parser decides what it is
    } catch {
        return { ok: false, error: { kind: "invalid-response", reason: "body is not JSON" } };
    }
}`, "api/request.ts"),
        bullets([
            "`res.text()` then `JSON.parse` instead of `res.json()`: you keep the raw text for the error report, and an HTML page from a proxy becomes a named failure instead of a `SyntaxError` somewhere up the stack.",
            "`as unknown` is the one assertion that is always safe: it widens instead of narrowing, so the next line cannot use the value without checking it.",
            "`problemMessage` reads `res.headers.get(\"content-type\")` - the `Headers` object compares names case-insensitively, a plain object of recorded headers does not - and uses `detail`, then `title`, then a generic `HTTP 503`.",
            "Abort from a Cancel button is a different case: rethrow an `AbortError` or return a third result, but never show it as an error (lesson 4.3).",
        ]),
        h3("Plugging the Result into TanStack Query"),
        p("TanStack Query decides between `error` and `success` by whether the query function throws. Keep the union as the error value and throw it from the query function:"),
        code("tsx", `
export function useCourses() {
    return useQuery<Course[], ApiError>({
        queryKey: ["courses", "list"],
        queryFn: async () => {
            const result = await getCourses();      // Result<Course[]>
            if (!result.ok) throw result.error;     // the union becomes query.error
            return result.data;
        },
    });
}

function CatalogError({ error }: { error: ApiError }) {
    switch (error.kind) {
        case "network": return <p role="alert">You seem to be offline. Check your connection and try again.</p>;
        case "timeout": return <p role="alert">The catalog is taking too long to answer. Try again.</p>;
        case "http": return <p role="alert">{error.message}</p>;
        case "invalid-response": return <p role="alert">The catalog could not be loaded. We have been notified.</p>;
        default: return assertNever(error);
    }
}`, "features/catalog/useCourses.tsx"),
        p("The component no longer needs to know about status codes, content types or JSON: it switches on four names, and the compiler checks that it handles all of them."),

        h2("5. Your turn: from a recorded response to a Result"),
        p("The exercise works on recordings instead of a live server: each one is either the error `fetch` rejected with, or a status, headers and the raw body text, exactly what you can copy from the Network panel. That makes every rule testable without a network, including the incident's `averageRating`, a `204`, an HTML page served with status 200 and a broken problem body."),
        challenge("chal_coding_trf_412"),

        h2("6. How to verify"),
        bullets([
            "**Unit tests on recordings.** Save real responses from the Network panel (right-click the row, **Copy > Copy response**) as fixtures, then add the broken variants by hand: a renamed field, an empty body, an HTML page, a 503 with problem details. A test per fixture proves the API layer, not the component, reports each one.",
            "**Override the response in DevTools.** In Chrome, right-click the `GET /courses` row and choose **Override content**, then rename `rating` in the saved body and reload. The page must show the invalid-response message, and the error tracker must receive `courses[0].rating is invalid`.",
            "**Watch the compiler.** Remove one check from a parser: the `return { ... }` line must stop compiling. Search the code base for `as Course` and `.json() as`: each hit is a boundary without a check.",
            "**204 and empty bodies.** In the Network panel, a `204` row has size 0 B; the console must stay clean after the action and the UI must show success.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**`(await res.json()) as T`.** The incident in one line. Spot it with a search for `as ` next to `json()`; a typed `fetch` wrapper with a generic `<T>` and no parser argument is the same cast with a nicer name.",
            "**`if (!res.ok) throw new Error(\"Request failed\")`.** The status and the server's explanation are thrown away, so the UI cannot tell a 401 from a 503. Spot it when every error in the tracker has the same message.",
            "**`res.json()` before checking the status.** An error page from a proxy is HTML, and a 204 has no body: both become `SyntaxError: Unexpected token '<'` or `Unexpected end of JSON input`. Spot it in the console next to a request whose status is not 200.",
            "**`catch { return [] }`.** The catalog shows its empty state (\"No courses match your filters\") when the API is broken, and nobody gets an alert. Spot it when the empty state appears together with a red row in the Network panel.",
            "**Validating inside components.** `course.rating ?? 0` in CourseCard hides the contract change and shows wrong data. Checks belong at the boundary, once; components receive values that are already right.",
        ]),

        h2("8. Summary"),
        numbered([
            "TypeScript types do not exist at runtime: `res.json()` gives you whatever the server sent, and `as Course[]` only silences the compiler. Treat the body as `unknown` and parse it into new, checked objects in one API layer.",
            "Model every way a request can fail as a discriminated union - network, timeout, http (with the message from problem details) and invalid-response - and let the UI switch on `kind`.",
            "Decide what there is to parse before parsing: a rejected fetch, a non-2xx status and a 204 never reach `JSON.parse`, and an empty or non-JSON body is a named failure, not a crash.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9457, Problem Details for HTTP APIs (obsoletes RFC 7807): the problem+json media type and its title and detail members",
            "RFC 9110, HTTP Semantics: section 15.3.5 (204 No Content)",
            "TypeScript Handbook: Narrowing (type guards with typeof, Array.isArray and user-defined `value is T` predicates)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one endpoint of a project you work on, save three real responses from the Network panel and write a parser from unknown for it. Then break each fixture in one way (rename a field, change a number to a string, return HTML) and check that your API layer reports a reason you would understand at 10:41 on a Monday."),
    ],
});
