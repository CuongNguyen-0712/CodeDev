// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-2-2",
    title: "Thin controllers: map the request, call the service, map the response",
    slug: { _type: "slug", current: "thin-controllers-map-request-call-service-map-response" },
    description:
        "GET /users/:id/profile returned a whole users row, password hash included, and an enrollment rule copied into two controllers drifted until the web app and the CSV import disagreed. Learn the three jobs of a NestJS controller (turn the request into typed input, call one service method, turn the result into a response DTO), why business rules belong in the service, how to parse query strings without guessing, where the learner id must come from, and how to build responses from an allow-list.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (users and enrollments modules)",
        problem:
            "A learner reported through the security contact that GET https://api.codedev.test/users/u_1/profile, the endpoint behind public profile pages, returns the user's email, role, internal support notes and an argon2 passwordHash. The same week, support ticket #5520 showed that a beta tester could enroll in a beta course from the web app but not through the staff CSV import: the rule \"published, or beta for beta testers\" was written in two controllers and only one copy had been updated. Both bugs come from controllers that do more than map HTTP.",
    },

    content: [
        h2("1. The incident: a controller that returns the database"),
        p("This is the report that reached the security contact, with the response the learner captured:"),
        code("bash", `
curl -s https://api.codedev.test/users/u_1/profile | jq

{
  "id": "u_1",
  "email": "ana@codedev.test",
  "displayName": "Ana",
  "avatarUrl": "https://cdn.codedev.test/avatars/u_1.png",
  "passwordHash": "$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA",
  "role": "learner",
  "internalNotes": "refund issued 2026-09-12",
  "createdAt": "2026-03-14T08:30:00.000Z"
}`, "terminal"),
        p("A slow, salted hash is not a password, but it is exactly what an attacker needs to start an offline guessing attack, and the email and support notes are personal data that a public page has no reason to show. The handler that produced it is three lines long:"),
        code("typescript", `
// users/users.controller.ts - the version that shipped
@Get(":id/profile")
async getProfile(@Param("id") id: string) {
  return this.usersRepository.findOneBy({ id });   // the whole row, as an entity
}`, "users.controller.ts"),
        p("Nobody decided to publish `passwordHash`. The controller returned whatever the database row contained, so the response shape was decided by the table, and every column added later would have been published too."),

        h2("2. Read the evidence: two copies of one rule"),
        p("The second bug needs a different kind of evidence. Search the code for the enrollment rule:"),
        code("bash", `
grep -rn "status !== \\"published\\"" src/

src/enrollments/enrollments.controller.ts:41:  if (course.status !== "published" && !(course.status === "beta" && user.isBetaTester)) {
src/admin/import.controller.ts:58:            if (course.status !== "published") {`, "terminal"),
        p("Two controllers, two versions of the same rule. When beta courses were introduced, the web controller was updated and the import controller was not, because nobody knew the copy existed. The tests did not catch it either: each controller was tested on its own, and both tests passed."),
        p("Both bugs have the same cause. The controllers did work that is not about HTTP: one decided what a user looks like to the outside world by not deciding at all, the other held a business rule. A controller that only translates between HTTP and the service has nowhere to hide either problem."),

        h2("3. Core idea: a controller is an adapter"),
        p("A NestJS controller sits between the HTTP world (paths, query strings, headers, status codes, JSON) and your application (services with typed inputs and outputs). Keep it to three jobs:"),
        numbered([
            "**Map the request to typed input.** Read params, query and body, convert strings to the types the service expects (`\"2\"` to `2`), apply defaults and bounds, and take the current user from the authenticated request. Reject what cannot be converted with a 400.",
            "**Call one service method.** The service holds the rules: who may enroll, which courses are visible, how pages are counted. The controller does not branch on business conditions.",
            "**Map the result to a response.** Pick the status code, set headers such as `Location` on a 201, and build a response DTO that names exactly the fields the client may see.",
        ]),
        p("Why this split pays off in a modular monolith:"),
        bullets([
            "**One rule, many entry points.** The web API, the CSV import, a queue consumer and a CLI script all call `EnrollmentsService.enroll()`. A rule in a controller is only enforced for that one entry point.",
            "**Tests without HTTP.** A service method takes a plain object and returns one; its unit test needs a fake repository, not a running server. The controller test then only checks the mapping, with a fake service.",
            "**Response shape is a decision.** A response DTO is an allow-list: a new column stays private until somebody adds it to the DTO on purpose, in a reviewed diff.",
        ]),
        h3("When not to add more"),
        bullets([
            "**Thin is not empty.** Parsing `page`, choosing 201 and building a `Location` header are HTTP jobs; they belong in the controller, not in the service. A service that receives query strings or returns status codes has HTTP leaking into it.",
            "**No mapper framework.** A response DTO is a type plus a function of a few lines next to the controller. You do not need a generic mapping library, an interface per endpoint or a \"presenter layer\" until the same mapping is repeated in several places.",
            "**A trivial endpoint can stay trivial.** `GET /health` returning `{ status: \"ok\" }` does not need a service. Add one when there is a rule or a dependency to put in it.",
        ]),

        h2("4. Worked example: the three handlers"),
        h3("Request mapping: query strings are strings"),
        p("Every value in a query string arrives as a string, or not at all. NestJS ships pipes for the common conversions; `DefaultValuePipe` fills in a missing value and `ParseIntPipe` rejects anything that is not an integer written in digits (\"2.5\", \"abc\" and \"1e3\" are all 400):"),
        code("typescript", `
// courses/courses.controller.ts
@Controller("courses")
export class CoursesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CourseListResponse> {
    if (page < 1) throw new BadRequestException("page must be a positive integer");   // ParseIntPipe accepts -1
    const pageSize = Math.min(limit, 50);                      // a client cannot ask for the whole table

    const { items, total } = await this.catalog.listCourses({ page, limit: pageSize });

    res.setHeader("X-Total-Count", String(total));
    return { items: items.map(toCourseSummary), page, limit: pageSize, total };
  }
}`, "courses.controller.ts"),
        p("Notice what is not here: no filter on `published`, no SQL, no sorting rule. Which courses a learner may see is a catalog rule, so it lives in `CatalogService.listCourses`. The controller's decisions are all about HTTP: defaults, a bound on the page size, and a header."),
        callout("warning", "parseInt and Number guess",
            "parseInt(\"2abc\") is 2 and parseInt(\"2.5\") is 2; Number(\"\") is 0, Number(\"1e3\") is 1000 and Number(\"0x10\") is 16. A request that should be rejected becomes a different request. Check the string first (digits only), then convert."),
        h3("The current user comes from the session"),
        p("An authenticated route already knows who is calling: a guard verified the token and put the user on the request. Read it from there with a small parameter decorator, and never from the body:"),
        code("typescript", `
// auth/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

// enrollments/enrollments.controller.ts
@Post()
async enroll(
  @Body() dto: EnrollDto,                       // validated by the global ValidationPipe (lesson 2.1)
  @CurrentUser() user: AuthUser,
  @Res({ passthrough: true }) res: Response,
): Promise<EnrollmentResponse> {
  const enrollment = await this.enrollments.enroll({ userId: user.id, courseId: dto.courseId });
  res.setHeader("Location", \`/enrollments/\${enrollment.id}\`);
  return toEnrollmentResponse(enrollment);      // POST answers 201 by default in NestJS
}`, "enrollments.controller.ts"),
        p("If the body could carry a `userId`, any learner could enroll (and be billed as) someone else by editing one field. The body says *what* the client wants; the session says *who* is asking."),
        h3("Response mapping: an allow-list"),
        code("typescript", `
// users/dto/profile.response.ts
export type ProfileResponse = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
};

export function toProfileResponse(user: User): ProfileResponse {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    joinedAt: user.createdAt.toISOString(),
  };
}

// users/users.controller.ts
@Get(":id/profile")
async getProfile(@Param("id") id: string): Promise<ProfileResponse> {
  const user = await this.users.getProfile(id);
  if (!user) throw new NotFoundException("user not found");   // lesson 2.3 replaces this with a domain error
  return toProfileResponse(user);
}`, "profile.response.ts"),
        p("The mapping function is boring on purpose. Each public field is written once, by name, and the return type makes the compiler check the shape. `joinedAt` also shows that the response does not have to mirror the table: the API's names are a contract with clients, the column names are not."),
        callout("info", "If you prefer class-transformer for responses",
            "ClassSerializerInterceptor with @Exclude() on passwordHash is a deny-list again: the next sensitive column is public by default. If you use it, use the excludeAll strategy and @Expose() each public field, which turns it into an allow-list."),
        h3("The rule moves into the service"),
        code("typescript", `
// enrollments/enrollments.service.ts
async enroll(input: { userId: string; courseId: string }): Promise<Enrollment> {
  const course = await this.courses.getById(input.courseId);
  const user = await this.users.getById(input.userId);
  if (!canEnroll(course, user)) throw new NotAllowed("enroll in this course");   // one rule, every entry point
  return this.enrollmentsRepo.create(input);
}

function canEnroll(course: Course, user: User): boolean {
  return course.status === "published" || (course.status === "beta" && user.isBetaTester);
}`, "enrollments.service.ts"),
        p("Both the web controller and the import controller now call `enroll()`; the import maps a CSV row to `{ userId, courseId }`, the web controller maps the session and the body. How `NotAllowed` becomes a 403 is the next lesson."),

        challenge("chal_quiz_nmm_221"),

        h2("5. How to verify it"),
        bullets([
            "**Unit test the controller with a fake service.** A fake that records its calls proves the mapping: `?limit=500` calls the service with 50, `?page=abc` answers 400 and makes no call, and the enroll call uses the session user even when the body has a `userId`.",
            "**Assert the exact keys of a response.** `expect(Object.keys(body).sort()).toEqual([\"avatarUrl\", \"displayName\", \"id\", \"joinedAt\"])` fails the day someone returns a new field, unlike a test that only checks that `passwordHash` is absent.",
            "**One end-to-end request per endpoint.** With supertest: `POST /enrollments` returns 201 and `res.headers.location` points at the new resource, and following it returns the same id.",
            "**Let the linter guard the layers.** An ESLint `no-restricted-imports` rule that forbids importing repositories or the ORM client from `*.controller.ts` files keeps the next shortcut out of review.",
        ]),
        code("typescript", `
it("caps the page size and never sends HTTP strings to the service", async () => {
  const catalog = { listCourses: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
  const controller = new CoursesController(catalog as unknown as CatalogService);
  const res = { setHeader: jest.fn() } as unknown as Response;

  await controller.list(1, 500, res);

  expect(catalog.listCourses).toHaveBeenCalledWith({ page: 1, limit: 50 });
  expect(res.setHeader).toHaveBeenCalledWith("X-Total-Count", "0");
});`, "courses.controller.spec.ts"),

        h2("6. Common mistakes"),
        bullets([
            "**Business rules in the controller.** An `if` on course status, plan or role before the service call. Spot it by grepping a rule's condition: more than one hit means more than one version.",
            "**Returning entities.** A handler whose return value is the ORM entity or the repository result. Spot it when a handler has no response type, or when its response contains column names in the database's style.",
            "**Trusting identity from the request body.** `dto.userId` or `?userId=` on an authenticated route. Spot it by searching controllers for `userId` read from `@Body()` or `@Query()`.",
            "**Guessing numbers from strings.** `parseInt(query.page) || 1` turns `\"2abc\"` into page 2 and `\"abc\"` into page 1 without telling the client. Spot it by sending `?page=2.5` and `?page=abc` and expecting 400.",
            "**HTTP leaking into the service.** A service that takes `req`, returns `{ status: 201 }` or throws `ConflictException`. Spot it by imports from `@nestjs/common` exceptions or Express types in `*.service.ts`; the service then cannot be reused by the import or a queue consumer.",
        ]),

        h2("7. Write the controller"),
        p("The challenge gives you `CatalogService`, already written and not to be changed, and an empty controller with three handlers. Requests are plain objects with string query values and an authenticated `user`; responses are `{ status, headers, body }`. The test runner sends requests, prints each response with its JSON keys sorted, and prints the service calls each handler made, so a 400 that still called the service, or a body with one field too many, is visible:"),
        code("typescript", `
class CodeDevController {
  constructor(private readonly service: CatalogService) {}

  listCourses(req: HttpRequest): HttpResponse { /* query strings -> { page, limit, level } -> 200 */ }
  enroll(req: HttpRequest): HttpResponse { /* body + session user -> 201 with Location */ }
  getProfile(req: HttpRequest): HttpResponse { /* params.id -> 200 profile or 404 */ }
}`),
        challenge("chal_coding_nmm_222"),

        h2("8. Summary"),
        bullets([
            "A controller has three jobs: turn the request into typed input (strings checked, then converted; the user from the session), call one service method, and turn the result into a response with the right status and headers.",
            "Business rules live in the service, once, so every entry point (web, import, queue) gets the same behaviour and one unit test covers it.",
            "Build every response from an allow-list (a response DTO and a mapping function), and test the exact set of keys so a new column cannot leak by default.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS documentation: Controllers (docs.nestjs.com/controllers) - route parameters, status codes, library-specific response with passthrough",
            "NestJS documentation: Pipes (docs.nestjs.com/pipes) - ParseIntPipe and DefaultValuePipe",
            "NestJS documentation: Custom route decorators (docs.nestjs.com/custom-decorators) - a @CurrentUser() parameter decorator",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one controller in a project you know and list every line that is not request mapping, a single service call or response mapping. Move each rule into the service with a unit test, add a response DTO with an exact-keys test, and add a no-restricted-imports lint rule that keeps repositories out of controllers."),
    ],
});
