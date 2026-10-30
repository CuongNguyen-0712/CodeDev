// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-adp-2-3",
    title: "Filtering and sorting with a whitelist",
    slug: { _type: "slug", current: "filtering-and-sorting-with-a-whitelist" },
    description:
        "A sort parameter reaches the SQL string, a typo in a filter silently returns every course, and a popular sort scans the whole table. Learn why column names cannot be bound like values, how to parse a query string into a typed spec through whitelists of parameters, filter values and sort fields, how to report every problem in the error contract, and how to keep each allowed sort backed by an index with a unique tiebreaker.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev public API team",
        problem:
            "The database team forwards an alert: the API's database user tried to run DROP TABLE courses, and only failed because it does not own the table. The request came from the public course catalog, GET /v1/courses?sort=..., whose sort parameter is pasted into ORDER BY. The same week a partner reports that ?levle=beginner returns every course instead of an error, and sorting by enrollment count takes two seconds.",
    },

    content: [
        h2("1. The incident: a sort parameter that reached SQL"),
        p("The course catalog on `https://api.codedev.test/v1/courses` lets clients filter by level, search titles and choose a sort order. It was written in an afternoon and has been in production for a year. On Monday the database team forwards three log lines:"),
        code("text", `
2026-10-19 02:14:07 GET /v1/courses?sort=title;DROP%20TABLE%20courses-- 500 traceId=7f3c...
2026-10-19 02:14:07 pg ERROR: must be owner of table courses
2026-10-19 02:14:07 pg STATEMENT: SELECT id, slug, title, level, published_at FROM courses ORDER BY title;DROP TABLE courses-- ASC LIMIT 20`, "API and PostgreSQL logs"),
        p("This is the handler behind it. Nothing in it looks unusual at first glance, which is exactly how it got through review:"),
        code("typescript", `
// courses.repository.ts (before)
import type { Pool } from "pg";

export async function listCourses(pool: Pool, query: Record<string, string | undefined>) {
    const where = query.level ? \`WHERE level = '\${query.level}'\` : "";
    const sort = query.sort ?? "-published_at";
    const direction = sort.startsWith("-") ? "DESC" : "ASC";
    const column = sort.replace(/^-/, "");
    const sql = \`SELECT id, slug, title, level, published_at FROM courses \${where}
                 ORDER BY \${column} \${direction} LIMIT \${query.limit ?? 20}\`;
    return (await pool.query(sql)).rows;
}`, "courses.repository.ts"),
        bullets([
            "**The DROP TABLE.** Everything after `sort=` became part of the SQL text. Because `pool.query(sql)` without parameters sends a plain query string, PostgreSQL accepted two statements separated by `;`. The only thing that stopped the second one was that the API's database user is not the owner of the table.",
            "**The silent typo.** `?levle=beginner` is not `level`, so the handler never looks at it and answers `200` with every course. The partner's app shows advanced courses on its \"For beginners\" screen and nobody gets an error.",
            "**The slow sort.** `?sort=-enrollment_count` works, but there is no index on that column. Every request sorts the whole table, and the endpoint's p95 latency jumped when a partner made it their default.",
        ]),
        p("All three have one cause: the handler treats the query string as trusted text and lets the client decide which parts of the SQL exist. The fix is to treat the query string like any other input at a trust boundary - parse it into a small typed value, using lists of what is allowed, before any SQL is built."),

        h2("2. Values can be bound, names cannot"),
        p("The usual answer to SQL injection is parameter binding: send the SQL text and the values separately, so a value can never change the structure of the statement. That works for `level` and for the search text:"),
        code("typescript", `
await pool.query("SELECT id, title FROM courses WHERE level = $1", [level]);   // safe: $1 is a value`),
        p("It does not work for a sort. `ORDER BY $1` does not mean \"order by the column whose name is in $1\". A placeholder always stands for a **value**, and ordering by a value is ordering by a constant. Table names, column names, `ASC`/`DESC` and keywords are part of the statement's structure; the database has to know them before it can plan the query, so no driver lets you bind them. Quoting helpers such as PostgreSQL's `format('%I', name)` stop the injection, but they still let the client sort by any column that exists - including ones without an index, or ones you never meant to expose, such as an internal score."),
        p("So identifiers need a different defence: an **allow-list** (whitelist). The client chooses from names you published; your code maps each one to a column name that you wrote yourself. Nothing the client typed is ever copied into the SQL text."),
        callout("info", "Two defences, one for each kind of input",
            "Values (a level, the search text, a cursor) go through parameter binding. Identifiers and keywords (the sort column, the direction) go through a whitelist that maps public names to SQL written in your code. Escaping by hand is neither of these and is not a defence."),

        h3("Every sort needs a unique tiebreaker"),
        p("Many courses have the same `enrollmentCount`, and several were published at the same second. When the sort key has ties, the database may return tied rows in any order, and that order can differ between two runs of the same query. On a single page that looks harmless; with pagination (lessons 5 and 6) it skips and repeats rows. The parser therefore always appends `id`, which is unique, as the last key. With `id` last the order is **total**: no two rows compare as equal, so every page boundary is exact."),
        challenge("chal_quiz_adp_231"),

        h2("3. Parse the query string into a spec"),
        p("Instead of passing `req.query` around, the controller turns the raw query string into one typed object, or rejects the request. Everything after that - the repository, the cursor encoder, the cache key - works with the spec and can trust it:"),
        code("typescript", `
type Level = "beginner" | "intermediate" | "advanced" | "expert";
type SortField = "publishedAt" | "title" | "enrollmentCount";

interface CourseQuery {
    filters: { level?: Level[] };
    q: string | null;                                       // trimmed search text
    sort: { field: SortField | "id"; direction: "asc" | "desc" }[];   // id always last
    limit: number;                                          // 1..100, default 20
    cursor: string | null;
}`, "course-query.ts"),
        p("Three whitelists drive the parser: the parameter names the endpoint accepts (`level`, `q`, `sort`, `limit`, `cursor`), the allowed values of enum filters (the four levels), and the public sort fields. Anything else is an error, not something to ignore. `?levle=beginner` now gets a `400` that names `levle` as an unknown parameter, and `?page=2` (a habit from offset pagination) gets the same answer instead of quietly returning page 1."),

        h3("Decide the edge cases, then write them down"),
        p("A query string has more shapes than the happy path. Each of these needs one documented answer, because clients will send all of them:"),
        bullets([
            "**Repeated parameters.** `?level=beginner&level=advanced` - some frameworks keep the first value, some the last, some build an array. Reject the repeat, and accept lists in one parameter (`level=beginner,advanced`), so there is exactly one way to say it.",
            "**Empty values.** `?q=`, `?sort=` and `?level=beginner,,expert` are almost always a client bug (a template with a missing variable). Reject them with `empty_value` rather than treating them as \"no filter\".",
            "**Case.** Names and enum values are case-sensitive: `Level` and `Beginner` are rejected. One spelling per value means one cache key per query and no surprises from database collations.",
            "**Encoding.** Decode with the platform's parser (`URLSearchParams`), not with `split(\"&\")`. It decodes `%20`, and it turns `+` into a space - so `sort=+title` arrives as \" title\" and is rejected as an unknown field, which is why the descending prefix is `-` and ascending has no prefix.",
            "**Every problem at once.** Collect all problems before answering, in a defined order (the order parameters appear in the query). A client that fixes one error per round trip will hate your API.",
        ]),
        p("The answer uses the error contract from lesson 3. The status is `400`: as in the HTTP fundamentals course, a query parameter the server cannot use makes the request itself bad. Each detail names the parameter and a stable issue code that a client can switch on:"),
        code("http", `
GET /v1/courses?levle=beginner&sort=title;DROP%20TABLE%20courses HTTP/1.1

HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The query string is not valid.",
    "details": [
      { "field": "levle", "issue": "unknown_parameter" },
      { "field": "sort", "issue": "unknown_sort_field" }
    ],
    "traceId": "4be1d0c2"
  }
}`, "response"),
        callout("warning", "Do not echo the raw value back",
            "The detail says which parameter is wrong and why, not what the client sent. Copying \"title;DROP TABLE courses\" into the response (or into an HTML error page) turns your error contract into a reflection point for whatever the attacker wrote."),

        h2("4. Build the SQL from the spec"),
        image("sort-whitelist", {
            alt: "Before, in red: the query string sort=title;DROP TABLE courses is pasted into ORDER BY by a template string, and PostgreSQL receives two statements. After, in green: the query string goes through a parser with three whitelists - parameters, level values and sort fields - which either returns a typed spec or a 400 VALIDATION_FAILED response with details. The repository maps the spec's public field names to column names written in code and binds the filter values as $1 and $2. A bottom row lists three rules: identifiers through a whitelist, values through binding, and every allowed sort backed by an index with id as the tiebreaker.",
            caption: "The client chooses from names you published. The SQL text contains only words you wrote; the client's input travels as bound values.",
        }),
        p("The repository never sees the raw query. It maps public field names to columns through a constant map, and everything the client typed - levels, the search text - is passed as a bound value. Tested with node-postgres 8 and PostgreSQL 16 (verify before use):"),
        code("typescript", `
// courses.repository.ts (after)
import type { Pool } from "pg";
import type { CourseQuery } from "./course-query.js";

const SORT_COLUMNS = {
    publishedAt: "published_at",
    title: "title",
    enrollmentCount: "enrollment_count",
    id: "id",
} as const;

export async function listCourses(pool: Pool, query: CourseQuery) {
    const where: string[] = [];
    const values: unknown[] = [];
    if (query.filters.level) {
        values.push(query.filters.level);
        where.push(\`level = ANY($\${values.length})\`);          // the levels are a bound array
    }
    if (query.q !== null) {
        values.push(query.q);
        where.push(\`title ILIKE '%' || $\${values.length} || '%'\`);
    }
    const orderBy = query.sort
        .map((key) => \`\${SORT_COLUMNS[key.field]} \${key.direction === "desc" ? "DESC" : "ASC"}\`)
        .join(", ");
    values.push(query.limit);
    const sql = \`SELECT id, slug, title, level, published_at, enrollment_count FROM courses
                 \${where.length ? "WHERE " + where.join(" AND ") : ""}
                 ORDER BY \${orderBy} LIMIT $\${values.length}\`;
    return (await pool.query(sql, values)).rows;
}`, "courses.repository.ts"),
        p("The only strings interpolated into the SQL are `$1`, `$2`... placeholders and words taken from `SORT_COLUMNS` or the two literals `ASC`/`DESC`. A reviewer can check that in one read, and a grep for `ORDER BY ${` across the codebase finds any repository that does it differently."),

        h3("Index-friendly sorts and limited combinations"),
        p("A whitelist is also a performance contract. Each sort you publish must be one the database can serve from an index, otherwise every request sorts the whole table. For the catalog that means three composite indexes, each ending in the tiebreaker:"),
        code("sql", `
CREATE INDEX courses_published_at_id ON courses (published_at DESC, id DESC);
CREATE INDEX courses_enrollment_count_id ON courses (enrollment_count DESC, id DESC);
CREATE INDEX courses_title_id ON courses (title, id);`, "migration"),
        p("PostgreSQL can read a B-tree index forwards or backwards, so `(published_at DESC, id DESC)` also serves `published_at ASC, id ASC` - but not a mix such as `published_at DESC, id ASC`. That is why the tiebreaker takes the direction of the last key. Every extra key multiplies the combinations you would need to index, so the catalog allows at most two client sort fields. If clients really only need \"newest\", \"most popular\" and \"A to Z\", a single `sort` enum with three preset names is even simpler: three presets, three indexes, nothing to combine."),
        callout("info", "When not to build this",
            "Internal reporting and admin search with ad-hoc filters on many columns do not fit a whitelist of a few fields. Give them a reporting database or a search engine with its own query language instead of growing a generic filter syntax (filter[enrollmentCount][gt]=...) on the public API. And a list that will never have more than a few dozen items can be filtered and sorted by the client."),

        p("Your turn. Write the parser for the catalog: from a raw query string to either the typed spec or the full list of details. The challenge gives the exact rules, including what to do with repeats, empty values and the order of the details."),
        code("typescript", `
parseCourseQuery("level=beginner,intermediate&sort=-publishedAt,title&q=sql&limit=20");
// -> { ok: true, query: { filters: { level: [...] }, sort: [..., { field: "id", ... }], ... } }`),
        challenge("chal_coding_adp_232"),

        h2("5. How to verify"),
        numbered([
            "`curl -i \"https://api.codedev.test/v1/courses?sort=title;DROP%20TABLE%20courses\"` answers `HTTP/1.1 400` with `unknown_sort_field`, and the PostgreSQL log shows no statement for that request at all.",
            "A table-driven unit test feeds the parser the shapes from section 3 - repeats, empty values, wrong case, `+title`, three sort fields, an unknown parameter - and asserts the exact details list, not just \"it failed\".",
            "For every allowed sort, run `EXPLAIN` on the generated SQL and check for an `Index Scan` on the matching index instead of a `Sort` over a `Seq Scan`. Add a sort to the whitelist only together with its index.",
            "Count rejected requests per issue code in your metrics. A spike of `unknown_parameter` for one partner after a release usually means their client sends a parameter you renamed or never supported.",
            "Search the codebase for template literals inside SQL (`ORDER BY ${`, `WHERE ${`) and for `req.query` used outside the controller.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Binding the column name.** `ORDER BY $1` compiles, blocks injection and silently stops sorting (or fails, depending on the driver). Detect it with a test that requests two different sorts and asserts the order of the results changes.",
            "**Ignoring unknown parameters.** Typos and parameters from another API version return unfiltered data with `200`. Detect it with a test that sends `?levle=beginner` and expects `400`, and by watching for `200` responses whose result count is the whole catalog.",
            "**Sorting without a tiebreaker.** Pages repeat or skip items when many rows share a value. Detect it by paging through a fixture where several courses have the same `enrollmentCount` and asserting that every id appears exactly once.",
            "**Whitelisting the field but not the index.** A new sort ships, the endpoint gets slow under load. Detect it with an `EXPLAIN` check in the pull request, or a test that fails when the plan contains a `Sort` node for an allowed sort.",
            "**Stopping at the first error.** The client fixes `limit`, retries, and only then learns `sort` is wrong too. Detect it with a test that sends two problems and expects two details, in order.",
        ]),

        h2("7. Summary"),
        bullets([
            "Values can be bound; identifiers cannot. Sort columns and directions come from a whitelist that maps public names to SQL you wrote, never from the client's text.",
            "Parse the query string at the edge into a typed spec: reject unknown parameters, repeats, empty values and wrong case, and report every problem in the error contract.",
            "Publish only sorts that an index can serve, keep the combinations few, and always end the order with a unique tiebreaker such as id.",
        ]),

        callout("info", "Practice on your own (not graded)",
            "Write the OpenAPI description of GET /v1/courses for the lab \"Production-ready Courses API\": declare each query parameter with its type, the level enum, the sort pattern and limit bounds, and the 400 response that uses the shared error schema from lesson 4. Then run EXPLAIN on each allowed sort against a table with 100,000 generated courses and note which index each one uses."),

        h2("Sources"),
        bullets([
            "OWASP Cheat Sheet Series: SQL Injection Prevention Cheat Sheet (parameterized queries, and allow-list input validation for table and column names) - https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
            "PostgreSQL documentation: Indexes and ORDER BY - https://www.postgresql.org/docs/current/indexes-ordering.html",
            "MDN Web Docs: URLSearchParams - https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams",
        ]),
    ],
});
