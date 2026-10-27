// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-2-2",
    title: "Spot the AI mistake: offset pagination that skips & repeats rows",
    slug: { _type: "slug", current: "spot-the-ai-mistake-offset-pagination" },
    description:
        "The mobile team asked an AI assistant to add pagination to GET /courses. It returned an opaque next_cursor exactly as asked, its tests passed, and it was merged. Then learners started seeing the same course twice while scrolling, and courses from a batch import never appeared. Learn to read what a cursor really contains, why OFFSET over a non-unique order fails in two different ways (rows published above the reader, and ties returned in a different order), why the AI's tests could not see it, how to fix it with keyset pagination while keeping the response contract, and how to review generated pagination code before it ships.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev API (catalog)",
        problem:
            "Since mobile app 4.2 shipped infinite scroll on the catalog, support has collected 57 tickets: \"Docker Basics shows up twice in a row\", \"I scrolled the whole catalog and the new Vietnamese courses are not there\". The endpoint behind it, GET /courses on https://api.codedev.test with ?size= and ?cursor=, was written with an AI coding assistant two weeks ago, reviewed by reading the diff, and merged because its endpoint tests passed. The tickets cluster in the evening, when instructors publish, and on 20 October, after a batch import published 40 courses in the same second.",
    },

    content: [
        h2("1. The incident: the cursor that was a page number"),
        p("The mobile team's request to the assistant was precise about the contract and silent about the implementation:"),
        code("text", `
Add pagination to GET /courses. Response: { data, next_cursor }; the app sends
next_cursor back as ?cursor= and stops when it is null. ?size= is optional:
default 20, at most 100. Answer 400 with { code } for a bad size or cursor.
Newest courses first.`, "prompt sent to the AI assistant"),
        p("This is the service method it produced, lightly shortened. It has validation, an opaque cursor, a comment explaining why, and the response shape the app asked for:"),
        code("typescript", `
// courses.service.ts (as merged)
async list(query: ListCoursesDto): Promise<CoursePage> {
  const size = query.size ?? 20;                 // ValidationPipe: integer 1..100
  let page = 1;
  if (query.cursor !== undefined) {
    page = this.decodeCursor(query.cursor);      // throws 400 invalid_cursor
  }
  const rows = await this.db.query(
    \`SELECT id, title, published_at FROM catalog.courses
      WHERE status = 'published'
      ORDER BY published_at DESC
      LIMIT $1 + 1 OFFSET ($2 - 1) * $1\`,
    [size, page],
  );
  return {
    data: rows.slice(0, size),
    // Opaque cursor, so clients cannot depend on page numbers.
    next_cursor: rows.length > size ? this.encodeCursor(page + 1) : null,
  };
}

private encodeCursor(page: number): string {
  return Buffer.from(JSON.stringify({ page })).toString("base64url");
}`, "courses.service.ts"),
        p("The pull request also added endpoint tests: seed 8 courses published one minute apart, walk the list with `size=3`, expect ids 8-7-6, 5-4-3, 2-1 and a null cursor at the end. They passed. The reviewer read the diff, saw the word \"cursor\" and an opaque value in the response, and approved."),

        h2("2. Reproduce it and read the evidence"),
        p("Start with the cursor itself. It is opaque to the app, not to you: decode the one from a ticket."),
        code("bash", `
$ node -e "console.log(Buffer.from('eyJwYWdlIjoyfQ', 'base64url').toString())"
{"page":2}`, "terminal"),
        p("That is a page number. Whatever the response shape says, this endpoint pages with `OFFSET`, and every weakness of offset pagination from lesson 2.1 is back. The API log of one ticket shows the first one:"),
        code("text", `
19:42:05  GET  /courses?size=20                         200  data[19] = 377 Docker Basics
19:42:20  POST /courses/390/publish  (instructor)       200  published_at = 19:42:20
19:42:31  GET  /courses?size=20&cursor=eyJwYWdlIjoyfQ   200  data[0]  = 377 Docker Basics`, "api.log"),
        p("Course 390 became the newest course between the two requests, so every other course moved down one position. `OFFSET 20` now skips the first 19 courses of page 1 plus course 390, and page 2 starts with the course that ended page 1. The learner never sees course 390 in this scroll either: it is above the place they already passed."),
        p("The second symptom needs no writes at all. Run page 1 and page 2 of a walk with `size=2` over the six courses of the batch import, which share one `published_at`, and print the ids:"),
        code("text", `
GET /courses?size=2                      -> [27, 21]
GET /courses?size=2&cursor=eyJwYWdlIjoyfQ -> [25, 24]
GET /courses?size=2&cursor=eyJwYWdlIjozfQ -> [24, 25]
GET /courses?size=2&cursor=eyJwYWdlIjo0fQ -> [21, 20]
=> 21, 24 and 25 twice; 22, 23 and 26 never`, "the batch import, scrolled two at a time"),
        p("The query orders by `published_at` only. For rows with equal `published_at`, any order is a correct answer, and PostgreSQL returns them in whatever order the plan produces: the physical order of the table, the order of parallel workers, the order a sort happened to leave them in. Each `OFFSET` query cuts its own version of the tie group, and the pages do not fit together."),

        h2("3. Core idea: why the assistant's code looks right and is not"),
        p("The assistant followed the request to the letter: the response has `data` and `next_cursor`, the cursor is opaque, the size is validated. What it did not do is the part the request did not spell out: make the cursor a **position** in a **total order**. Those are two separate failures, and each needs its own fix:"),
        numbered([
            "**A count instead of a position.** `OFFSET` means \"skip N rows of the list as it is now\". Any insert or delete above the reader between two requests changes which rows those are. Only a cursor that holds the last row's sort key, `(published_at, id)`, and a query that continues after that key, is immune to it.",
            "**A non-unique order.** `ORDER BY published_at` leaves ties unordered, so even two identical queries can disagree. Adding a unique last column, `id`, makes the order total and the boundary between pages stable.",
        ]),
        p("A unique order without a keyset still shifts on every insert. A keyset on `published_at` alone still loses or repeats tied rows at the boundary. The fix is both: `ORDER BY published_at DESC, id DESC` and `WHERE (published_at, id) < ($1, $2)`."),
        h3("Why the tests passed"),
        p("The tests the assistant wrote describe a table that never changes and has no ties: 8 courses, each in its own minute. On that data offset pagination and keyset pagination return exactly the same pages, so the tests cannot tell them apart. That is a common pattern in generated code: the tests are produced from the same understanding as the code, and they check the cases the author thought of. They prove the shape of the response, not its behaviour under the conditions of production, where instructors publish at any moment and imports create ties."),
        callout("warning", "A base64 value is not a cursor design",
            "Encoding a page number, an offset or a row index in base64 hides it from clients but changes nothing about how the server pages. When you review a cursor, decode it. If it does not contain the sort key of the last row, it is offset pagination with a different name."),
        challenge("chal_quiz_adp_221"),

        h2("4. The fix, on another list of the same API"),
        p("The instructor dashboard has the same pattern: GET /courses/:id/submissions lists the latest submissions newest first, and the grading team sees duplicates while learners submit. Its fix shows every step you need, on a different table:"),
        code("sql", `
-- index that serves the order and the comparison
CREATE INDEX submissions_course_keyset
    ON learning.submissions (course_id, created_at DESC, id DESC);

-- next page: $2, $3 = (created_at, id) of the last row the client received
SELECT id, user_id, status, created_at
  FROM learning.submissions
 WHERE course_id = $1
   AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3))
 ORDER BY created_at DESC, id DESC
 LIMIT $4;                        -- page size + 1`, "keyset query for submissions"),
        code("typescript", `
// submissions-cursor.ts - version 2 of the format: a position, not a page
type Position = { v: 2; k: [createdAt: string, id: number] };

export function decodeSubmissionCursor(text: string): Position | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const raw = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    if (raw?.v !== 2 || !Array.isArray(raw.k) || raw.k.length !== 2) return null;  // {"page":2} ends here
    const [createdAt, id] = raw.k;
    if (typeof createdAt !== "string" || !Number.isSafeInteger(id)) return null;
    return { v: 2, k: [createdAt, id] };
  } catch {
    return null;
  }
}`, "submissions-cursor.ts"),
        p("Three details keep the contract intact for the client:"),
        bullets([
            "**Same response shape.** `{ data, next_cursor }` and the same 400 codes. The app does not know or care what is inside the cursor, which is exactly what \"opaque\" promised.",
            "**Old cursors fail loudly.** After the deploy, apps still hold cursors like `{\"page\":2}`. The new decoder rejects them with 400 `invalid_cursor`, and the app's existing error handling reloads the list from the start. Silently reading them as \"page 2\" or as an empty position would show the wrong rows with a 200.",
            "**Limit + 1.** Keep reading one extra row to decide whether `next_cursor` is null, as in lesson 2.1.",
        ]),

        h2("5. Reviewing AI-generated pagination"),
        p("Pagination is a favourite of coding assistants: it is short, it looks finished, and simple fixtures cannot show what is wrong with it. Read every generated list endpoint with these questions:"),
        numbered([
            "**What does the cursor contain?** Decode it. A page number, an offset or a row index means offset pagination. The cursor should hold the sort key of the last returned row, plus a version.",
            "**Does the ORDER BY end with a unique column?** If not, ask what happens to rows with equal values. Look for `ORDER BY created_at`, `ORDER BY published_at`, `ORDER BY score` without `, id`.",
            "**Do the WHERE comparison and the ORDER BY match column by column?** Same columns, same directions, `<` for descending and `>` for ascending.",
            "**What do the tests change between requests?** If nothing is inserted between two page requests and no two rows share a sort value, the tests cannot fail on this bug. Ask for those two tests, or write them before approving.",
            "**What happens to cursors issued by the previous version?** A format change needs a version field and a 400 for unreadable cursors.",
        ]),
        p("You will review the assistant's code yourself in the challenge. The starter contains its `listCourses` with the SQL it runs as a comment, over an in-memory table. Like PostgreSQL, the fake table promises no row order: every second request scans it backwards. The public tests are the assistant's own scenarios and they pass; the hidden tests publish courses between requests and use courses with the same publish time."),
        challenge("chal_coding_adp_222"),

        h2("6. How to verify the fix"),
        bullets([
            "**A walk test with writes.** Seed courses with a group of ties, walk the whole list with a small page size, publish a course between every two requests, and assert that every course that existed at the start came back exactly once.",
            "**A tie test without writes.** Seed 6 courses with one `published_at` and walk them two at a time. To make the test meaningful in PostgreSQL, insert the tied rows in a shuffled order, or run the walk with `SET enable_indexscan = off` once, so the database is not accidentally returning them in id order.",
            "**An old-cursor test.** Send `eyJwYWdlIjoyfQ` (the old `{\"page\":2}`) after the deploy: 400 `invalid_cursor`.",
            "**Production signal.** Log the decoded cursor version per request for a week after the deploy; the share of version-1 cursors should drop to zero as apps restart their lists.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Fixing only the order.** Adding `, id DESC` to the ORDER BY and keeping OFFSET. Spot it: ties are stable now, but the walk test with an insert between pages still shows a duplicate.",
            "**Fixing only the paging.** A keyset on `published_at` alone. Spot it: the tie test loses rows (with `<`) or repeats them (with `<=`).",
            "**Accepting old cursors silently.** The new decoder reads `{\"page\":2}` as a missing position and returns page 1 again, with 200. Spot it: no test sends a cursor from the previous version.",
            "**Approving on the shape of the response.** `next_cursor` is present and opaque, so the review stops there. Spot it: nobody decoded a cursor in the review, and the tests never write between requests.",
        ]),

        h2("8. Summary"),
        numbered([
            "A cursor that encodes a page number is offset pagination in disguise: rows published above the reader shift every later page, and rows with equal sort values come back in a different order on each query.",
            "The fix needs both halves: a total order (sort key plus id) and a keyset comparison on the full key. Keep the response contract, version the cursor and reject cursors you cannot read with 400.",
            "Review generated pagination by decoding its cursor, checking the ORDER BY for a unique last column, and asking for tests that insert between requests and use ties: static fixtures with unique values cannot fail on this bug.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: LIMIT and OFFSET - https://www.postgresql.org/docs/current/queries-limit.html",
            "PostgreSQL documentation: Sorting Rows (ORDER BY) - https://www.postgresql.org/docs/current/queries-order.html",
            "PostgreSQL documentation: Row Constructor Comparison - https://www.postgresql.org/docs/current/functions-comparisons.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Ask an AI assistant to add pagination to a list endpoint of your own project, with the same kind of short request as in section 1. Decode the cursor it produces, check its ORDER BY, and write the two tests from section 6 against its code before you read it in detail. Then send the assistant the failing tests and compare its second answer with the fix in section 4."),
    ],
});
