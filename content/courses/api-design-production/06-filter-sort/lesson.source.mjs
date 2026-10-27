// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-2-3",
    title: "Filtering & sorting safely with an allowlist",
    slug: { _type: "slug", current: "filtering-sorting-safely-allowlist" },
    description:
        "An instructor sent GET /courses/42/learners?sort=password_hash and got the learners of the course ordered by their password hash. A shared list helper put the sort parameter into ORDER BY after a regular-expression check that only looked at the characters. Learn the difference between values (placeholders) and identifiers (an allowlist), how to parse a query string into a typed query plan that is the only thing allowed to reach SQL, how to coerce and limit filter values, decode percent-encoding and + correctly, report every problem in one deterministic 400, and when not to offer a filter at all.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (catalog and instructor tools)",
        problem:
            "A security report reached the CodeDev team on a Friday: \"As an instructor of course 42, GET https://api.codedev.test/courses/42/learners?sort=password_hash returns my learners ordered by their password hash. With sort=email I can also sort by a field the page never shows.\" The endpoint uses the same list helper as the public GET /courses. The same week, the API logged 500 errors for ?price[lte]=200k and ?level=beginner&level=advanced, and the search box could not find the C++ courses. The team decides that no list endpoint may pass request text into SQL any more.",
    },

    content: [
        h2("1. The incident: a sort parameter that knew your columns"),
        p("The helper was written to save time: every list endpoint calls it with a table name and the query string, and gets filtering and sorting for free. Its author knew about SQL injection, so the sort column is checked before it is placed in the SQL text:"),
        code("typescript", `
// common/list-query.helper.ts (before)
export async function listRows(db: Db, table: string, scope: Scope, query: Record<string, string>) {
  const sort = query.sort ?? "-created_at";
  const desc = sort.startsWith("-");
  const column = desc ? sort.slice(1) : sort;
  if (!/^[a-z_]+$/.test(column)) throw new BadRequestException("invalid sort");   // "no injection"
  const { rows } = await db.query(
    \`SELECT * FROM \${table} WHERE \${scope.column} = $1 ORDER BY \${column} \${desc ? "DESC" : "ASC"} LIMIT 50\`,
    [scope.value],
  );
  return rows;
}`, "list-query.helper.ts"),
        p("The check stops `sort=title;DROP TABLE x` and `sort=(SELECT ...)`. It does not stop `sort=password_hash`, because that is a perfectly well-formed column name. GET /courses/42/learners joins the learners with `identity.users`, so every column of that table can be named in `sort`, including the hash and the email the instructor page deliberately hides."),

        h2("2. Reproduce it and read the evidence"),
        p("The reporter's request and the statement PostgreSQL received, from the slow-query log with `log_min_duration_statement = 0` on staging:"),
        code("text", `
GET /courses/42/learners?sort=password_hash  -> 200, 50 learners
  [{"user_id":918,"display_name":"Linh",...}, {"user_id":77,...}, ...]

LOG:  statement: SELECT * FROM learning.course_learners_v WHERE course_id = $1
      ORDER BY password_hash ASC LIMIT 50
DETAIL:  parameters: $1 = '42'`, "staging logs"),
        p("Even without the hash in the response body, ordering by it is a leak: with a few accounts of their own, an attacker can bisect where other hashes fall, and confirm which columns exist. `SELECT *` makes it worse, but the core mistake is that the request decides which identifier appears in the SQL. The 500s of the same week have a related cause, the query string is used without a parser that knows what each parameter may be:"),
        code("text", `
GET /courses?price[lte]=200k
  ERROR:  invalid input syntax for type integer: "200k"          -> 500
GET /courses?level=beginner&level=advanced
  TypeError: query.level.split is not a function (an array)        -> 500
GET /courses?q=c++
  searched for "c" (the + signs arrived as spaces, then trimmed)   -> 200, no C++ courses`, "api.log, same week"),
        p("A bad value from the client should be a 400 that says what is wrong, not a 500 from the database or from JavaScript. And the C++ search shows that even \"just text\" needs a correct decoding step."),

        h2("3. Core idea: values go in placeholders, everything else comes from your list"),
        p("SQL has two kinds of input, and they need two different defences:"),
        bullets([
            "**Values** - the 200000 in `price <= 200000`, the 'react' in a search. These go into placeholders (`$1`, `$2`). The driver sends them separately from the SQL text, so they cannot change the statement. Placeholders are the whole answer for values.",
            "**Identifiers and keywords** - column names, `ASC`/`DESC`, operators such as `<=`. Placeholders cannot hold them: `ORDER BY $1` sorts by a constant, not by a column. The only safe source for them is a list you wrote in code. The request selects an entry from the list; the SQL text comes from the entry.",
        ]),
        p("A regular expression on the identifier checks its shape, not whether the client may use it. An allowlist answers the real question: \"may this endpoint filter or sort by this field, with this operator?\" It also documents the contract: the fields in the list are the ones you promise to keep indexed and supported."),
        h3("Parse into a plan, then build SQL from the plan"),
        p("Instead of validating the query string and then using it, parse it once into a typed **query plan**: filters with a known field, a known operator and a value already converted to the right type, a sort list of known fields, the search text. The repository receives only the plan. If a value is not in the plan, it cannot reach the SQL, and the only code that touches raw request text is one small, tested parser."),
        code("json", `
{
  "filters": [
    { "field": "level", "op": "in",  "value": ["beginner", "intermediate"] },
    { "field": "price", "op": "lte", "value": 200000 }
  ],
  "sort": [{ "field": "rating", "dir": "desc" }, { "field": "title", "dir": "asc" }, { "field": "id", "dir": "asc" }],
  "q": "react"
}`, "plan for ?level=beginner,intermediate&price[lte]=200000&sort=-rating,title&q=react"),
        p("The plan ends with `id` as a tie-break, for the reason of lesson 2.1: a cursor needs a total order."),
        h3("Limits are part of safety"),
        p("An allowlisted request can still be expensive. `?category=` with 5,000 values builds a 5,000-item `IN` list; sorting by a column without an index sorts the whole table; a 30 KB search string goes into a `LIKE` or a full-text query. Cap the number of values per filter, the number of sort fields and the length of the search text, and only allow sorting by fields that have an index for it."),
        h3("When not to"),
        bullets([
            "**Do not build a query language.** A generic `?filter[any_field][any_op]=` API turns every column into a promise to clients and every combination into a possible slow query. Offer the filters the screens need, add more when someone asks with a reason.",
            "**Do not share one allowlist between endpoints.** The public catalog and the instructor's learner list expose different data to different people. Each endpoint gets its own list, next to its controller.",
            "**Do not accept a sort or filter object from the body and hand it to the ORM.** `orderBy: dto.sort` in Prisma or `order: query.order` in TypeORM is the same mistake as string interpolation, with a nicer syntax.",
        ]),
        challenge("chal_quiz_adp_231"),

        h2("4. Worked example: the learner list of an instructor"),
        p("Here is the instructor endpoint from the incident, rebuilt with an allowlist. The course catalog uses the same structure with its own fields; you will write its parser in the challenge."),
        code("typescript", `
// learners/learners.list.ts - what GET /courses/:id/learners accepts, and nothing else
export const LEARNER_FILTERS = {
  status:   { type: "enum", values: ["active", "completed", "dropped"], ops: ["eq", "in"], column: "e.status" },
  progress: { type: "integer", min: 0, max: 100, ops: ["gte", "lte"], column: "e.progress_percent" },
} as const;

export const LEARNER_SORTS = {
  enrolled_at:  "e.enrolled_at",    // index (course_id, enrolled_at, id)
  progress:     "e.progress_percent",
  display_name: "u.display_name",
} as const;

const SQL_OP = { eq: "=", gte: ">=", lte: "<=" } as const;`, "learners.list.ts"),
        p("The repository builds SQL only from the plan. Every identifier comes from `LEARNER_FILTERS` or `LEARNER_SORTS`, every value goes into the parameter array:"),
        code("typescript", `
// learners.repository.ts
buildQuery(courseId: number, plan: LearnerPlan, limit: number) {
  const params: unknown[] = [courseId];
  const where = ["e.course_id = $1"];
  for (const f of plan.filters) {
    const column = LEARNER_FILTERS[f.field].column;           // from the allowlist, never from the request
    if (f.op === "in") {
      params.push(f.value);                                   // an array: = ANY($n)
      where.push(\`\${column} = ANY($\${params.length})\`);
    } else {
      params.push(f.value);
      where.push(\`\${column} \${SQL_OP[f.op]} $\${params.length}\`);
    }
  }
  const orderBy = plan.sort
    .map((s) => \`\${s.field === "id" ? "e.user_id" : LEARNER_SORTS[s.field]} \${s.dir === "desc" ? "DESC" : "ASC"}\`)
    .join(", ");
  params.push(limit + 1);
  return {
    text: \`SELECT e.user_id, u.display_name, e.status, e.progress_percent, e.enrolled_at
             FROM learning.enrollments e JOIN identity.users u ON u.id = e.user_id
            WHERE \${where.join(" AND ")}
            ORDER BY \${orderBy}
            LIMIT $\${params.length}\`,
    params,
  };
}`, "learners.repository.ts"),
        p("Note the explicit column list instead of `SELECT *`: what the endpoint returns is also an allowlist. For `?status=active,completed&progress[gte]=50&sort=-progress` the statement is `... WHERE e.course_id = $1 AND e.status = ANY($2) AND e.progress_percent >= $3 ORDER BY e.progress_percent DESC, e.user_id DESC LIMIT $4` with the parameters `[42, [\"active\",\"completed\"], 50, 21]`. No character of the request is in the SQL text."),
        h3("Decoding the query string correctly"),
        p("The parser starts from the raw query string, so decoding is its job too. In query strings, `+` means a space (the `application/x-www-form-urlencoded` rules that browsers and `URLSearchParams` use), and a real plus is `%2B`. Replace `+` with a space first, then percent-decode each name and value once. `decodeURIComponent` throws a `URIError` on a broken sequence such as `%E0%A4%A`; that is a client error, so turn it into a 400 that quotes the parameter. Decoding twice is a bug of its own: `%2525` would become `%25` and then `%`."),
        callout("info", "Which parser does your framework use?",
            "Frameworks do not agree on how to read `price[lte]=5` or a repeated `level=`. Express 4 used the qs library by default, which builds nested objects and arrays from brackets and repeated keys; Express 5 defaults to a simpler parser. The same URL can therefore reach a NestJS handler as a string, an array or an object depending on the version and settings. Read the raw query string in one place (a pipe or a custom decorator) and parse it with your own rules, so the shape does not depend on a setting."),
        h3("One 400 that lists every problem"),
        p("Check every parameter and report all the problems at once, in the order of the query string, with stable messages. Clients can fix the request in one round trip, and tests can compare the messages exactly. With the error contract of lesson 1.3 that looks like this:"),
        code("json", `
{
  "code": "invalid_query",
  "message": "The query string has 2 problems.",
  "details": [
    "cannot sort by \\"password_hash\\"",
    "unknown filter \\"email\\""
  ],
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736"
}`, "400 response for ?sort=password_hash&email=a@b.test"),

        h2("5. How to verify it"),
        bullets([
            "**Table-driven parser tests.** One row per rule: the docs example, every type with a good and a bad value, every operator that is not allowed, `+` and `%2B`, a malformed sequence, a duplicate parameter, the caps. The parser is a pure function, so these tests run in milliseconds.",
            "**The incident as an e2e test.** `GET /courses/42/learners?sort=password_hash` and `?sort=email` must be 400, and the response must not depend on the data.",
            "**No request text in SQL.** Log the generated statements in a test run that sends hostile query strings (`sort=title;--`, `price[lte]=1)OR(1=1`, unicode, 60 KB values) and assert that each statement text is one of a small set of known shapes.",
            "**Indexes for sortable fields.** For each entry of the sort allowlist, `EXPLAIN` the first page and check that it uses an index instead of sorting all rows.",
        ]),
        code("typescript", `
it.each([
  ["sort=password_hash",          'cannot sort by "password_hash"'],
  ["progress[gte]=fifty",         'invalid value "fifty" for "progress": expected a whole number from 0 to 100'],
  ["status[gte]=active",          'operator "gte" is not allowed on "status"'],
])("rejects %s", (qs, message) => {
  expect(parseLearnerQuery(qs)).toEqual({ status: 400, errors: [message] });
});`, "learners.list.spec.ts"),

        h2("6. Common mistakes"),
        bullets([
            "**A regex instead of an allowlist.** It blocks syntax, not access. Spot it: a `test(column)` check followed by string interpolation of the same value into SQL.",
            "**A placeholder for an identifier.** `ORDER BY $1` runs, returns 200 and sorts by nothing. Spot it: sorting \"works\" for every value, and the order never changes.",
            "**One list for every endpoint, or the table's columns as the list.** The learner list inherits `password_hash` from the users table. Spot it: the allowlist is generated from an entity or a table definition.",
            "**Wrong or double decoding.** `+` left as a plus, or a value decoded twice. Spot it: searches for \"c++\" or \"node js\" behave differently from the web app's search box; values containing `%25` change meaning.",
            "**No caps.** Spot it: no test sends 5,000 values, 400 sort fields or a 30 KB search string; the slow-query log shows giant `IN` lists.",
        ]),
        p("Now write the parser for the public catalog. The starter gives you the allowlist of GET /courses (fields, types, operators, the error text each type expects, the sortable fields and the caps). Your function returns the plan or every error, and the tests include the incident, encoded and malformed query strings, and a 60 KB query."),
        challenge("chal_coding_adp_232"),

        h2("7. Summary"),
        numbered([
            "Values go into placeholders; column names, directions and operators cannot, so they must come from an allowlist per endpoint. A regex on an identifier checks its shape, not whether the client may use it.",
            "Parse the raw query string once into a typed plan (known fields, known operators, converted values, a sort ending with id) and build SQL only from the plan; decode + as a space and percent-escapes once, and turn malformed input into a 400.",
            "Cap list lengths, sort fields and search length, sort only by indexed fields, and answer one 400 that lists every problem in a stable order.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP SQL Injection Prevention Cheat Sheet (allow-list input validation for table and column names and sort order) - https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
            "WHATWG URL Standard: application/x-www-form-urlencoded parsing (+ as space) - https://url.spec.whatwg.org/#application/x-www-form-urlencoded",
            "RFC 3986, section 2.1: Percent-Encoding - https://www.rfc-editor.org/rfc/rfc3986",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Search your API for SQL built with template strings or string concatenation, and for ORM calls whose orderBy or where comes from the request. For each list endpoint, write its allowlist as a table (field, type, operators, index) next to its controller, then try ?sort= with a column that exists but is not in the table. If it returns 200, you have found this lesson's incident in your own code."),
    ],
});
