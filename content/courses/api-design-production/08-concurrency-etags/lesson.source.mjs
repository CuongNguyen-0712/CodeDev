// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-3-2",
    title: "Concurrent updates: ETags & If-Match",
    slug: { _type: "slug", current: "concurrent-updates-etags-if-match" },
    description:
        "Two instructors edited the same course and one of them silently lost an hour of work: the last PATCH won. Learn why a database transaction cannot protect an edit that spans two HTTP requests, how a version column, an ETag and If-Match turn the lost update into a 412 Precondition Failed the editor can handle, when you do not need any of it, how If-None-Match and 304 save bandwidth on GETs, and why a weak ETag can never guard a write.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev course authoring API",
        problem:
            "Instructor Lan rewrote the description of the SQL Basics course and saved at 09:14. When she opened the course page at 09:20, her text was gone and the old description was back. Nobody deleted it: her colleague Minh had opened the same course in the editor at 09:10, changed only the title, and saved at 09:15. The editor sends every field of the form in its PATCH, so Minh's save wrote the description he had loaded five minutes earlier. Both requests answered 200 OK. The API has no way to tell that Minh's form was out of date.",
    },

    content: [
        h2("1. The incident: the last save wins"),
        p("Lan's bug report says \"my changes disappeared\". The audit log of the course editor API shows they were not lost by accident; they were overwritten by a request that looked perfectly valid:"),
        code("text", `
09:10:04  GET   /courses/42  user=minh  200   description="Learn SQL step by step."
09:11:40  GET   /courses/42  user=lan   200   description="Learn SQL step by step."
09:14:30  PATCH /courses/42  user=lan   200   {"title":"SQL Basics","description":"Write your first queries against a real catalog...","level":"beginner"}
09:15:02  PATCH /courses/42  user=minh  200   {"title":"SQL Basics for Analysts","description":"Learn SQL step by step.","level":"beginner"}`, "course audit log"),
        p("This is a **lost update**. Each person did a read-modify-write: read the course, change a field in the browser, write the whole form back. The two cycles overlapped in time - Minh read before Lan wrote and wrote after her - so Minh's write was based on data that was no longer true. The server accepted it because nothing in the request said which version of the course the form was built from."),
        p("Sending only the changed fields would have saved Lan's description this time, but not the next time two people edit the same field, or fields that must agree with each other (a price and a currency, a lesson order). The real fix is for the server to know which version the client started from."),

        h2("2. Reproduce it and read the evidence"),
        p("Two terminals, one course, two saves built from the same read:"),
        code("bash", `
# both instructors load the course
curl -s https://api.codedev.test/courses/42 -H "Authorization: Bearer $LAN" | jq .description
"Learn SQL step by step."

# Lan saves first
curl -s -o /dev/null -w "%{http_code}\\n" -X PATCH https://api.codedev.test/courses/42 \\
  -H "Authorization: Bearer $LAN" -H "Content-Type: application/json" \\
  -d '{"title":"SQL Basics","description":"Write your first queries...","level":"beginner"}'
200

# Minh saves the form he loaded before Lan's save
curl -s -o /dev/null -w "%{http_code}\\n" -X PATCH https://api.codedev.test/courses/42 \\
  -H "Authorization: Bearer $MINH" -H "Content-Type: application/json" \\
  -d '{"title":"SQL Basics for Analysts","description":"Learn SQL step by step.","level":"beginner"}'
200

curl -s https://api.codedev.test/courses/42 | jq .description
"Learn SQL step by step."`, "terminal"),
        p("Two `200` answers and one lost change. Notice what would **not** help: the two PATCH requests are 32 seconds apart, each runs one short `UPDATE`, and their transactions never overlap. A stricter isolation level or a row lock inside the transaction has nothing to catch. The stale value lived in Minh's browser for five minutes, outside any transaction - and you cannot hold a database lock while a person types."),

        h2("3. Optimistic concurrency: send back the version you started from"),
        p("HTTP already has the pieces, defined in RFC 9110:"),
        numbered([
            "**The server labels each representation with an `ETag`.** An entity tag is an opaque string, in double quotes, that changes whenever the resource changes: `ETag: \"v7\"`.",
            "**The client sends it back on the write with `If-Match`.** `If-Match: \"v7\"` means: apply this PATCH only if the course is still the version I loaded.",
            "**The server checks and writes in one step.** If the current version is still 7, the update applies and the response carries the new ETag, `\"v8\"`. If not, nothing is written and the answer is **`412 Precondition Failed`**.",
            "**The client handles 412 as a merge, not a retry.** It loads the current course, shows the person what changed (\"Lan updated the description at 09:14\") and lets them save on top of the new version.",
        ]),
        p("This is called **optimistic** concurrency: it assumes conflicts are rare, takes no lock while the person edits, and detects the conflict at save time. The alternative, a pessimistic \"checked out by Lan\" lock in the editor, is a product feature with its own problems (forgotten locks, lock timeouts) and is worth it only for documents several people edit continuously."),
        h3("The version column"),
        p("The ETag needs a value that changes on every write and that the `UPDATE` can compare. An integer `version` column is the simplest choice: it cannot collide the way two timestamps written in the same millisecond can, and it does not depend on any server's clock."),
        code("sql", `
ALTER TABLE courses ADD COLUMN version integer NOT NULL DEFAULT 1;

-- PATCH /courses/42 with If-Match: "v7"
UPDATE courses
SET title = $2, description = $3, level = $4,
    version = version + 1, updated_at = now()
WHERE id = $1 AND version = $5          -- $5 = 7, parsed from If-Match
RETURNING id, title, description, level, version;`, "update-course.sql"),
        p("The check and the write are the same statement, so two saves of version 7 cannot both succeed: the first one turns the row into version 8, and the second one's `WHERE version = 7` matches nothing. `UPDATE 0` then has two possible causes, and they get different answers: the course does not exist (`404`), or it exists with another version (`412`). One extra `SELECT` tells them apart."),
        h3("Requiring the precondition"),
        p("A client that sends no `If-Match` at all gets last-write-wins again. Once every client of the editor API sends it, reject writes without it with **`428 Precondition Required`** (RFC 6585), so an old script or a forgotten client cannot quietly bring the lost update back. During the migration, log the requests that arrive without `If-Match` and turn the rule on when the log is empty."),
        h3("When you do not need it"),
        bullets([
            "**Append-only writes.** `POST /courses/42/comments` and `POST /submissions` add rows; nothing is overwritten, so there is nothing to lose.",
            "**Atomic changes that do not depend on what the client read.** `UPDATE courses SET enrolled_count = enrolled_count + 1` reads and writes inside one statement. Adding a lesson to a list with its own `INSERT` is the same.",
            "**Data only one person edits.** A learner's own profile edited from one device rarely conflicts; a 412 there mostly annoys. Add it when you see two tabs or two devices overwriting each other.",
        ]),

        challenge("chal_quiz_adp_321"),

        h2("4. Strong and weak ETags, If-Match and If-None-Match"),
        p("An ETag is **strong** (`\"v8\"`) or **weak** (`W/\"v8\"`). A strong ETag changes whenever the bytes of the representation change. A weak one only promises that two representations are equivalent enough for the client - for example the same course rendered with a different whitespace or a different timestamp in a footer."),
        p("RFC 9110 uses two comparison functions, and which one applies depends on the header:"),
        bullets([
            "**`If-Match` uses strong comparison**: two tags match only if neither is weak and the quoted values are identical. A weak tag never matches. This is deliberate: a write must be based on exactly the version you read.",
            "**`If-None-Match` uses weak comparison**: `W/\"v8\"` and `\"v8\"` match. It is used for caching, where \"equivalent\" is good enough.",
        ]),
        callout("warning", "Express makes weak ETags for you",
            "NestJS on the Express adapter inherits Express's default etag setting: every response body sent through res.send gets a weak ETag such as W/\"5c1-...\", computed from a hash of the body after your handler ran. That is useful for 304 answers to GETs, useless for If-Match, and it hides your own ETag logic. Turn it off for the API and set ETags yourself: app.set(\"etag\", false) on a NestExpressApplication. Also check your proxies: some (nginx when it compresses a response, for example) turn a strong ETag into a weak one."),
        h3("If-None-Match and 304 on GETs"),
        p("The same ETag saves bandwidth on reads. The client sends the ETag it has cached in `If-None-Match`; if the server's current ETag matches, it answers **`304 Not Modified`** with no body, and the client uses its copy. The course editor polls `GET /courses/42` every 30 seconds to show \"Lan is also editing\": with 304s, most of those polls carry no body."),
        p("A 304 saves work on the server only if the server can decide it **before** doing the work. Express's automatic ETag is computed from the response body, so the database queries for the course and its 30 lessons have already run when it answers 304. With a version column, one indexed `SELECT version` is enough to answer, and the heavy query runs only when the course changed. Remember that the ETag must change whenever anything in the representation changes: if the course response includes its lessons, editing a lesson must bump the course's version too (or the ETag must combine both), or clients will keep a stale lesson list behind a 304."),

        h2("5. Worked example: the course controller"),
        code("typescript", `
// courses/etag.ts
export const etagFor = (version: number) => \`"v\${version}"\`;

// If-Match: strong comparison - weak tags never match. "*" matches any existing course.
export function ifMatchVersion(header: string): number | "any" | null {
    const tags = header.split(",").map((tag) => tag.trim());
    if (tags.includes("*")) return "any";
    const strong = tags.map((tag) => /^"v(\\d+)"$/.exec(tag)).find((match) => match !== null);
    return strong ? Number(strong[1]) : null;
}

// If-None-Match: weak comparison - ignore a W/ prefix on either side.
export function ifNoneMatchHits(header: string, version: number): boolean {
    const opaque = (tag: string) => tag.trim().replace(/^W\\//, "");
    return header.split(",").some((tag) => opaque(tag) === "*" || opaque(tag) === etagFor(version));
}`, "etag.ts"),
        code("typescript", `
// courses/courses.controller.ts
@Get(":id")
async findOne(
    @Param("id", ParseIntPipe) id: number,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
) {
    const version = await this.courses.currentVersion(id);          // SELECT version ... (indexed)
    if (version === null) throw new NotFoundException({ code: "course_not_found" });
    res.setHeader("ETag", etagFor(version));
    res.setHeader("Cache-Control", "private, no-cache");             // cache, but revalidate every time
    if (ifNoneMatch && ifNoneMatchHits(ifNoneMatch, version)) {
        res.status(304);
        return;                                                     // the heavy query never runs
    }
    return this.courses.findWithLessons(id);
}

@Patch(":id")
async update(
    @Param("id", ParseIntPipe) id: number,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() dto: UpdateCourseDto,
    @Res({ passthrough: true }) res: Response,
) {
    if (!ifMatch) {
        throw new HttpException({ code: "precondition_required", message: "Send If-Match with the ETag you loaded." }, 428);
    }
    const expected = ifMatchVersion(ifMatch);
    const updated = expected === null ? null : await this.courses.update(id, dto, expected); // the UPDATE ... WHERE version = $5
    if (!updated) {
        const current = await this.courses.currentVersion(id);
        if (current === null) throw new NotFoundException({ code: "course_not_found" });
        res.setHeader("ETag", etagFor(current));
        throw new PreconditionFailedException({
            code: "edit_conflict",
            message: "The course was changed after you loaded it. Reload it and apply your change again.",
            details: { currentEtag: etagFor(current) },
        });
    }
    res.setHeader("ETag", etagFor(updated.version));
    return updated;
}`, "courses.controller.ts"),
        p("The 412 body follows the course's error contract: a stable `code` the editor switches on (`edit_conflict`), a message a person can read, and the current ETag in `details` so the client knows which version to load. The editor's handler is short: on `edit_conflict`, fetch the course, show a diff of the fields the person changed against the new values, and keep the new ETag for the next save."),

        h2("6. How to verify it"),
        bullets([
            "**The reproduction, with headers.** Load the course twice and keep the ETag, save with `If-Match: \"v7\"` from the first terminal (200, `ETag: \"v8\"`), then save with the same `If-Match` from the second (412, nothing written). `curl -i` shows the status and the new ETag.",
            "**An e2e test with two saves.** Send two PATCH requests with the same `If-Match` in parallel with `Promise.all`: exactly one must answer 200 and one 412, and the course's `version` must have gone up by one.",
            "**The 304 path.** `curl -i -H 'If-None-Match: \"v8\"'` must answer 304 with an empty body. Turn on query logging (or count calls on a fake repository) and check that the lessons query did not run.",
            "**No weak ETags on the API.** `curl -sI https://api.codedev.test/courses/42 | grep -i etag` must print `ETag: \"v8\"`, not `W/...`; check it again through the production proxy.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Checking the version in code, then updating by id.** `if (course.version !== expected) throw ...; await repo.update(id, dto)` has the same race as before between the check and the write. Spot it: the `UPDATE`'s `WHERE` contains only the id.",
            "**Comparing headers as strings.** `req.headers[\"if-match\"] === etag` accepts weak tags and fails on a list (`\"v7\", \"v8\"`) or extra spaces. Spot it: a test with `If-Match: W/\"v8\"` gets 200. Parse the tags and compare by the rules of the header.",
            "**Retrying a 412 automatically with the new ETag.** The client resends the same stale body and overwrites the other person's change anyway. Spot it: the 412 handler calls the same save function again without asking the user.",
            "**An ETag that does not cover the whole representation.** The course response includes lessons, but only the `courses.version` goes into the ETag; editing a lesson leaves clients on a stale 304. Spot it: edit a lesson title and GET the course with the old ETag.",
            "**Leaving If-Match optional forever.** Every client that forgets it brings back last-write-wins. Spot it: count PATCH requests without `If-Match` in the access log; answer 428 once the count is zero.",
        ]),

        h2("8. Summary"),
        bullets([
            "A lost update happens between two HTTP requests, so a database transaction cannot prevent it; the client must send back the version it started from (`If-Match`), and the server must check and write in one `UPDATE ... WHERE version = $expected`.",
            "A failed precondition is `412 Precondition Failed` with the current ETag, handled by reloading and merging, never by resending the same body; a missing precondition can be `428`.",
            "Use strong ETags from a version column for writes; `If-None-Match` and `304` use weak comparison and save real work only when the server can compute the ETag before the expensive query.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics: section 8.8.3 (ETag) and 8.8.3.2 (Comparison), 13.1.1 (If-Match), 13.1.2 (If-None-Match), 15.4.5 (304 Not Modified), 15.5.13 (412 Precondition Failed) - rfc-editor.org/rfc/rfc9110",
            "RFC 6585, Additional HTTP Status Codes: section 3 (428 Precondition Required)",
            "Express API reference: the etag application setting",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add the 412 flow to a course editor of your own: keep the ETag in the editor state, show a field-by-field diff when a save returns edit_conflict, and write the e2e test with two parallel saves. Then measure the 304 path: count database queries for 100 polls of an unchanged course with and without If-None-Match."),
    ],
});
