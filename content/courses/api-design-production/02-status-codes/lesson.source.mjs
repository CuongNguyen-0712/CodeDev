// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-1-2",
    title: "Choose status codes clients can act on",
    slug: { _type: "slug", current: "status-codes-clients-can-act-on" },
    description:
        "After grading moved to a queue, POST /submissions kept answering 200 OK, and the mobile app showed \"0 of 0 tests passed\" for every run. The same audit found draft courses that answered 403 to learners (so their ids could be discovered), a 429 without Retry-After that the app retried in a loop, and a deleted course that crashed into a 500. Learn to choose each status code by what the client should do next: 201 with Location, 202 with a status resource, 400 or 422, 401 with WWW-Authenticate, 404 to hide a resource, 409, 410, 402, 429 and 503 with Retry-After, and 405 with Allow, all from one table.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (submissions and catalog)",
        problem:
            "Two days after the grading service moved behind a queue, support had 300 tickets saying \"my code shows 0 of 0 tests passed\". POST /submissions on https://api.codedev.test now saves the submission, puts it on the grading queue and answers 200 OK with {\"id\":\"sub_88\",\"status\":\"queued\"}. Mobile app 3.6 treats any 2xx from that endpoint as the graded result and renders the empty test list. While reviewing the endpoint, the team also found that learners get 403 for draft courses (a forum thread lists upcoming course names found by trying ids), that a 429 from the leaderboard carries no Retry-After, and that GET on a deleted course returns 500.",
    },

    content: [
        h2("1. The incident: 200 OK for a submission nobody has graded"),
        p("The handler was correct when grading was synchronous: it ran the tests and returned the result, so `200` with the result in the body was true. Then grading moved behind a queue to absorb peaks. The handler changed; its status code did not:"),
        code("typescript", `
// submissions.controller.ts - after the queue was added
@Post()
@HttpCode(200)                                                       // left over from synchronous grading
async submit(@Body() dto: CreateSubmissionDto, @User() user: AuthUser) {
  const submission = await this.submissions.create(user.id, dto);   // status: "queued"
  await this.gradingQueue.add("grade", { submissionId: submission.id });
  return submission;
}`, "submissions.controller.ts"),
        p("Without `@HttpCode`, NestJS answers a `POST` with `201`. That is closer (a submission record does exist) but still says nothing about the grading not being done. The mobile client did what its code says:"),
        code("typescript", `
// mobile app 3.6
const res = await api.post("/submissions", body);
if (res.ok) showResult(await res.json());   // expects { passed, total, tests: [...] }
else showError(res);`, "RunButton.tsx"),
        p("`showResult` received `{ id, status: \"queued\" }`, found no tests and rendered \"0 of 0 tests passed\". The status code told the client \"this is the result\" when the truth was \"I accepted it, the result comes later\". The body even said so; no client reads the body to find out whether it got what it asked for."),

        h2("2. Reproduce it and read the evidence"),
        p("Ask the API with `curl -i`, which prints the status line and the headers:"),
        code("bash", `
curl -i -X POST https://api.codedev.test/submissions -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"challengeId":"chal_17","language":"typescript","code":"..."}'

HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"id":"sub_88","status":"queued"}`, "terminal"),
        p("No `Location`, so the client does not even know where to ask for the result later. The audit then went through the other endpoints and wrote down what each one answers and what the client did with it:"),
        code("text", `
request                                    answer today            what the client did
POST /submissions (queued)                 200, no Location        rendered an empty result
GET  /courses/crs_draft_77 (learner)       403 Forbidden           learned the draft exists
GET  /courses/crs_nope (learner)           404 Not Found           -
GET  /leaderboard (over the limit)         429, no Retry-After     retried at once, 40 times
GET  /courses/crs_31 (deleted in August)   500                     showed "server error", retried
PUT  /courses/crs_42/publish               404 Cannot PUT ...      showed "course not found"`, "status audit"),
        p("Each row is the same mistake: a status code chosen by whoever wrote the handler, not by asking what the client must do next."),

        h2("3. Core idea: a status code is the client's next step"),
        p("Clients, SDK generators, retry policies, caches and dashboards all branch on the status line before anyone reads a body. So choose a status by the **action it tells the client to take**. RFC 9110 also says that a client that does not recognise a code must treat it as the `x00` of its class, which is one more reason to stick to well-known codes: an exotic `4xx` is read as `400`."),
        code("text", `
client's next step                      status
it is done, here is the result          200 (204 when there is no body, e.g. DELETE)
it is created, here is where it lives   201 + Location
it is accepted, poll this URL           202 + Location of a status resource
change the request shape                400 (with field errors, lesson 1.3)
the request is fine, a rule says no     422
sign in or refresh the token            401 + WWW-Authenticate
stop: not allowed for you               403
stop: nothing here (for you)            404
stop: it was here and is gone for good  410
pay or upgrade first                    402
reload, then try again                  409
slow down, then retry                   429 + Retry-After
retry later, it is on our side          503 + Retry-After
use another method                      405 + Allow`, "the CodeDev status table"),
        h3("Success codes that carry a promise"),
        bullets([
            "**201 Created** means the resource exists now. Send `Location` with its URL so the client does not have to build it. For `PUT` that creates a resource, the request URL already is the resource, so `Location` adds nothing.",
            "**202 Accepted** means \"received, not done\". RFC 9110 calls it intentionally noncommittal: the work may still fail. Return a `Location` that points to a **status resource** (`/submissions/sub_88`) the client can poll, or a push channel it already listens on. This is the code the incident needed: a submission record exists, but what the client asked for, a graded run, is not done. A client that only needed the record could be given 201.",
            "**200 for a repeat that changes nothing.** \"Enroll\" for a learner who is already enrolled, or \"publish\" for a published course, can answer `200` with the existing resource: the client wanted that state and has it. That is what makes such an action safe to retry.",
        ]),
        h3("400 or 422: a policy, written down once"),
        p("RFC 9110 defines `400` as a request the server cannot or will not process because of a client error, and `422 Unprocessable Content` as a request whose content type and syntax are fine but whose instructions cannot be processed. APIs draw the line in different places; what matters is to draw it once. CodeDev's rule: **400 when the request does not match the schema** (a missing field, a wrong type, an unknown enum value, with a list of field errors), **422 when the request is valid but a business rule refuses it** (prerequisites missing, enrollment closed). A client fixes a 400 in the form; it explains a 422 to the learner."),
        h3("401, 403 or 404: who is asking, and may they know?"),
        bullets([
            "**401 Unauthorized** means \"no valid credentials\": none sent, expired or revoked. RFC 9110 requires a `WWW-Authenticate` header on every 401 that names the scheme (`Bearer realm=\"codedev\"`), so a client knows how to authenticate.",
            "**403 Forbidden** means \"I know who you are, and the answer is no\". It confirms that the resource exists.",
            "**404 to hide.** RFC 9110 allows a server that wants to hide the existence of a forbidden resource to answer `404` instead. Use it whenever the existence itself is private: draft courses for learners, another learner's submissions. The audit row for `crs_draft_77` is exactly the leak this prevents: `403` versus `404` let anyone list draft ids. Keep `403` when the caller may know the resource exists (a learner opening an instructor-only page of a course they can see).",
        ]),
        h3("Codes with headers the client needs"),
        bullets([
            "**409 Conflict** when the request conflicts with the current state, such as an edit that carries a stale `version` in its body: reload, reapply, resend. (When the version travels in an `If-Match` header the answer is `412 Precondition Failed`; that is lesson 3.2.)",
            "**410 Gone** for a course that was deleted on purpose and will not come back. Unlike 404 it says \"remove your bookmark and your offline copy\", and caches may store it.",
            "**402 Payment Required** is reserved by RFC 9110 without a defined meaning. CodeDev documents it as \"premium course, show the upgrade screen\". If you use it, document it, as with any code you give a meaning.",
            "**429 Too Many Requests** (RFC 6585) and **503 Service Unavailable** both say \"try later\" and should carry `Retry-After` in seconds. CodeDev answers 503 when a dependency it needs is down (the code runner, the payment provider): not 500, because it is not a bug, and the client action is the same as for 429.",
            "**405 Method Not Allowed** must carry an `Allow` header listing the methods the resource supports. Express, which NestJS uses by default, answers an unknown method on a known path with `404 Cannot PUT ...`, so you only get a correct 405 if you add it.",
        ]),
        callout("info", "Status code first, error code second",
            "A status code is coarse on purpose: the client's next step. Which rule failed (prerequisites, closed enrollment, invalid email) belongs in the error body's machine code, which is lesson 1.3. Do not invent a status per rule, and never answer 200 with {\"success\": false}: retries, caches, monitoring and generated SDKs all believe the status line."),
        h3("When not to"),
        bullets([
            "**Not 202 for fast work.** If the result is ready within the request's time budget, return it with 200 or 201; polling adds a round trip and a status resource to maintain.",
            "**Not 404-to-hide for public resources.** Hiding a resource the caller may know about only makes support harder; answer 403 and say why in the body.",
            "**Not a rare code because it fits.** `207 Multi-Status` or `418` look precise and confuse every generic client. Prefer the common code plus a precise error code in the body.",
        ]),

        challenge("chal_quiz_adp_121"),

        h2("4. Worked example: one table, used by every handler"),
        p("Handlers report outcomes; one function in the HTTP layer turns them into a status and headers. The submission handler now says what really happened:"),
        code("typescript", `
// submissions.controller.ts - after the fix
@Post()
@HttpCode(202)
async submit(@Body() dto: CreateSubmissionDto, @User() user: AuthUser, @Res({ passthrough: true }) res: Response) {
  const submission = await this.submissions.create(user.id, dto);
  await this.gradingQueue.add("grade", { submissionId: submission.id });
  res.location(\`/submissions/\${submission.id}\`);       // the status resource to poll
  return { id: submission.id, status: submission.status };
}

@Get(":submissionId")
get(@Param("submissionId") id: string, @User() user: AuthUser) {
  return this.submissions.getVisible(user, id);           // 404 for someone else's submission
}`, "submissions.controller.ts"),
        p("The client follows the `Location` and polls until the status is final, which is what the status code now promises:"),
        code("bash", `
HTTP/1.1 202 Accepted
Location: /submissions/sub_88
Content-Type: application/json; charset=utf-8

{"id":"sub_88","status":"queued"}

curl -s https://api.codedev.test/submissions/sub_88 -H "Authorization: Bearer $TOKEN"
{"id":"sub_88","status":"graded","passed":5,"total":6,"tests":[...]}`, "terminal"),
        p("The hiding policy lives in the service, so every endpoint that loads a course applies it the same way:"),
        code("typescript", `
// courses.service.ts
async getVisible(user: AuthUser, courseId: string): Promise<Course> {
  const course = await this.repo.find(courseId);
  if (!course) throw new CourseNotFound(courseId);                         // 404
  if (course.deletedAt) throw new CourseGone(courseId);                    // 410
  if (course.status === "draft" && !canEdit(user, course)) {
    throw new CourseNotFound(courseId);                                    // hide, do not reveal: 404 not 403
  }
  return course;
}`, "courses.service.ts"),
        p("And the 405 that Express does not produce: a catch-all route on the action path, registered after the real one, answers with the methods it supports:"),
        code("typescript", `
@Post(":courseId/publish")
@HttpCode(200)
publish(@Param("courseId") id: string) { return this.courses.publish(id); }

@All(":courseId/publish")
publishWrongMethod(@Res({ passthrough: true }) res: Response) {
  res.setHeader("Allow", "POST");
  throw new MethodNotAllowedException();
}`, "courses.controller.ts"),

        h2("5. How to verify it"),
        bullets([
            "**Unit test the table as a table.** One row per outcome and method, asserting status and headers, as in the exercise below. A new outcome without a row shows up as a failing test, not as a 200 in production.",
            "**Replay the audit with `curl -i`.** Every row of section 2 again: the submission answers `202` with `Location`, the draft and the missing course both answer `404` with the same body, the deleted course `410`, the leaderboard `429` with `Retry-After`, and `PUT .../publish` `405` with `Allow: POST`.",
            "**Compare the hidden and the missing answer byte for byte.** For the hiding policy to work, `404` for a draft and `404` for a course that never existed must be indistinguishable: same body, same headers, similar timing. Diff the two `curl -i` outputs.",
            "**Check the OpenAPI document.** Each operation lists the status codes it can return. A `POST` with only `200` documented, or a `429` without a `Retry-After` header object, is a contract the clients cannot trust.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**A status left over from an earlier design.** `@HttpCode(200)` on a handler that now queues work. Spot it by grepping for `@HttpCode` next to queue calls, and in clients that render empty results.",
            "**403 for something the caller must not know exists.** Spot it by requesting a draft id and a random id as a learner: two different answers are a leak.",
            "**429 or 503 without Retry-After.** Clients guess, and a guess of zero is a retry storm. Spot it in the access log: bursts of identical requests a few milliseconds apart after a 429.",
            "**500 for a known state.** A deleted course or a down dependency is not a bug, yet it fires the 5xx alert and invites blind retries. Spot it in 500s whose log entry is a null check on `deletedAt` or a connection refused from a known dependency.",
            "**401 without WWW-Authenticate, or 401 for \"not allowed\".** A client that gets 401 refreshes the token and tries again; if the real answer was \"forbidden\" it loops. Spot it in guards that throw `UnauthorizedException` after the user was identified.",
        ]),

        h2("7. Write the table"),
        p("In the exercise you write the function every CodeDev handler goes through: an HTTP method and a business outcome in, a status code and the required headers out. The description lists the table exactly, including the default `Retry-After`, the order of methods in `Allow`, and what to do with a handler that forgot its `Location`:"),
        code("typescript", `
function chooseResponse(method: string, outcome: Outcome): { status: number; headers: Record<string, string> } {
  // 1. normalise the method
  // 2. one branch per outcome kind, from the table
  // 3. anything the table does not know is a bug on our side
}`),
        challenge("chal_coding_adp_122"),

        h2("8. Summary"),
        bullets([
            "Choose a status code by the client's next step: done (200, 201 with Location, 204), wait and poll (202 with the Location of a status resource), fix the request (400) or explain a rule (422), and stop, pay, reload or slow down.",
            "401 needs WWW-Authenticate, 429 and 503 need Retry-After, 405 needs Allow; and answer 404 instead of 403 whenever the resource's existence is private, such as drafts and other learners' submissions.",
            "Keep the mapping in one table the whole API uses, document every code in OpenAPI, and leave the precise reason to the error body's machine code instead of inventing more status codes.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics, section 15 - 201 and Location (15.3.2), 202 (15.3.3), 401 and WWW-Authenticate (15.5.2), 403 and hiding with 404 (15.5.4), 405 and Allow (15.5.6), 409, 410, 422, 503 and Retry-After (10.2.3) - rfc-editor.org/rfc/rfc9110",
            "RFC 6585, Additional HTTP Status Codes, section 4 (429 Too Many Requests)",
            "NestJS documentation: Controllers (@HttpCode, @Res passthrough) and Built-in HTTP exceptions - docs.nestjs.com",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write your own API's status table in the format of section 3: one row per client action, the status, the required headers. Then run the audit of section 2 against it and list every endpoint that disagrees, with the client behaviour each disagreement causes."),
    ],
});
