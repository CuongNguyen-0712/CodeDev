// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-2-3",
    title: "How to map domain errors to HTTP exceptions",
    slug: { _type: "slug", current: "map-domain-errors-to-http-exceptions" },
    description:
        "Every domain error of the enrollment service came back as 500 \"Internal server error\", so the mobile app retried enrollments that had already failed with a conflict and on-call was paged for learners' mistakes. Learn to model domain errors as classes that carry data and know nothing about HTTP, map them once in a global exception filter to the status code that tells clients whether to retry, fix the input, pay or give up, answer with application/problem+json bodies, and keep unknown errors to a generic 500 with a correlation id that leads to the full log entry.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (enrollments module)",
        problem:
            "After the mobile release on Thursday, the error-rate alert for https://api.codedev.test paged on-call three times in one evening: POST /enrollments was answering about 1,900 requests an hour with 500. None of them was a server failure. The enrollment service throws new Error(\"Already enrolled\"), new Error(\"Prerequisites missing\") and new Error(\"Course not found\"), Nest turns every plain Error into 500 {\"statusCode\":500,\"message\":\"Internal server error\"}, and the mobile client retries any 5xx three times. Learners who tapped Enroll on a course they already had saw a spinner for seven seconds and then \"Server error, try again later\".",
    },

    content: [
        h2("1. The incident: every error is a 500"),
        p("The service checks its rules correctly. The problem is how it reports a broken rule:"),
        code("typescript", `
// enrollments/enrollments.service.ts - the version that shipped
async enroll(input: { userId: string; courseId: string }): Promise<Enrollment> {
  const course = await this.courses.findById(input.courseId);
  if (!course) throw new Error("Course not found");

  if (await this.enrollmentsRepo.exists(input.userId, input.courseId)) {
    throw new Error("Already enrolled");
  }
  const missing = await this.progress.missingPrerequisites(input.userId, course);
  if (missing.length > 0) throw new Error("Prerequisites missing");

  return this.enrollmentsRepo.create(input);
}`, "enrollments.service.ts"),
        p("A plain `Error` carries a message for humans and nothing a program can act on. When it reaches the HTTP layer, NestJS's built-in exception filter has no way to tell \"you are already enrolled\" from \"the database is down\", so it gives both the same safe answer: 500."),

        h2("2. Reproduce it and read the evidence"),
        p("Enroll twice in the same course. The second request is the interesting one:"),
        code("bash", `
curl -i -X POST https://api.codedev.test/enrollments \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"courseId":"c_1042","email":"ana@codedev.test","plan":"premium"}'

HTTP/1.1 500 Internal Server Error
Content-Type: application/json; charset=utf-8

{"statusCode":500,"message":"Internal server error"}`, "terminal"),
        p("The access log shows what the mobile client did with that answer, and the application log shows what the server actually knew:"),
        code("text", `
# access log - one tap on Enroll
21:14:07.402 POST /enrollments 500 29ms  ua=CodeDevMobile/3.4
21:14:08.441 POST /enrollments 500 27ms  ua=CodeDevMobile/3.4
21:14:10.478 POST /enrollments 500 31ms  ua=CodeDevMobile/3.4
21:14:14.512 POST /enrollments 500 28ms  ua=CodeDevMobile/3.4

# application log
21:14:07.401 ERROR [ExceptionsHandler] Already enrolled
Error: Already enrolled
    at EnrollmentsService.enroll (src/enrollments/enrollments.service.ts:31:13)`, "logs"),
        p("Read the two logs together. The server knew precisely what happened (a conflict with the learner's existing enrollment) and threw that knowledge away at the boundary. The client did the reasonable thing for a 500, which in HTTP means \"the server failed; the same request might work later\", and tried again three times. The alert counted user mistakes as outages. One wrong status code produced three separate incidents."),

        h2("3. Core idea: name the error in the domain, choose the status at the edge"),
        p("Split the problem in two, and give each half to the layer that understands it:"),
        numbered([
            "**The service names what went wrong.** Each failure a caller must react to differently gets a small class that extends a common `DomainError` and carries the data (`courseId`, the list of missing prerequisites). It does not mention HTTP: the same service is called by the web API, the staff CSV import and a queue consumer, and a `409` means nothing to a queue.",
            "**One mapping at the edge decides the HTTP response.** A global exception filter turns each domain error into a status code and a body. It is the only place that knows `AlreadyEnrolled` is a 409, so the whole API answers consistently and a change is one line.",
        ]),
        h3("A status code is an instruction to the client"),
        p("Pick the status by asking what the client should do next. That is what clients, proxies, retry policies and dashboards read:"),
        bullets([
            "**404 Not Found** (`CourseNotFound`): the thing does not exist. Do not retry; show \"not found\".",
            "**409 Conflict** (`AlreadyEnrolled`): the request conflicts with the current state of the resource. Retrying the same request gets the same answer; show the state (\"You are already enrolled\").",
            "**422 Unprocessable Content** (`PrerequisitesMissing`): the request is well-formed, but this learner cannot do it yet. The client can show what is missing.",
            "**400 Bad Request** (`ValidationFailed`): the request itself is malformed; the client must change it. The field list tells it where.",
            "**403 Forbidden** (`NotAllowed`): the user is known but not allowed. Do not retry.",
            "**402 Payment Required** (`PaymentRequired`): RFC 9110 reserves this code without defining its use, and many APIs use it for \"upgrade first\". If you use it, document it, as CodeDev does: the app answers it with the upgrade screen.",
            "**500 Internal Server Error**: anything you did not anticipate. Only 5xx (and a few others, such as 429 and 503) say \"try again later\".",
        ]),
        h3("A body format every client can parse"),
        p("RFC 9457, Problem Details for HTTP APIs, defines a JSON error format with the media type `application/problem+json`. Its members are `type` (a URI that identifies the kind of problem, and the value clients should branch on), `title` (a short summary that does not change between occurrences), `status`, `detail` (an explanation of this occurrence) and `instance` (which request it was). You may add extension members, such as the list of missing prerequisites. One format for every error means the mobile app writes one error parser instead of one per endpoint."),
        h3("Unknown errors: say less, log more"),
        p("A `TypeError` from a null course, a lost database connection or a timeout is a bug or an outage, not a message for the learner. The response must not contain the error's message or stack: they reveal table names, file paths, internal hosts and sometimes data. Instead, answer a generic 500 that carries a **correlation id**, and write the full error to the log with the same id. Support can then search the logs for the id the learner reads out from the error screen."),
        callout("info", "Why not throw ConflictException in the service?",
            "Many NestJS examples throw HttpException subclasses from services, and in a small app with one entry point that is fine. In a modular monolith the enrollment service is also called by the CSV import and a queue consumer: an HTTP exception there is meaningless, and the HTTP mapping ends up spread over every service. Throw domain errors; map them once."),
        h3("When not to"),
        bullets([
            "**Not a class per `if`.** Create a domain error when callers must react differently (show a different screen, retry or not, a different status). Two messages that lead to the same reaction can share a class with different data.",
            "**Not a 4xx for a bug.** A `TypeError` is your mistake, not the client's. Mapping it to 400 makes the client \"fix\" a request that was fine and hides the bug from your 5xx alert.",
            "**Not an error for a normal outcome.** \"No courses match this search\" is an empty list with 200, not a 404.",
        ]),

        h2("4. Worked example: classes, filter and correlation id"),
        code("typescript", `
// common/domain-errors.ts - no import from @nestjs/common or express here
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class CourseNotFound extends DomainError {
  constructor(readonly courseId: string) { super(\`course \${courseId} not found\`); }
}
export class AlreadyEnrolled extends DomainError {
  constructor(readonly userId: string, readonly courseId: string) { super(\`user \${userId} already enrolled in \${courseId}\`); }
}
export class PrerequisitesMissing extends DomainError {
  constructor(readonly courseId: string, readonly missing: string[]) { super(\`prerequisites missing for \${courseId}\`); }
}
// ValidationFailed, NotAllowed, PaymentRequired follow the same pattern`, "domain-errors.ts"),
        p("The service now throws `new AlreadyEnrolled(input.userId, input.courseId)`. Its unit test can assert `rejects.toBeInstanceOf(AlreadyEnrolled)` and check `courseId`, without any HTTP."),
        p("A middleware gives every request a correlation id before any handler runs. It reuses the id a client or gateway sent, but only when it is short and made of safe characters: the header ends up in your logs and in a response header, so a value with spaces or a line break must never be copied."),
        code("typescript", `
// common/correlation-id.middleware.ts
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export function correlationId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-correlation-id");
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.correlationId = id;                       // declared on Express.Request in a .d.ts
  res.setHeader("X-Correlation-Id", id);
  next();
}`, "correlation-id.middleware.ts"),
        p("The filter catches everything (`@Catch()` with no argument), turns it into a problem, logs unknown errors in full and answers with problem+json:"),
        code("typescript", `
// common/problem.filter.ts
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger("ProblemFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    const problem = toProblem(exception, req.path);

    if (problem.status >= 500) {
      // the full story goes to the log, under the id the client will quote
      this.logger.error(\`\${req.correlationId} \${req.method} \${req.path}\`, exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(problem.status)
      .type("application/problem+json")
      .json({ ...problem, correlationId: req.correlationId });
  }
}

const PROBLEMS = "https://api.codedev.test/problems/";

function toProblem(error: unknown, path: string): Problem {
  if (error instanceof AlreadyEnrolled) {
    return { type: PROBLEMS + "already-enrolled", title: "Already enrolled", status: 409,
             detail: \`You are already enrolled in \${error.courseId}.\`, instance: path };
  }
  // ... one branch per domain error, then HttpException (route 404s and the like)
  return { type: PROBLEMS + "internal-error", title: "Internal server error", status: 500,
           detail: "An unexpected error occurred. Quote the correlation id when you contact support.", instance: path };
}`, "problem.filter.ts"),
        p("Register both in `main.ts` with `app.use(correlationId)` and `app.useGlobalFilters(new ProblemFilter())`. Two more connections make the format universal:"),
        bullets([
            "**Validation errors use the same path.** Give the `ValidationPipe` from lesson 2.1 an `exceptionFactory` that throws `new ValidationFailed(errors.map(...))` with `{ field, message }` pairs, and DTO failures come out as problem+json too.",
            "**Framework exceptions still work.** Nest throws `NotFoundException` for an unknown route and guards throw `UnauthorizedException`. Give `HttpException` its own branch that keeps its status, so `@Catch()` does not turn a 401 into a 500.",
        ]),
        p("The same request as in section 2 now answers:"),
        code("bash", `
HTTP/1.1 409 Conflict
Content-Type: application/problem+json; charset=utf-8
X-Correlation-Id: 5f0c2a9e-7d41-4c2b-9a51-0b8e3f6d2c17

{"type":"https://api.codedev.test/problems/already-enrolled","title":"Already enrolled","status":409,
 "detail":"You are already enrolled in c_1042.","instance":"/enrollments",
 "correlationId":"5f0c2a9e-7d41-4c2b-9a51-0b8e3f6d2c17"}`, "terminal"),

        challenge("chal_quiz_nmm_231"),

        h2("5. How to verify it"),
        bullets([
            "**Unit test the mapping as a table.** One test per domain error: build the error, call `toProblem`, compare status and type. A new domain error without a mapping shows up as a 500 in that test, not in production.",
            "**Prove that unknown errors stay quiet.** Make a fake repository throw `new Error(\"SECRET duplicate key enrollments_user_id_course_id_key\")` and assert that the response body does not contain `SECRET` and does contain a correlation id.",
            "**End-to-end, twice.** Enroll, enroll again: the second response is 409 with `Content-Type: application/problem+json`. Then search the logs for its `X-Correlation-Id`.",
            "**Watch the dashboards.** After the release, the 5xx rate of POST /enrollments should drop to the real failures, and the 4xx split by `type` shows how often learners hit each rule.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**`throw new Error(\"...\")` for a rule.** The message is the only information, so every caller has to parse it. Spot it by searching services for `new Error(` and controllers or filters for `message.includes(` or `message ===`.",
            "**Matching by name instead of class.** `if (err.name === \"CourseNotFound\")` also matches a plain object or a copied class from another package. Spot it in filters that read `name` or `constructor.name`; use `instanceof`.",
            "**A filter that only catches domain errors.** `@Catch(DomainError)` leaves everything else to Nest's default, so the API has two error formats and unknown errors carry no correlation id. Spot it when some 500 responses are `application/json` and others `application/problem+json`.",
            "**Leaking internals in the 500.** `detail: error.message` or a stack in the body exposes SQL constraint names, file paths and hosts. Spot it with the `SECRET` test above.",
            "**Copying input back into errors.** Validation errors that echo the rejected value can send a password or token back into responses and logs. Spot it by checking which fields of a validation error reach the body.",
        ]),

        h2("7. Write the mapping"),
        p("The challenge gives you the domain error classes (do not change them) and asks for the mapping function at the heart of the filter: anything thrown, plus the request and a way to make a new id, becomes one `{ status, headers, body }` response. The code runner has no NestJS, so there is no `HttpException` branch; everything that is not one of the listed domain errors is a 500. The tests throw real domain errors, plain errors, strings, `null` and objects that only look like domain errors, and check that no internal text reaches a body:"),
        code("typescript", `
function toProblemResponse(error: unknown, req: ProblemRequest, newId: () => string): HttpResponse {
  // 1. decide the correlation id once: a safe incoming header, or one new id
  // 2. instanceof each domain error -> status, type, title, detail, extensions
  // 3. anything else -> a generic 500 that says nothing about the error
}`),
        challenge("chal_coding_nmm_232"),

        h2("8. Summary"),
        bullets([
            "Services throw domain error classes that carry data and know nothing about HTTP; one global `@Catch()` filter maps them to status codes, so the same rule answers the same way on every endpoint.",
            "Choose each status by what the client should do next (404, 409, 422, 400, 403, 402 do not invite a retry; 5xx does) and answer with an `application/problem+json` body whose `type` clients can branch on.",
            "Unknown errors become a generic 500 with no message or stack, and a correlation id that is returned to the client and written to the log next to the full error.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS documentation: Exception filters (docs.nestjs.com/exception-filters) - the built-in filter, @Catch(), global filters",
            "RFC 9457, Problem Details for HTTP APIs - type, title, status, detail, instance and extension members",
            "RFC 9110, HTTP Semantics, section 15 - status codes 400, 402, 403, 404, 409, 422 and 500",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every error your own API can return today and write a table: domain error, status, problem type, what the client should do. Then publish a short page for each problem type under its type URI, and add the SECRET test to your end-to-end suite."),
    ],
});
