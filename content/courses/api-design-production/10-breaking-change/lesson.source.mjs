// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-4-1",
    title: "Ship a breaking change safely: the field the mobile app still reads",
    slug: { _type: "slug", current: "ship-a-breaking-change-safely-mobile-app-field" },
    description:
        "A release that \"renamed rating to averageRating and cleaned up the course DTO\" crashes the Android app 3.8 on every catalog screen, while every API dashboard stays green. Work through the incident like the API on-call: read the release notes, the mapper diff, the crash reports, the API log by app version and the OpenAPI diff, rule out \"the app has a parsing bug\" and \"ship a new app today\", fix it with expand/contract (old and new fields side by side, Deprecation and Sunset headers, removal after a sunset date) and prove it with contract tests against the old client's schema.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer on call for the CodeDev API",
        problem:
            "Thursday 22 Oct, 16:58. The mobile team posts in the incident channel: since 16:44 the Android app crashes as soon as a learner opens the catalog or a course page. Crash reports come only from app 3.8, which is still 40% of Android users; 3.9 and the web app work. The API dashboards for https://api.codedev.test show nothing unusual: no 5xx, normal latency. The only API change today was release 2026.10.22-2 at 16:40, whose notes say \"renamed `rating` to `averageRating`, cleaned up the course DTO\". The Play Store minimum-version gate cannot force 3.8 users to update for another two weeks.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario. The change looked harmless in review: one rename the product team had asked for, plus some tidying of field names that had always bothered the team. The web app was updated in the same pull request, the tests were green, and the deploy went out at 16:40. Fourteen minutes later the first crash reports arrived."),
        p("Before you change anything, collect the evidence. On a breaking-change incident it tells you two things you need for the fix: **which clients** are affected, and **exactly which parts** of the contract they depend on. Guessing either one gives you a fix that helps one client and breaks another."),

        h2("2. The evidence pack"),
        p("Five pieces of evidence were collected in the first twenty minutes. The quiz below refers to them by letter."),
        h3("A. The release notes"),
        code("text", `
CodeDev API 2026.10.22-2 (Thu 22 Oct, 16:40)
- Course DTO cleanup: renamed \`rating\` to \`averageRating\` and \`instructor\` to \`teacher\`;
  \`price\` is now a decimal string.
- Web app 2026.10.22-2, deployed together with the API, reads the new fields.
- Android 3.9.0 (released 15 Oct) already accepts both the old and the new names.`, "#api-releases"),
        h3("B. The mapper diff"),
        code("text", `
 export function toCourseDto(row: CourseRow): CourseDto {
   return {
     id: row.id,
     slug: row.slug,
     title: row.title,
-    rating: row.ratingAvg,
+    averageRating: row.ratingAvg,
     ratingCount: row.ratingCount,
-    instructor: { id: row.instructorId, name: row.instructorName },
+    teacher: { id: row.instructorId, name: row.instructorName },
-    price: row.priceVnd,
+    price: String(row.priceVnd),
   };
 }`, "src/courses/course.mapper.ts, PR #509 \"courses: clean up the course DTO\""),
        h3("C. Crash reports from the Android app"),
        code("text", `
Fatal Exception: kotlinx.serialization.MissingFieldException
Fields [rating, instructor] are required for type with serial name
'dev.codedev.api.CourseDto', but they were missing at path: $.items[0]
  at dev.codedev.catalog.CatalogRepository.load(CatalogRepository.kt:58)

App 3.8.2 (382): 1,912 crashes, 1,340 users      App 3.9.0 (390): 0 crashes`, "Crash reporting, CodeDev Android, since Thu 22 Oct 16:44"),
        p("The mobile team also sent the model that 3.8 decodes every course into:"),
        code("text", `
// app 3.8, dev/codedev/api/CourseDto.kt
@Serializable
data class CourseDto(
    val id: String,
    val slug: String,
    val title: String,
    val rating: Double?,          // nullable, but no default value: the key is required
    val ratingCount: Int,
    val instructor: InstructorDto,
    val price: Long,
)

private val json = Json { ignoreUnknownKeys = true }`, "Android 3.8 model (Kotlin)"),
        h3("D. API log by app version"),
        code("text", `
GET /v1/courses*, Thu 22 Oct 16:40-17:20, grouped by X-App-Version
client              requests   2xx      same device again within 60 s
web 2026.10.22-2      48,210   99.98%    3%
android 3.9.0         21,804   99.97%    4%
android 3.8.2         14,390   99.98%   71%`, "API gateway access log"),
        h3("E. The OpenAPI diff"),
        code("text", `
GET /v1/courses 200  items[].rating         required property removed   BREAKING
GET /v1/courses 200  items[].instructor     required property removed   BREAKING
GET /v1/courses 200  items[].price          type integer -> string      BREAKING
GET /v1/courses 200  items[].averageRating  property added              safe
GET /v1/courses 200  items[].teacher        property added              safe
(the same 5 changes on GET /v1/courses/{slug})
Job result: 3 breaking changes - marked as warning, pipeline continued.`, "CI job \"api-contract\" (allow_failure: true) on release/2026.10.22-2"),

        h2("3. Reading the evidence"),
        p("Write one line per piece of evidence, about what it **shows**:"),
        bullets([
            "**A** names three changes, not one: two renames and a type change. It also lists the clients: the web app moved with the API, Android 3.9 tolerates both shapes, and nothing is said about 3.8.",
            "**B** confirms all three in code. Nothing is added next to the old names: the old fields are simply gone, and `price` keeps its name but changes type.",
            "**C** shows the failure is in the **client**, while decoding: kotlinx.serialization stops because two keys it was told are required are missing. The model explains why: `rating` may be `null`, but without a default value its key must be present; `instructor` must be an object. `ignoreUnknownKeys = true` is why the **new** fields did no harm.",
            "**D** shows the server answered every client with 2xx. The only difference for 3.8 is the 71% of devices that come back within a minute: the crash-and-relaunch loop of real users. Error-rate alerts on the API will never fire for this kind of incident.",
            "**E** shows the CI job saw all three breaking changes before the deploy, and was configured to report them as a warning.",
        ]),

        h2("4. Hypothesis: the API broke a contract that 3.8 still relies on"),
        p("Put the facts in order. The OpenAPI document published before the release said that every course has a required `rating` (number or null), a required `instructor` object and an integer `price`. Android 3.8 was generated from that contract and decodes exactly that. Release 2026.10.22-2 removed two required properties and changed a type, the web app was updated in the same deploy, and 3.9 had been prepared in advance. 3.8 was the one client nobody updated, and it cannot be updated by deploying."),
        p("A good hypothesis explains all the evidence: the crash only on 3.8 (C), the green dashboards (D), the time (16:44, four minutes after the deploy in A) and the CI warning nobody read (E). This one does. Note that it names **all three** changes: the exception lists two missing fields, and the type change of `price` breaks the contract even if one particular decoder happens to accept a quoted number."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"The app has a JSON parsing bug, it should treat missing fields as null.\"** The contract said these fields are required, and 3.8 trusted the contract. That is what a contract is for: a client that has to defend against any field disappearing at any time is a client with no contract. And even a perfect app fix only reaches users who install it.",
            "**\"Roll forward: publish app 3.10 today.\"** It helps nobody who is still on 3.8, and the evidence says the team cannot make them move for two weeks. Mobile, desktop and partner integrations are clients you do not deploy: old versions stay in use for months.",
            "**\"Revert the API.\"** Tempting, and it fixes 3.8. But A says the web app now reads `averageRating`, `teacher` and the string price, so a revert of the API alone breaks the largest client in D. A revert is only safe if every client that moved with the release moves back with it.",
        ]),
        callout("info", "Hyrum's law in one incident",
            "With enough users, every observable behaviour of an API becomes something somebody depends on. Here it was not even subtle: 3.8 depended on documented, required fields. In other incidents it is a field order, a number that happened to be an integer, or a list that happened to be sorted. Treat everything a client can see as part of the contract until you have evidence that nobody reads it."),

        h2("5. The fix: expand, migrate, contract"),
        p("Expand/contract (also called parallel change) turns one breaking change into a sequence of changes that are each compatible with every client in use:"),
        numbered([
            "**Expand.** The response carries the old fields with their old types **and** the new fields. `rating` and `averageRating` hold the same value; `instructor` and `teacher` hold the same object. A field cannot have two types, so a type change always becomes a **new name**: `price` stays an integer and the string form goes into `priceAmount`. The web app, deployed with the API, switches from `price` to `priceAmount` in the same deploy.",
            "**Announce.** Mark the old fields `deprecated: true` in the OpenAPI document, write the changelog entry, and send `Deprecation` and `Sunset` headers on every course response so that clients and their logs see it too.",
            "**Migrate.** Ship app 3.10 reading the new names, raise the minimum version when the two weeks are over, and watch the API log by `X-App-Version` until 3.8 traffic is below the agreed threshold.",
            "**Contract.** After the sunset date, and only when the logs agree, remove the old fields, their contract test and the headers in one pull request.",
        ]),
        p("The two headers come from two RFCs. `Sunset` (RFC 8594) carries the date after which the deprecated part is expected to stop working, as an HTTP-date. `Deprecation` (RFC 9745) carries the date when it was deprecated, as a structured date: `@` followed by Unix seconds. Older gateways and libraries, written against earlier drafts, send `Deprecation: true` instead; check which form your clients' tooling understands. For this incident the team chose:"),
        code("text", `
HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: @1792746000
Sunset: Mon, 30 Nov 2026 00:00:00 GMT
Link: <https://api.codedev.test/docs/changes/2026-10-course-dto>; rel="deprecation"`, "GET /v1/courses/api-design-production after the hotfix"),
        p("`@1792746000` is Friday 23 Oct, 09:00 UTC, the morning the change was announced. The sunset date is not a guess: it is after the two weeks the minimum-version gate needs, plus time for stragglers, and the team agreed that the contract step also needs the logs to show 3.8 below 1% of course traffic for seven days. A date without a usage check removes fields from people still using them; a usage check without a date never ends."),
        p("In the OpenAPI document, the expand step is all additions plus a `deprecated` flag, which is exactly why it is compatible:"),
        code("yaml", `
CourseDto:
  type: object
  required: [id, slug, title, rating, averageRating, ratingCount,
             instructor, teacher, price, priceAmount]
  properties:
    rating:
      type: [number, "null"]
      deprecated: true
      description: Use averageRating. Removed after 2026-11-30.
    averageRating:
      type: [number, "null"]
    instructor:
      $ref: "#/components/schemas/Person"
      deprecated: true
      description: Use teacher. Removed after 2026-11-30.
    teacher:
      $ref: "#/components/schemas/Person"
    price:
      type: integer
      deprecated: true
      description: Price in dong. Use priceAmount. Removed after 2026-11-30.
    priceAmount:
      type: string
      pattern: "^[0-9]+$"
      description: Price in dong as a decimal string.`, "openapi.yaml (OpenAPI 3.1), course schema after the hotfix"),
        p("In NestJS the headers belong to the routes, not to the mapper: an interceptor on the courses controller sets them on every course response, so no handler can forget them. The values come from configuration, so the dates live in one place:"),
        code("typescript", `
// src/courses/deprecation.interceptor.ts
@Injectable()
export class CourseDtoDeprecationInterceptor implements NestInterceptor {
  constructor(private readonly config: DeprecationConfig) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader("Deprecation", this.config.courseDto.deprecation); // "@1792746000"
    res.setHeader("Sunset", this.config.courseDto.sunset);           // "Mon, 30 Nov 2026 00:00:00 GMT"
    res.setHeader("Link", \`<\${this.config.courseDto.notice}>; rel="deprecation"\`);
    return next.handle();
  }
}

// src/courses/courses.controller.ts
@Controller("v1/courses")
@UseInterceptors(CourseDtoDeprecationInterceptor)
export class CoursesController { /* ... */ }`, "NestJS interceptor (Express adapter)"),
        callout("warning", "Why not version the endpoint?",
            "A `/v2/courses` with the new shape would also have avoided the crash, but it does not remove the work: /v1 still has to serve 3.8 until the same sunset date, and now two routes, two sets of tests and two documents have to be kept in step. For renames and type changes of a few fields, expand/contract inside one version is cheaper. Lesson 4.3 compares the versioning options."),

        challenge("chal_quiz_adp_411"),

        h2("6. The challenge: the hotfix"),
        p("The challenge gives you the mapper as it shipped in 2026.10.22-2 and the function that should build the deprecation headers. Make every course response work for both clients, and send the headers by the rule in the description, including the cases where no sunset date has been decided yet and where the proposed date is too early for the 3.8 users."),
        p("The test runner plays both clients: it checks every response against what app 3.8 decodes and against what the web app decodes, field by field, over catalogs of up to a few hundred courses. Run the starter first: its output is the same evidence as the crash report, as a list of failing courses."),
        challenge("chal_coding_adp_412"),

        h2("7. How to verify the fix"),
        p("\"The app opens on my test phone\" checks one version on one course. Verify with checks that cover every client and every response:"),
        bullets([
            "**Contract tests per client.** Keep a JSON Schema of what each client in use actually decodes: write it from the 3.8 model, or export it from the OpenAPI version 3.8 was generated from, and store it in the repo (`contracts/android-3.8/course.schema.json`). Validate real responses of the course endpoints against it in CI, next to the current schema. On 2026.10.22-2 the 3.8 schema fails on every course; after the hotfix both pass.",
            "**The OpenAPI diff, blocking.** The job in E saw the problem and was ignored. After the hotfix the diff against the last release shows only additions and `deprecated` flags; make the job fail the pipeline on breaking changes (lesson 4.2).",
            "**Production after the deploy.** Crash reports for 3.8 drop to zero, and the \"same device again within 60 s\" column for 3.8 goes back to the level of the other clients.",
            "**The headers.** `curl -sI https://api.codedev.test/v1/courses/api-design-production` shows `Deprecation`, `Sunset` and `Link` on every course route.",
        ]),
        code("typescript", `
// test/contract/courses.contract.spec.ts (Jest + Ajv 2020-12, against the app in memory)
import Ajv2020 from "ajv/dist/2020";
import request from "supertest";
import android38 from "../../contracts/android-3.8/course.schema.json";
import web from "../../contracts/web/course.schema.json";

const ajv = new Ajv2020({ allErrors: true });
const clients = { "android 3.8": ajv.compile(android38), web: ajv.compile(web) };
// app: the Nest application created in beforeAll with seeded courses (one without reviews, one free)

it.each(Object.entries(clients))("every course response decodes for %s", async (_, validate) => {
  const res = await request(app.getHttpServer()).get("/v1/courses?limit=100").expect(200);
  for (const course of res.body.items) {
    expect(validate(course) ? [] : validate.errors).toEqual([]);
  }
});`, "Contract test for every client in use"),

        h2("8. Common mistakes when changing a response"),
        bullets([
            "**Calling a rename a cleanup.** A rename is a removal plus an addition, and the removal is breaking. Spot it: in the diff, a line removed from a response mapper or DTO with a similar line added.",
            "**Changing a type in place.** `price` from integer to string, an id from number to string, a date from a timestamp to ISO text: one field cannot serve both types. Spot it: the OpenAPI diff reports \"type changed\"; the fix is always a new field name.",
            "**Updating the clients you deploy and forgetting the ones you do not.** The web app moves with the API; mobile apps, partner integrations and scripts do not. Spot it: group the API log by client version before and after the change, and list every version with real traffic.",
            "**Removing the old field on a date alone.** A sunset date is a promise to clients, not proof they have moved. Spot it: the contract step has no query on the API log attached; require one that shows the old clients below the agreed threshold.",
            "**Reporting breaking changes without blocking them.** E existed and nobody read it. Spot it: a contract job with `allow_failure: true`; make it block and give real exceptions an explicit, reviewed override.",
        ]),

        h2("9. Summary"),
        numbered([
            "A breaking response change shows up as client crashes and green API dashboards. Read the crash reports, the log by client version and the contract diff together to find which clients break and which fields they depend on.",
            "Rule out the fixes that only help one client: blaming the app, rolling forward a mobile app, reverting the API while the web app already moved.",
            "Expand/contract: serve old and new fields side by side (a type change gets a new name), announce with `deprecated`, `Deprecation` and `Sunset`, remove after the sunset date and a usage check, and keep a contract test per client until then.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 8594: The Sunset HTTP Header Field - rfc-editor.org/rfc/rfc8594",
            "RFC 9745: The Deprecation HTTP Response Header Field - rfc-editor.org/rfc/rfc9745",
            "OpenAPI Specification 3.1.0, Schema Object (deprecated, type arrays) - spec.openapis.org/oas/v3.1.0",
            "kotlinx.serialization guide: optional and required properties, ignoreUnknownKeys",
        ]),
        callout("tip", "Self-practice (not graded): write the deprecation notice and timeline",
            "Write the notice the team posts in the changelog and sends to the mobile team and API partners: what changes (each old field and its replacement, including why price gets a new name), from when the old fields are deprecated, the sunset date, how a client can tell it is affected (the Deprecation and Sunset headers, the OpenAPI deprecated flags), and where to ask. Add a timeline with dates: hotfix, announcement, app 3.10 release, minimum-version change, the usage check on the API log and its threshold, and the contract pull request. For every date, name the evidence that has to be true before the step happens."),
    ],
});
