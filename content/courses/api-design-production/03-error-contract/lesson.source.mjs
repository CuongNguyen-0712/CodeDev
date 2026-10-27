// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-1-3",
    title: "One error contract: code, message, details & trace id",
    slug: { _type: "slug", current: "one-error-contract-code-message-details-trace-id" },
    description:
        "The CodeDev API answered errors in three shapes - NestJS's default validation body, problem+json from the enrollments filter and a legacy payments format - and the mobile app showed \"undefined\" in half of its error banners. Learn to define one error contract on top of RFC 9457 with a stable machine code, a message key clients translate, ordered and capped field details and a trace id that leads to the logs, and to produce it from one formatter that never leaks internal messages for 5xx errors.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (platform team)",
        problem:
            "The mobile team's analytics for last week show 2,380 error banners, and 1,214 of them read exactly \"undefined\". Support cannot help those learners: the screenshot has no message and nothing to search the logs for. The API at https://api.codedev.test has three error formats: validation errors come from NestJS's default ValidationPipe response, enrollment errors from the ProblemFilter added last quarter (application/problem+json), and payment errors from an older filter in the payments module that wraps them in {\"error\":{\"code\",\"msg\"}}. The app reads body.message, which only one of the three formats has.",
    },

    content: [
        h2("1. The incident: three error shapes, one banner"),
        p("The mobile app has one error handler, and it is not wrong for the API it was written against:"),
        code("typescript", `
// mobile app 3.6 - shared error handling
async function handleError(res: Response) {
  const body = await res.json();
  showBanner(String(body.message));
}`, "errors.ts"),
        p("When it was written, every error came from NestJS's built-in handling, whose body has a `message`. Since then two teams improved errors independently: the enrollments team added an RFC 9457 filter with `title` and `detail`, and the payments module kept its own format from before the move to NestJS. Each format is reasonable on its own. Together they mean that no client can parse an error without knowing which team wrote the endpoint."),

        h2("2. Reproduce it and read the evidence"),
        p("Trigger one error of each kind and compare the bodies:"),
        code("bash", `
curl -s -X POST https://api.codedev.test/enrollments -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"email":"ana@"}'
{"statusCode":400,"message":["email must be an email","courseId should not be empty"],"error":"Bad Request"}

curl -s -X POST https://api.codedev.test/enrollments -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"courseId":"crs_42"}'
{"type":"https://api.codedev.test/problems/already-enrolled","title":"Already enrolled","status":409,
 "detail":"You are already enrolled in crs_42.","instance":"/enrollments"}

curl -s -X POST https://api.codedev.test/orders -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"courseId":"crs_42","card":"tok_declined"}'
{"error":{"code":"CARD_DECLINED","msg":"The card was declined."}}`, "terminal"),
        p("Then find where each shape is produced. Every body that leaves a NestJS app as an error passes through an exception filter, so the filters are the whole story:"),
        code("bash", `
grep -rn "@Catch(" src/
src/enrollments/problem.filter.ts:12:@Catch(DomainError)
src/payments/payment-error.filter.ts:8:@Catch(PaymentError)
# ...and everything else falls through to Nest's built-in BaseExceptionFilter`, "terminal"),
        p("Three producers, three shapes, and one consumer that can read one of them. The analytics numbers line up: about half the banners come from enrollment and payment errors, and those are exactly the ones that read \"undefined\". The fix is not a smarter app; the next client (the web app, a partner integration) would hit the same wall. The fix is one contract, enforced in one place."),

        h2("3. Core idea: one contract, one formatter"),
        h3("The contract"),
        p("Start from RFC 9457 (Problem Details), which clients and tools already know, and add the four members CodeDev's clients asked for. RFC 9457 explicitly allows extension members, and clients that do not know them must ignore them:"),
        code("json", `
{
  "type": "https://api.codedev.test/problems/validation-failed",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "message": "request.invalid",
  "details": [
    { "field": "courseId", "code": "isNotEmpty", "message": "validation.isNotEmpty" },
    { "field": "email", "code": "isEmail", "message": "validation.isEmail" }
  ],
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "instance": "/enrollments"
}`, "the CodeDev error contract (Content-Type: application/problem+json)"),
        bullets([
            "**`code`**: a stable machine code in UPPER_SNAKE_CASE. Clients branch on it (`switch (body.code)`), analytics group by it. Once published it never changes meaning, exactly like a status code. `type` carries the same information as a URI that can point to documentation; `code` is the form that is easy to switch on.",
            "**`message`**: a **message key** (`enrollment.already_enrolled`) that the client looks up in its own translations, Vietnamese or English. The server does not know which language the screen shows, and an English sentence cannot be translated reliably on the device. Clients show a generic text for a key they do not know yet.",
            "**`details`**: a list of `{ field, code, message }` for errors that belong to a part of the request: the form field to highlight, the CSV row that failed. Empty, never missing, so clients can always iterate.",
            "**`traceId`**: the id of this request in the logs and traces. The learner's screen shows it, support pastes it into the log search and finds the full story, stack included.",
        ]),
        h3("Five rules the formatter enforces"),
        numbered([
            "**One producer.** Every error, from every module and from the framework itself, goes through one function. A second filter is a second contract.",
            "**5xx says nothing internal.** For any status of 500 or more the message is a generic key and the details are empty. The thrown message and the stack go to the log under the trace id, never to the client: they contain hosts, table names, file paths and sometimes data. A domain error's own `code` is safe to keep (it is ours and documented).",
            "**Details in a stable order.** Validators can run in any order, and an API that returns the same errors in a different order returns a different answer: a form shows another first error, a snapshot test flips. Sort by field, then code.",
            "**Details are capped.** A CSV import of 5,000 rows must not produce a 2 MB error body. Keep a fixed maximum and append a marker entry so the client can say \"and more\".",
            "**Pass keys through, copy nothing else.** The formatter does not trim, reword or translate message keys, and it never copies the rejected `value` into a detail: a validation error on a password field would otherwise send the password back into responses and logs.",
        ]),
        h3("Where the trace id comes from"),
        p("The trace id must be known before any code runs, so that every log line of the request carries it. Read the W3C Trace Context `traceparent` header when a gateway or the client sent one (`00-<32 hex trace id>-<16 hex span id>-<flags>`), otherwise create a new id, and keep it in a per-request context that the logger and the formatter both read. If you already run OpenTelemetry, use the active span's trace id instead of parsing the header yourself. Course B3 called the same idea a correlation id; naming it `traceId` and using the trace context format lets the id you show a learner open the distributed trace, not only the log."),
        h3("When not to"),
        bullets([
            "**Not one shape for success bodies.** The contract is for errors. Wrapping every success in `{ data, error: null }` adds nothing that the status code does not already say.",
            "**Not details for everything.** A 409 \"already enrolled\" has no field to point at; `details` is empty. Do not move the explanation of the error into details to look thorough.",
            "**Not a server-side translation table first.** If you only have one client language, keys still cost little and keep the door open; but do not build a translation service on the API just to fill `message`.",
        ]),

        challenge("chal_quiz_adp_131"),

        h2("4. Worked example: request context, validation and one filter"),
        p("A middleware creates the request context before any handler runs. `AsyncLocalStorage` keeps it available for the rest of the request without passing it through every function:"),
        code("typescript", `
// common/request-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export type RequestContext = { traceId: string; path: string };
export const requestContext = new AsyncLocalStorage<RequestContext>();

const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const match = TRACEPARENT.exec(req.header("traceparent") ?? "");
  const valid = match !== null && !/^0+$/.test(match[1]);           // all zeros is invalid in the spec
  const traceId = valid ? match[1] : randomBytes(16).toString("hex");
  requestContext.run({ traceId, path: req.path }, next);
}`, "request-context.ts"),
        p("Validation stops producing its own shape. The `ValidationPipe` gets an `exceptionFactory` that throws a `ValidationFailed` with flat field errors. Note what it does not copy: class-validator's `ValidationError` carries the rejected `value`, and it stays out:"),
        code("typescript", `
// main.ts
app.use(requestContextMiddleware);
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) => new ValidationFailed(flatten(errors)),
}));
app.useGlobalFilters(new ErrorContractFilter());

function flatten(errors: ValidationError[], parent = ""): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? \`\${parent}.\${e.property}\` : e.property;
    const own = Object.keys(e.constraints ?? {}).map((rule) => ({ field, code: rule, message: \`validation.\${rule}\` }));
    return [...own, ...flatten(e.children ?? [], field)];       // nested DTOs: "lessons.0.title"
  });
}`, "main.ts"),
        p("And one filter for everything. `@Catch()` with no argument receives every exception, including the framework's own; the payments filter is deleted and `PaymentError` becomes an `AppError` with code `CARD_DECLINED` and status 402:"),
        code("typescript", `
// common/error-contract.filter.ts
@Catch()
export class ErrorContractFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const ctx = requestContext.getStore() ?? { traceId: "", path: http.getRequest<Request>().path };
    const thrown = exception instanceof HttpException
      ? new HttpError(exception.getStatus(), \`http.\${exception.getStatus()}\`)   // a key, not Nest's English text
      : exception;
    const { status, headers, body } = formatError(thrown, ctx);

    if (status >= 500) {
      this.logger.error({ traceId: body.traceId, path: ctx.path, err: exception });   // the full story, here only
    }
    http.getResponse<Response>().status(status).set(headers).json(body);  // json() keeps the Content-Type set before it
  }
}`, "error-contract.filter.ts"),
        p("The same three requests from section 2 now answer in one shape, and the mobile app's handler reads `code` to decide and `message` to show:"),
        code("bash", `
{"type":"https://api.codedev.test/problems/card-declined","title":"Payment Required","status":402,
 "code":"CARD_DECLINED","message":"payment.card_declined","details":[],
 "traceId":"0af7651916cd43dd8448eb211c80319c","instance":"/orders"}`, "terminal"),
        callout("warning", "Changing the error format is a breaking change",
            "Clients that parse the old shapes stop working the day you switch. For the payments body, CodeDev kept the old error member next to the new ones for two app releases and watched the API logs for clients that still sent the old app version before removing it. Module 4 shows how to plan and detect such changes."),

        h2("5. How to verify it"),
        bullets([
            "**Validate every error your e2e suite sees.** Add a response hook to the e2e tests that checks each 4xx and 5xx body against the contract's JSON Schema (with Ajv, for example). An endpoint that answers in another shape fails the suite, whoever wrote it.",
            "**The SECRET test.** Make a fake repository throw `new Error(\"SECRET connect 10.0.3.7:5432\")` and assert that the response body contains neither `SECRET` nor `10.0.3.7`, and that the log line with the same `traceId` contains both.",
            "**Send the same invalid request twice.** Snapshot the two bodies; they must be byte for byte identical. Then send a CSV with 500 bad rows and check the body has exactly the maximum number of details plus the marker.",
            "**Follow a trace id.** Send a request with your own `traceparent` header, read `traceId` from the error body and search the logs for it: every line of that request should match, and only those.",
            "**Watch the client metric.** After the release, the share of banners reading \"undefined\" should drop to zero; group the remaining banners by `code` to see which errors learners hit most.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**A filter per module.** `@Catch(PaymentError)` next to `@Catch(DomainError)` and the framework default is how the incident started. Spot it with `grep -rn \"@Catch(\"`: there should be one global `@Catch()`.",
            "**Codes derived from messages.** `code: message.toUpperCase().replace(/ /g, \"_\")` changes the code whenever someone fixes a typo in the text. Spot it in code that builds `code` from a string instead of declaring it as a constant.",
            "**Interpolated messages.** `\"You are already enrolled in crs_42\"` as `message` cannot be translated and breaks grouping. Spot it in `message` values that contain ids or numbers; put them in their own members instead.",
            "**Unordered or unbounded details.** Spot it with the twice-sent request and the 500-row CSV from section 5.",
            "**Echoing the rejected value.** `{ ...validationError }` copies `value`, and with it passwords and tokens. Spot it by searching filters and exception factories for object spreads of validation errors.",
        ]),

        h2("7. Write the formatter"),
        p("The exercise is the heart of the filter: `formatError(thrown, ctx)` receives whatever was thrown and the request context, and returns the status, the headers and the body of the contract. The test runner throws real `AppError`, `ValidationFailed`, `HttpError` and `Error` objects, plus strings, `null` and objects that only look like domain errors, and compares every member of the body:"),
        code("typescript", `
function formatError(thrown: unknown, ctx: RequestContext): ErrorResponse {
  // 1. where did it come from? status, code, message, raw details
  // 2. is it the server's fault? then say nothing internal
  // 3. details: clean, sort, cap; then type, title, traceId, instance
}`),
        challenge("chal_coding_adp_132"),

        h2("8. Summary"),
        bullets([
            "One error contract for the whole API: RFC 9457 problem+json extended with a stable `code` to branch on, a `message` key to translate, `details` for field errors and a `traceId` that leads to the logs and the trace.",
            "One formatter produces it for every error, including the framework's and old modules': a second filter is a second contract, and clients pay for every shape you add.",
            "The formatter protects clients and the server: 5xx errors carry no internal text, details are sorted, capped with a marker and never echo values, and message keys pass through unchanged.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9457, Problem Details for HTTP APIs - members, extension members and the application/problem+json media type - rfc-editor.org/rfc/rfc9457",
            "W3C Trace Context - the traceparent header and trace id format - w3.org/TR/trace-context",
            "NestJS documentation: Exception filters and Validation (exceptionFactory) - docs.nestjs.com",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every error code your API can return and write one line per code: status, message key, whether it has details, and what the client should do. Publish the list as the page behind each problem type URI, and add the contract JSON Schema check to your e2e suite."),
    ],
});
