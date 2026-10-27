// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-1-1",
    title: "Resources, methods & URLs that last",
    slug: { _type: "slug", current: "resources-methods-urls-that-last" },
    description:
        "An older admin app saved courses with PUT and erased the prerequisites of 14 courses it did not know about, and renaming a course broke every mobile deep link because the API addressed courses by slug. Learn to model the CodeDev API as resources with stable ids, decide whether enrollments are a sub-resource or a top-level resource, design actions such as \"publish\" that are not CRUD, keep the safe and idempotent promises of each method, and choose between PUT (replace) and PATCH with a JSON merge patch (change only what is sent).",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (courses and enrollments)",
        problem:
            "On Monday morning four instructors reported that their courses had lost their prerequisites and their certificate setting over the weekend. The audit log of https://api.codedev.test shows 14 calls to PUT /courses/{id} from admin-app/2.3, each followed by a course with \"prerequisites\": [] and \"certificate\": false. Admin app 2.3 was released before the API added those two fields; its course editor loads a course, lets the instructor fix the title, and sends back the fields it knows. The same week, the mobile team reported that deep links to a renamed course return 404, because GET /courses/{slug} looks the course up by its slug and the slug changes with the title.",
    },

    content: [
        h2("1. The incident: a save that erased what it did not know"),
        p("Admin app 2.3 has a simple course editor. It loads the course, shows a form with the fields it knows, and saves the whole form back:"),
        code("typescript", `
// admin-app 2.3: course editor - written before "prerequisites" and "certificate" existed
type CourseForm = { title: string; description: string; level: "beginner" | "intermediate" | "advanced"; price: number };

async function saveCourse(id: string, form: CourseForm) {
  await api.put(\`/courses/\${id}\`, form);   // send the form as the course
}`, "admin-app/src/courses/save-course.ts"),
        p("The API implements `PUT` the way HTTP defines it: the body is the complete new state of the course. A field that is not in the body is reset to its default. When API release 2.4 added `prerequisites` and `certificate`, every older client that used `PUT` became a client that clears them on every save. Nobody changed the admin app; its meaning changed under it."),
        p("The second report has the same root: a URL that does not last. The API looks courses up by slug (`/courses/http-basics`), and the slug is derived from the title. When the instructor renamed the course to \"HTTP Fundamentals\", the slug became `http-fundamentals`, and every link the mobile app had stored, shared or cached started to answer 404."),

        h2("2. Reproduce it and read the evidence"),
        p("Read the course, save it the way admin app 2.3 does, and read it again. Run this against a local API with seed data, never against production:"),
        code("bash", `
curl -s https://api.codedev.test/courses/crs_42 -H "Authorization: Bearer $ADMIN_TOKEN"
{"id":"crs_42","slug":"http-basics","title":"HTTP Basics","level":"beginner","price":149000,
 "prerequisites":["crs_10"],"certificate":true,"status":"published"}

curl -s -X PUT https://api.codedev.test/courses/crs_42 -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"HTTP Fundamentals","description":"...","level":"beginner","price":149000}'
{"id":"crs_42","slug":"http-fundamentals","title":"HTTP Fundamentals","level":"beginner","price":149000,
 "prerequisites":[],"certificate":false,"status":"published"}`, "terminal"),
        p("The response to the `PUT` already shows the damage: `prerequisites` and `certificate` are back to their defaults, and the slug changed. Then look at how the API is laid out. NestJS prints its route table when it starts:"),
        code("text", `
[RoutesResolver] CoursesController {/courses}:
[RouterExplorer] Mapped {/courses, GET} route
[RouterExplorer] Mapped {/courses/:slug, GET} route
[RouterExplorer] Mapped {/courses/:id, PUT} route
[RouterExplorer] Mapped {/courses/publishCourse, POST} route
[RouterExplorer] Mapped {/courses/:id/enrollments, POST} route
[RoutesResolver] EnrollmentsController {/}:
[RouterExplorer] Mapped {/getUserEnrollments, GET} route
[RouterExplorer] Mapped {/enrollments/:id/delete, POST} route`, "API startup log"),
        p("This table is the API's contract, and it was never designed: it grew one ticket at a time. Courses are addressed by slug in one route and by id in the next. `publishCourse`, `getUserEnrollments` and `delete` put verbs in paths that already have a method. Enrollments are created under a course but listed and deleted somewhere else. Each line works; together they make every client guess."),

        h2("3. Core idea: resources clients can hold on to"),
        p("A resource is something a client refers to across requests: a course, a lesson, a learner's enrollment, the learner's progress on a lesson. Clients store its URL in caches, deep links, push notifications, offline queues and bookmarks. So the first property of a good URL is not elegance; it is that **it still points to the same thing next year**."),
        h3("Identity: ids in URLs, names as attributes"),
        bullets([
            "**Address by an id that never changes** (`/courses/crs_42`). A title, a slug or an email is a value the owner may edit; an id is not. The slug stays a field of the course, and the web app can still show it in its own URLs for search engines.",
            "**Look up by attribute with a query**, not a second path shape: `GET /courses?slug=http-basics` returns a list with zero or one course. Keep old slugs in a history table so the web app can redirect a renamed course instead of showing 404.",
            "**Plural nouns for collections**, the id for one member: `/courses`, `/courses/crs_42`. Lowercase, hyphens between words (`/learning-paths`). Prefixed opaque ids (`crs_`, `enr_`, `usr_`) make logs readable and stop a client from guessing that ids are sequential.",
        ]),
        h3("Sub-resource or top-level: where do enrollments live?"),
        p("An enrollment links a learner and a course. It could live at `/courses/{courseId}/enrollments`, at `/users/{userId}/enrollments`, or at `/enrollments`. Ask three questions:"),
        numbered([
            "**Does it have its own identity?** An enrollment has an id, a status, a purchase and a completion date. Other resources point to it (certificates, refunds). Then it deserves its own URL: `/enrollments/enr_901`.",
            "**Is it always reached through one parent?** Enrollments are listed per learner (\"my courses\") and per course (\"who is enrolled\" for the instructor). Two parents with equal claims is the sign of a top-level resource with filters: `GET /enrollments?courseId=crs_42`.",
            "**Would nesting add a check you need?** `/courses/{courseId}/lessons` is a good sub-resource: a lesson belongs to exactly one course, the list is ordered within it, and the path makes \"lessons of this course\" one query. Nest one level, only for ownership.",
        ]),
        p("For CodeDev that gives `POST /enrollments`, `GET /enrollments/{id}`, `GET /enrollments?courseId=...` for instructors, and the convenience alias `GET /me/enrollments` for the signed-in learner. `/me` is not a verb: it is a resource whose identity is the caller, and it saves every client from putting its own user id in URLs."),
        h3("Actions that are not CRUD: publish"),
        p("Publishing a course is not \"set status to published\". It checks that the course has lessons, a price and a cover, stamps `publishedAt`, puts it in search and notifies the learners on the wait list. Three designs are common:"),
        bullets([
            "**`PATCH /courses/{id}` with `{ \"status\": \"published\" }`.** Fine when the change really is a field with no rules or side effects. Here it hides a workflow inside an update: every `PATCH` handler must now notice a status change and run the publishing rules, and an admin form that resends `status` can trigger them by accident.",
            "**`POST /courses/{id}/publish`.** An action sub-resource: one URL, one rule set, one permission (`course:publish`), and the method says that something happens. A real action earns a verb in the path. This is what CodeDev uses.",
            "**`POST /courses/{id}/publications`.** Model the action as a resource when you need its history: who published, when, which version. More to build; worth it when the audit trail is a requirement.",
        ]),
        p("Make the action idempotent by design even though it uses `POST`: publishing an already published course changes nothing and answers `200` with the course. Then a retried publish after a timeout is harmless, which is exactly what a client needs when the network is unreliable."),
        h3("Safe and idempotent: promises the route table makes"),
        p("RFC 9110 defines `GET`, `HEAD` and `OPTIONS` as **safe** (the client asks for no change) and `PUT` and `DELETE`, plus the safe methods, as **idempotent** (sending the request twice has the same intended effect on the server as sending it once). These are promises other software acts on: browsers and link previews prefetch `GET` URLs, proxies and HTTP clients may retry idempotent requests on a dropped connection, and crawlers follow links. Three details matter in API design:"),
        bullets([
            "**Idempotent is about the state, not the response.** A second `DELETE /enrollments/enr_901` may answer `404` or `204`; the enrollment is gone either way. A second `PUT` writes the same values again.",
            "**Logging and metrics are not \"changes\".** A `GET` that writes an access log line is still safe. A `GET /lessons/{id}?markViewed=1` that writes progress is not, and prefetching will mark lessons the learner never opened.",
            "**`POST` and `PATCH` promise nothing.** `POST /enrollments` twice can create two enrollments; a `PATCH` that says \"add 10 points\" adds 20. You can make one specific endpoint idempotent (publish above, idempotency keys in lesson 3.1), but you must say so in its contract.",
        ]),
        h3("PUT replaces, PATCH changes"),
        p("The incident is the difference between these two methods. `PUT` sends **the whole resource as the client knows it**. That is right when the client owns the complete state: a learner's notification settings, the progress record of one lesson. It is risky when the resource grows fields over time and old clients keep saving it, because the server cannot tell \"the client set this to empty\" from \"the client has never heard of it\"."),
        p("`PATCH` sends **only the change**. The simplest patch format is JSON Merge Patch (RFC 7396, media type `application/merge-patch+json`): the patch looks like the resource, and the server merges it with these rules:"),
        bullets([
            "A member present in the patch replaces the current value; a member that is absent is left unchanged.",
            "A member set to `null` removes that member (or resets it to its default, for a field your schema requires).",
            "Objects are merged member by member, recursively. **Arrays are not merged**: a patch with `\"tags\": [\"http\"]` replaces the whole array.",
        ]),
        p("Because of the last two rules, merge patch cannot set a value to `null` or add one element to an array. When you need that, use JSON Patch (RFC 6902, `application/json-patch+json`), whose operations (`add`, `remove`, `replace`, `test`) can do both, or a dedicated sub-resource such as `POST /courses/{id}/tags`."),
        h3("When not to"),
        bullets([
            "**Not a resource per table.** `course_prices` and `course_covers` are storage details. Clients see a course with a price and a cover.",
            "**Not REST for everything.** Grading a submission or exporting a report is a command; a clear `POST /submissions` or `POST /reports` is better than forcing it into a pretend update.",
            "**Not `PATCH` everywhere.** For a small resource the client fully owns and always sends whole (settings, a progress record), `PUT` is simpler and genuinely idempotent.",
        ]),

        h2("4. Worked example: the courses controller after the fix"),
        p("The new route table, as NestJS logs it at startup. Every path is a noun or an id, and the one verb is a real action:"),
        code("text", `
Mapped {/courses, GET} route                 list (filters: ?slug=, ?status=)
Mapped {/courses, POST} route                create -> 201 + Location
Mapped {/courses/:courseId, GET} route
Mapped {/courses/:courseId, PATCH} route     application/merge-patch+json
Mapped {/courses/:courseId/publish, POST} route
Mapped {/courses/:courseId/lessons, GET} route
Mapped {/enrollments, POST} route
Mapped {/enrollments, GET} route             ?courseId= (instructors)
Mapped {/enrollments/:enrollmentId, GET} route
Mapped {/enrollments/:enrollmentId, DELETE} route
Mapped {/me/enrollments, GET} route`, "API startup log"),
        p("The controller keeps the HTTP decisions in one place. `PATCH` refuses any other media type, so a client that sends plain JSON cannot be mistaken for a merge patch:"),
        code("typescript", `
// courses/courses.controller.ts
@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get(":courseId")
  get(@Param("courseId") courseId: string) {
    return this.courses.get(courseId);
  }

  @Patch(":courseId")
  @Header("Accept-Patch", "application/merge-patch+json")
  update(
    @Param("courseId") courseId: string,
    @Headers("content-type") contentType: string | undefined,
    @Body() patch: unknown,
  ) {
    if (!contentType?.startsWith("application/merge-patch+json")) {
      throw new UnsupportedMediaTypeException("Send a JSON merge patch (application/merge-patch+json).");
    }
    return this.courses.update(courseId, patch);
  }

  @Post(":courseId/publish")
  @HttpCode(200)                       // publishing twice is a no-op, not a new resource
  publish(@Param("courseId") courseId: string) {
    return this.courses.publish(courseId);
  }
}`, "courses.controller.ts"),
        p("Express only parses `application/json` by default, so a merge-patch body would arrive as `undefined`. Register the JSON parser for both types in `main.ts`:"),
        code("typescript", `
// main.ts
import { json, urlencoded } from "express";

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
app.use(json({ type: ["application/json", "application/merge-patch+json"], limit: "100kb" }));
app.use(urlencoded({ extended: false }));`, "main.ts"),
        p("The merge itself is a few lines of plain TypeScript, the algorithm from RFC 7396. The service merges, then validates **the result** against the full course schema, so a patch cannot remove a required field or set one the caller may not change (`id`, `ownerId`, `status`):"),
        code("typescript", `
// common/merge-patch.ts
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function applyMergePatch(target: Json, patch: Json): Json {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return patch; // replace
  const isObject = target !== null && typeof target === "object" && !Array.isArray(target);
  const result: { [key: string]: Json } = isObject ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];                       // null removes
    else result[key] = applyMergePatch(result[key] ?? null, value);
  }
  return result;
}

// courses/courses.service.ts
async update(courseId: string, patch: unknown): Promise<Course> {
  const course = await this.repo.get(courseId);                  // throws CourseNotFound
  const editable = pick(course, EDITABLE_FIELDS);                // title, description, level, price, prerequisites, certificate, tags
  const merged = applyMergePatch(editable, patch as Json);
  const changes = await parseCourseEdit(merged);                 // validates the whole result, rejects unknown fields
  return this.repo.save({ ...course, ...changes });
}

async publish(courseId: string): Promise<Course> {
  const course = await this.repo.get(courseId);
  if (course.status === "published") return course;              // same request, same state
  const missing = missingForPublish(course);                     // lessons, price, cover
  if (missing.length > 0) throw new NotReadyToPublish(courseId, missing);
  return this.repo.save({ ...course, status: "published", publishedAt: this.clock.now() });
}`, "merge-patch.ts, courses.service.ts"),
        p("Admin app 2.3 cannot be fixed overnight on every instructor's machine, so the API keeps `PUT /courses/{id}` for it during a deprecation period, but implements it safely: fields the request does not contain keep their current values, and the response carries a `Deprecation` header. That is a compatibility shim for old clients, not a design to copy; lesson 4.1 shows how to retire it."),

        challenge("chal_quiz_adp_111"),

        h2("5. How to verify it"),
        bullets([
            "**Unit test the merge with the RFC's own examples.** RFC 7396 lists target, patch and result triples in its appendix; put them in a table test. Add the incident: a patch with only `title` must leave `prerequisites` and `certificate` exactly as they were.",
            "**Replay the incident end to end.** Send admin app 2.3's body with `PATCH` and `Content-Type: application/merge-patch+json`, then `GET` the course: the prerequisites are still `[\"crs_10\"]`. Send the same body with `Content-Type: application/json`: the answer is `415 Unsupported Media Type` and nothing changed.",
            "**Lint the route table in a test.** Generate the OpenAPI document with `SwaggerModule.createDocument` in an e2e test and check every path segment: an `{id}` parameter, a lowercase plural noun, `me`, or an action from a short allowlist (`publish`, `archive`). A new `getUserEnrollments` fails the build instead of reaching a client.",
            "**Rename a course in staging and follow an old link.** The id-based API URL still answers `200`; the web app's slug URL redirects from the slug history.",
        ]),
        code("typescript", `
// test/routes.e2e-spec.ts - every new path follows the naming rules
const ACTIONS = new Set(["publish", "archive"]);
const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());

for (const path of Object.keys(document.paths)) {
  for (const segment of path.split("/").filter(Boolean)) {
    const ok = /^\\{\\w+\\}$/.test(segment) || segment === "me" || ACTIONS.has(segment) || /^[a-z]+(-[a-z]+)*s$/.test(segment);
    expect({ path, segment, ok }).toEqual({ path, segment, ok: true });
  }
}`, "routes.e2e-spec.ts"),

        h2("6. Common mistakes"),
        bullets([
            "**`PUT` with a body the client built from an old form.** Every field added later is silently reset by every old client. Spot it by searching clients for `put(` and comparing the fields they send with the current schema, or by an audit log where fields change on updates that did not mention them.",
            "**Natural keys in URLs.** Slugs, emails and titles change; links that contain them break. Spot it in route definitions with `:slug`, `:email` or `:name`, and in 404s whose path matches an old value in the database.",
            "**Verbs for things the method already says.** `POST /enrollments/{id}/delete`, `GET /getUserEnrollments`. Clients cannot guess them and proxies cannot reason about them. Spot them with the route lint above.",
            "**Side effects on `GET`.** `GET /lessons/{id}?markViewed=1` is triggered by prefetching, link previews and crawlers. Spot it in services called from `@Get()` handlers that write to the database, and in progress rows for lessons the learner never opened.",
            "**Treating merge patch arrays as a merge.** `{ \"tags\": [\"http\"] }` replaces all tags. Spot it in a client that sends only the new tag and in bug reports of \"my other tags disappeared\".",
        ]),

        h2("7. Summary"),
        bullets([
            "URLs are a contract clients keep for years: address resources by stable ids, use plural nouns, look up other attributes with query parameters, and nest only for real ownership; enrollments, with two parents and their own identity, are top-level.",
            "Methods carry promises that browsers, proxies and retries act on: keep `GET` free of side effects, use a verb in the path only for a real action such as `publish`, and design that action to be harmless when repeated.",
            "`PUT` replaces the whole resource and turns every old client into one that erases new fields; edits from forms belong in `PATCH` with a JSON merge patch, validated as a whole after merging, remembering that `null` removes and arrays are replaced.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics: section 9.2 (safe and idempotent methods), 9.3.4 (PUT), 15.5.16 (415 Unsupported Media Type) - rfc-editor.org/rfc/rfc9110",
            "RFC 5789, PATCH Method for HTTP; RFC 7396, JSON Merge Patch; RFC 6902, JavaScript Object Notation (JSON) Patch",
            "NestJS documentation: Controllers (route decorators, @HttpCode, @Header) - docs.nestjs.com/controllers",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Print your own API's route table and sort every line into three groups: resource, action, or naming accident. For each accident, write the resource-style replacement and how long the old route must stay for existing clients. Then add the route lint test and the RFC 7396 example table to your test suite."),
    ],
});
