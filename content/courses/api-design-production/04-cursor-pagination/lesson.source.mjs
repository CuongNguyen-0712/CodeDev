// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-2-1",
    title: "Cursor pagination with a stable order",
    slug: { _type: "slug", current: "cursor-pagination-stable-order" },
    description:
        "The nightly search sync walked GET /courses page by page and ended with 41 published courses missing, right after a batch import published 40 courses in the same second. Learn why a page number describes a count of rows and not a place in the list, how keyset pagination with a total order (sort key plus id) continues exactly where the last page stopped, how to build an opaque, versioned cursor that the server validates, how to detect the last page with limit + 1, when offset pagination is still the right choice, and how to prove the result with a test that writes between requests.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (catalog)",
        problem:
            "Every night the search service of https://app.codedev.test copies the catalog by calling GET /courses?page=1&size=100 on https://api.codedev.test, then page=2, and so on until a page comes back short. On 20 October the search index held 1,203 courses while catalog.courses had 1,244 published rows: 41 courses were missing, among them 23 of the 40 Vietnamese courses of that morning's batch import, although the sync log says it read 1,244 rows. Learners searching for \"lập trình\" found nothing. The search team asks for a list endpoint they can walk from start to end without losing or repeating rows, while instructors keep publishing.",
    },

    content: [
        h2("1. The incident: a sync that loses rows it was looking at"),
        p("The catalog endpoint was written early, when the only client was the web catalog page. It pages with a page number, which the service turns into an `OFFSET`:"),
        code("typescript", `
// courses.repository.ts (before)
async listPage(page: number, size: number): Promise<CourseRow[]> {
  const { rows } = await this.db.query(
    \`SELECT id, title, published_at
       FROM catalog.courses
      WHERE status = 'published'
      ORDER BY published_at DESC
      LIMIT $1 OFFSET $2\`,
    [size, (page - 1) * size],
  );
  return rows;
}`, "courses.repository.ts (before)"),
        p("The search sync uses it the obvious way: request page 1, 2, 3, ... and stop at the first page with fewer than 100 courses. Nothing in that code is wrong on a quiet table. The catalog is not quiet: instructors publish during the night, and on 20 October a batch import published 40 courses with the same `published_at`, to the second."),

        h2("2. Reproduce it and read the evidence"),
        p("The sync logs one line per page. Two things stand out: a request that started after an instructor published, and the pages around the batch import."),
        code("text", `
02:00:01  GET /courses?page=1&size=100   200  100 rows  first=1243 last=1144
02:00:02  GET /courses?page=2&size=100   200  100 rows  first=1144 last=1045   <- 1144 again
02:00:03  GET /courses?page=3&size=100   200  100 rows  first=1045 last=946    <- 1045 again
...
02:00:09  GET /courses?page=9&size=100   200  100 rows  first=446  last=318
02:00:10  GET /courses?page=10&size=100  200  100 rows  first=355  last=262
...
02:00:13  GET /courses?page=13&size=100  200   44 rows  -> done: 1,244 rows read, 1,203 distinct`, "search-sync.log, 20 October"),
        p("The API log explains the first symptom: between page 1 and page 2, an instructor published course 1244, which became row 1 of the list and pushed every other row down by one. `OFFSET 100` then skipped 99 old rows plus the new one, and page 2 started with the last course of page 1. The new course itself was never read, because it sits above the place the sync had already passed."),
        p("The second symptom is quieter. Pages 9 and 10 cut through the 40 courses of the batch import, which all share `2026-10-20 07:00:00+00`. Run the same two queries by hand and compare the ids of the tied rows:"),
        code("sql", `
SELECT id FROM catalog.courses WHERE status = 'published'
ORDER BY published_at DESC LIMIT 100 OFFSET 800;   -- page 9: ..., 431, 446, 318
SELECT id FROM catalog.courses WHERE status = 'published'
ORDER BY published_at DESC LIMIT 100 OFFSET 900;   -- page 10: 355, 318, 446, ...`, "psql"),
        p("`ORDER BY published_at` does not say anything about the order of rows with the same `published_at`. PostgreSQL is free to return them in any order, and it does change between plans (an index scan, a sort, parallel workers). When the order of a group of ties changes between page 9 and page 10, some of those rows are returned twice and others never. Neither symptom needs a bug in the code you can see. Both come from one design choice: **a page number is a count of rows, not a place in the list.**"),

        h2("3. Core idea: remember where you are, not how far you came"),
        p("Keyset pagination (often called cursor pagination) replaces \"skip N rows\" with \"continue after this row\". The response carries the position of the last row it returned, and the next request asks for the rows that come after that position in the same order. Two conditions make this exact:"),
        numbered([
            "**A total order.** Every row has a different position, so \"after this row\" has one meaning. A timestamp alone is not enough: imports, seeds and coarse clocks create ties. Add a unique column as the last sort key: `ORDER BY published_at DESC, id DESC`.",
            "**A comparison on the full key.** The next page is `WHERE (published_at, id) < ($1, $2)`, a row comparison that PostgreSQL evaluates left to right: an older `published_at`, or the same `published_at` and a smaller `id`. It must use the same columns and directions as the `ORDER BY`.",
        ]),
        p("What you get: a row inserted above the position does not move the position, so nothing repeats. A row inserted below it is simply read when the walk gets there. Ties are cut by `id`, so the boundary between two pages is the same on every request. And the database can jump to the position with an index instead of reading and throwing away all the rows before it, which `OFFSET 50000` has to do."),
        code("sql", `
CREATE INDEX courses_published_keyset
    ON catalog.courses (published_at DESC, id DESC)
 WHERE status = 'published';

-- first page
SELECT id, title, published_at FROM catalog.courses
 WHERE status = 'published'
 ORDER BY published_at DESC, id DESC
 LIMIT $1;

-- next pages: $1, $2 = position of the last row of the previous page
SELECT id, title, published_at FROM catalog.courses
 WHERE status = 'published' AND (published_at, id) < ($1, $2)
 ORDER BY published_at DESC, id DESC
 LIMIT $3;`, "keyset queries"),
        p("For the opposite direction (oldest first), flip every part together: `ORDER BY published_at ASC, id ASC` and `(published_at, id) > ($1, $2)`. The row comparison only works when all sort keys go in the same direction. A mixed order such as \"rating descending, then title ascending\" needs the expanded form `rating < $1 OR (rating = $1 AND title > $2) OR ...`; lesson 2.3 builds the sort list that feeds it."),
        h3("When not to use a cursor"),
        bullets([
            "**The user really jumps to page 37.** An admin table with numbered pages and a total count is an offset feature. Keep offset pagination there, with a cap on the page number and a total order, and accept that rows can shift while someone clicks.",
            "**The list is small and bounded.** The 12 lessons of a course fit in one response. Pagination you do not need is a contract you must keep forever.",
            "**The client needs a stable snapshot.** A cursor walks a live table: rows published after the walk started and placed above the position are not returned. That is correct for an infinite scroll. If an export must reflect one instant, give it a snapshot (an export job, or a filter such as `published_at <= <walk start>`).",
        ]),
        challenge("chal_quiz_adp_211"),

        h2("4. Worked example: the cursor contract of GET /courses"),
        p("The position travels to the client and comes back. Treat it as part of the contract, and design it so you can change it later:"),
        bullets([
            "**Opaque.** Clients must not build or edit cursors, so do not give them something that looks editable. Encode the position as base64url JSON. That is not security (anyone can decode it) but it makes the intent clear, and the server validates every cursor anyway.",
            "**Versioned.** `v: 1` lets you change the format later, for example when the default sort changes, and reject old cursors on purpose instead of misreading them.",
            "**Bound to the query.** A cursor made for newest-first means nothing for oldest-first. Store the order (and, in a real API, the filters) in the cursor and reject a mismatch with 400.",
            "**Validated like any input.** It came from the network. Check the version, the shape and every type before a value reaches SQL, and answer 400 with the error contract from lesson 1.3 when it is wrong.",
        ]),
        code("typescript", `
// pagination/cursor.ts
type Order = "asc" | "desc";
export type CoursePosition = { v: 1; o: Order; k: [publishedAt: string, id: number] };

export function encodeCursor(pos: CoursePosition): string {
  return Buffer.from(JSON.stringify({ v: pos.v, o: pos.o, k: pos.k })).toString("base64url");
}

const ISO = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$/;

export function decodeCursor(text: string): CoursePosition | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;          // base64url alphabet only
  try {
    const raw = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    const [ts, id] = Array.isArray(raw?.k) && raw.k.length === 2 ? raw.k : [];
    if (raw.v !== 1 || (raw.o !== "asc" && raw.o !== "desc")) return null;
    if (typeof ts !== "string" || !ISO.test(ts)) return null;
    if (!Number.isSafeInteger(id) || id < 1) return null;
    return { v: 1, o: raw.o, k: [ts, id] };
  } catch {
    return null;                                              // not base64url JSON
  }
}`, "pagination/cursor.ts"),
        p("The service asks for one row more than the page size. If that extra row arrives, there is a next page, and its cursor is the position of the last row the client actually receives. A full page alone proves nothing: when the total is a multiple of the limit, the last page is full too."),
        code("typescript", `
// courses.service.ts
async list(q: ListCoursesQuery): Promise<CoursePage> {
  const limit = q.limit ?? 20;                       // validated earlier: 1..100
  const order: Order = q.order ?? "desc";
  let after: CoursePosition | null = null;
  if (q.cursor !== undefined) {
    after = decodeCursor(q.cursor);
    if (after === null || after.o !== order) {
      throw new ApiError(400, "invalid_cursor", "The cursor is not valid for this list. Start again without a cursor.");
    }
  }
  const op = order === "desc" ? "<" : ">";
  const dir = order === "desc" ? "DESC" : "ASC";   // both from a fixed set, never from the request text
  const { rows } = await this.db.query(
    \`SELECT id, title, published_at FROM catalog.courses
      WHERE status = 'published'
        AND ($1::timestamptz IS NULL OR (published_at, id) \${op} ($1, $2))
      ORDER BY published_at \${dir}, id \${dir}
      LIMIT $3\`,
    [after?.k[0] ?? null, after?.k[1] ?? null, limit + 1],
  );
  const data = rows.slice(0, limit);
  const last = data[data.length - 1];
  return {
    data,
    next_cursor: rows.length > limit
      ? encodeCursor({ v: 1, o: order, k: [last.published_at.toISOString(), last.id] })
      : null,
  };
}`, "courses.service.ts"),
        p("The response stays small and boring, which is what clients want: `{ \"data\": [...], \"next_cursor\": \"eyJ2IjoxLC...\" }`, with `next_cursor: null` on the last page. Do not add a total count by default: `count(*)` on a large filtered list costs more than the page itself, and it is stale by the time the client reads it."),
        callout("info", "Timestamps in cursors",
            "PostgreSQL `timestamptz` has microsecond precision, JavaScript `Date` has millisecond precision. If `published_at` can hold microseconds, a cursor built from a `Date` rounds the position and can skip or repeat rows at the boundary. Either store the value at millisecond precision (`timestamptz(3)`), or select it as text (`to_char(...)` or `published_at::text`) and put that exact text in the cursor."),

        h2("5. How to verify it"),
        p("The bugs in section 2 only appear when something changes between two requests, so the test must change something between two requests. Walk the whole list, write in the middle, and check that every row that existed at the start came back exactly once:"),
        code("typescript", `
// courses.e2e-spec.ts (Jest + supertest, test database)
it("walks the catalog without duplicates or gaps while courses are published", async () => {
  await seedCourses(250, { sameSecondBatch: 40 });          // ties included on purpose
  const before = await allPublishedIds();
  const seen: number[] = [];
  let cursor: string | null = null;
  do {
    const res = await request(app).get("/courses").query({ limit: 30, ...(cursor ? { cursor } : {}) });
    expect(res.status).toBe(200);
    seen.push(...res.body.data.map((c: { id: number }) => c.id));
    cursor = res.body.next_cursor;
    await publishCourse({ publishedAt: new Date() });        // an instructor publishes mid-walk
  } while (cursor);
  expect(new Set(seen).size).toBe(seen.length);              // no duplicates
  expect(before.every((id) => seen.includes(id))).toBe(true); // no gaps
});`, "courses.e2e-spec.ts"),
        bullets([
            "**Query plan.** `EXPLAIN (ANALYZE) SELECT ... WHERE (published_at, id) < (...) ORDER BY published_at DESC, id DESC LIMIT 21` should show an Index Scan on `courses_published_keyset` with an Index Cond on the row comparison, and roughly 21 rows read, whatever the page. The offset version reads `offset + limit` rows and throws most of them away.",
            "**Tampered cursors.** Send a cursor with `v: 2`, with the wrong order, with a string id, and a random string. Each must be a 400 with code `invalid_cursor`, never a 500 and never a page.",
            "**The exact last page.** Seed 40 rows, walk with `limit=20`: two requests, the second with `next_cursor: null`.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**No tie-break.** `ORDER BY published_at DESC` with a cursor on `published_at` alone drops (with `<`) or repeats (with `<=`) the rows that share the boundary timestamp. Spot it: the `ORDER BY` has no unique column at the end; a walk over seeded ties loses rows.",
            "**Cursor and query disagree.** The cursor holds `(published_at, id)` but the `ORDER BY` is `published_at DESC, id ASC`, or the cursor was made for another sort or filter. Spot it: the comparison operator and the sort directions do not match column by column; no test sends a cursor with a different order.",
            "**Trusting the cursor.** Decoding it and passing the fields straight to SQL, or building SQL text from them. Spot it: no validation after `JSON.parse`; a hand-edited cursor gives a 500 or a page instead of a 400.",
            "**\"Full page means there is more\".** Spot it: `next_cursor` is computed from `rows.length === limit`; the client makes an extra request that returns an empty page.",
            "**Changing the format without a version.** A new default sort ships, old cursors are read as the new format and return the wrong rows. Spot it: there is no version field, or the decoder does not check it.",
        ]),
        p("Now write the cursor and the page logic yourself. The challenge keeps the table in memory instead of PostgreSQL: your comparison plays the role of the `WHERE` and the `ORDER BY`. The test runner publishes courses between requests and follows `next_cursor` like the search sync does."),
        challenge("chal_coding_adp_212"),

        h2("7. Summary"),
        numbered([
            "A page number is a count of rows, so inserts above the reader and ties that change order make offset pagination skip and repeat rows. A cursor stores a position in the list, and the next page continues after it.",
            "The position needs a total order (sort key plus a unique id) and the same columns and directions in the `ORDER BY` and in the row comparison `(published_at, id) < ($1, $2)`, backed by an index on those columns.",
            "Make the cursor opaque, versioned, bound to the query and validated like any input (400 `invalid_cursor`); read limit + 1 rows to know whether `next_cursor` is null; prove it with a test that writes between requests.",
        ]),

        h2("Sources"),
        bullets([
            "PostgreSQL documentation: LIMIT and OFFSET (the order of rows is unpredictable without a unique ORDER BY; OFFSET rows are still computed) - https://www.postgresql.org/docs/current/queries-limit.html",
            "PostgreSQL documentation: Row Constructor Comparison - https://www.postgresql.org/docs/current/functions-comparisons.html",
            "RFC 4648, section 5: Base 64 Encoding with URL and Filename Safe Alphabet - https://www.rfc-editor.org/rfc/rfc4648",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one list endpoint of your own API. Write down its ORDER BY and check that it ends with a unique column. Then write the walk test from section 5 against it, with a write between every two requests and a batch of rows sharing one timestamp. If it pages with OFFSET, run EXPLAIN ANALYZE on a deep page and on the keyset version, and keep both plans in the pull request that switches it."),
    ],
});
