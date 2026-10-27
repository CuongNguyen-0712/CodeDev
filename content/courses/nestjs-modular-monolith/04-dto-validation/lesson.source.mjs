// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-2-1",
    title: "How to validate request DTOs: whitelist, types & enums",
    slug: { _type: "slug", current: "validate-request-dtos-whitelist-types-enums" },
    description:
        "POST /enrollments accepted plan \"PREMIUM\" and the nightly billing job stopped on a row it could not read. Learn why a TypeScript type on @Body() checks nothing at runtime, how a DTO with class-validator decorators and a global ValidationPipe reject malformed requests before they reach a service, which ValidationPipe options to turn on (whitelist, forbidNonWhitelisted, transform) and which one to leave off, and why a validator should reject a bad value instead of repairing it.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API (enrollments module)",
        problem:
            "At 02:00 the billing-renewals job on the CodeDev API stopped with the error Unknown plan \"PREMIUM\" for enrollment e_58213 after processing 1,204 of 3,890 enrollments, so 2,686 premium learners were not renewed that night. The enrollments table holds 42 rows whose plan is \"PREMIUM\", \"Premium\" or \"premium \". They came from a partner LMS integration and from version 3.2 of the mobile app. POST /enrollments answered 201 Created to every one of them: the EnrollDto declares plan as \"free\" | \"premium\", but nothing checks that type at runtime.",
    },

    content: [
        h2("1. The incident: a type that nobody checked"),
        p("The billing job reads every enrollment due for renewal and picks a price by plan. It was written, reasonably, against the two plans the product has:"),
        code("text", `
02:00:03 billing-renewals  INFO   3890 enrollments due for renewal
02:00:14 billing-renewals  ERROR  Unknown plan "PREMIUM" for enrollment e_58213 (course c_1042)
02:00:14 billing-renewals  INFO   job aborted after 1204 of 3890 enrollments`, "billing-renewals.log"),
        p("The job is not where the bug is. It trusted the table, and the table trusted the API. This is the endpoint that wrote the row:"),
        code("typescript", `
// enrollments/dto/enroll.dto.ts - the version that shipped
export class EnrollDto {
  courseId: string;
  email: string;
  plan: "free" | "premium";
  couponCode?: string;
  seats?: number;
}

// enrollments/enrollments.controller.ts
@Controller("enrollments")
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post()
  enroll(@Body() dto: EnrollDto) {
    return this.enrollments.enroll(dto);
  }
}`, "enroll.dto.ts"),
        p("Everything about this code looks typed. The editor autocompletes `dto.plan`, and assigning `\"gold\"` to it in your own code is a compile error. But the request body is not your code. It is bytes from a partner's server, parsed by `JSON.parse` at runtime, after the TypeScript compiler has finished and its types have been erased. The annotation `dto: EnrollDto` is a promise the compiler believes; nothing in the running process keeps it."),

        h2("2. Reproduce it and read the evidence"),
        p("Send the partner's request yourself. `curl -i` shows the status line, so you can see the API accept it:"),
        code("bash", `
curl -i -X POST https://api.codedev.test/enrollments \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"courseId":"c_1042","email":"ana@codedev.test","plan":"PREMIUM","seats":"2"}'

HTTP/1.1 201 Created
Content-Type: application/json

{"id":"e_58213","courseId":"c_1042","plan":"PREMIUM","seats":"2","status":"active"}`, "terminal"),
        p("Two values in that response are wrong in different ways. `plan` is a string outside the enum. `seats` is the string `\"2\"` where a number was declared; Postgres happened to cast it on insert, so nobody noticed. Then count what is already in the table:"),
        code("sql", `
SELECT plan, count(*) AS rows
FROM enrollments
WHERE created_at >= '2026-09-01'
GROUP BY plan
ORDER BY rows DESC;

  plan     | rows
-----------+------
 free      | 2210
 premium   | 1638
 PREMIUM   |   37
 Premium   |    4
 premium   |    1      <- "premium " with a trailing space`, "psql"),
        p("Three spellings, two clients, one missing check. The fix belongs at the place where untrusted data enters the application: the request boundary."),

        h2("3. Core idea: validate the shape at the boundary, once"),
        p("Treat every request body as `unknown` until something that runs has checked it. In NestJS that something is a **pipe**: it runs after routing and before your handler, receives the argument (here the body), and either returns a value or throws, in which case the handler never runs. The built-in `ValidationPipe` combines two libraries:"),
        numbered([
            "**class-transformer** turns the plain parsed object into an instance of your DTO class (`plainToInstance(EnrollDto, body)`).",
            "**class-validator** runs the rules you attached to that class as decorators (`@IsIn`, `@IsEmail`, `@IsInt`...) and collects every failure.",
            "If any rule fails, the pipe throws a `BadRequestException` and Nest answers 400 with the messages. The service is never called.",
        ]),
        p("That gives you one place, in front of every handler, where the question \"is this request well-formed?\" is answered. Well-formed means: the fields you need are present, each has the right JSON type, strings have the right format, and enum fields hold one of the allowed values. That is all."),
        h3("What validation is not for"),
        bullets([
            "**Business rules that need data.** \"The course exists\", \"the learner is not already enrolled\", \"prerequisites are finished\" need the database and change over time. They belong in the service (lesson 3.1) and come back as domain errors (lesson 2.3). A DTO that queries the database is a service in disguise.",
            "**The last line of defence.** The billing job, an admin SQL script and next year's import tool all write to the same table without going through your DTO. A `CHECK (plan IN ('free', 'premium'))` constraint protects the data from every writer; the DTO gives the client a clear 400 instead of a 500 from the database. You want both.",
            "**Repairing input.** It is tempting to accept `\"PREMIUM\"` and lowercase it. Do not do it silently: a validator that guesses hides the client's bug, the guess spreads to every client, and the next guess (`\"prem\"`?) is harder. If the product decides plans are case-insensitive, that is an explicit, documented transform with its own test, not a side effect of validation.",
        ]),
        callout("info", "Reject, then tell the client exactly why",
            "A 400 with \"plan must be one of the following values: free, premium\" costs the partner one deploy. A silently stored \"PREMIUM\" cost CodeDev a failed billing run, a data cleanup and a support thread with 2,686 learners in it."),

        h2("4. Worked example: the DTO and the pipe"),
        p("Rewrite the DTO so every field carries its rules. The decorators are runtime code: they register metadata that `ValidationPipe` reads for each request."),
        code("typescript", `
// enrollments/dto/enroll.dto.ts
import { IsEmail, IsIn, IsInt, IsOptional, Matches, Max, MaxLength, Min, Validate } from "class-validator";
import { CouponNeedsPremium } from "./coupon-needs-premium";

export const PLANS = ["free", "premium"] as const;
export type Plan = (typeof PLANS)[number];

export class EnrollDto {
  @Matches(/^c_[0-9]{1,9}$/, { message: "courseId must be c_ followed by 1 to 9 digits" })
  courseId!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(PLANS)
  plan!: Plan;

  @IsOptional()                                 // absent or null: skip every rule below
  @Matches(/^[A-Z0-9]{4,12}$/)
  @Validate(CouponNeedsPremium)
  couponCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  seats?: number;                               // the service uses dto.seats ?? 1
}`, "enroll.dto.ts"),
        p("Two details are easy to miss. `PLANS` is a runtime array that the type `Plan` is derived from, so the decorator and the type cannot drift apart. And `@IsOptional()` treats both a missing key and `null` as \"not given\" and skips the other rules for that field; a client that sends `\"couponCode\": null` has sent no coupon."),
        p("Rules that compare two fields are where decorators get clumsy. A small custom constraint keeps the rule next to the DTO and testable:"),
        code("typescript", `
// enrollments/dto/coupon-needs-premium.ts
import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from "class-validator";
import type { EnrollDto } from "./enroll.dto";

@ValidatorConstraint({ name: "couponNeedsPremium" })
export class CouponNeedsPremium implements ValidatorConstraintInterface {
  validate(_coupon: unknown, args: ValidationArguments): boolean {
    return (args.object as EnrollDto).plan !== "free";
  }
  defaultMessage(): string {
    return "couponCode is only allowed with plan premium";
  }
}`, "coupon-needs-premium.ts"),
        p("Now install the pipe once, for every route:"),
        code("typescript", `
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // strip properties that have no decorator
      forbidNonWhitelisted: true,   // ...or rather: reject them with a 400
      transform: true,              // hand the handler a real EnrollDto instance
      // no enableImplicitConversion: JSON already has numbers and booleans
    }),
  );
  await app.listen(3000);
}`, "main.ts"),
        bullets([
            "**`whitelist` and `forbidNonWhitelisted`** decide what happens to keys the DTO does not declare, such as an `isAdmin` a client decided to send. With both on, the request is rejected. Unknown fields are their own incident in this course (lesson 4.2); for now, turn both on.",
            "**`transform: true`** makes the handler receive an instance of `EnrollDto` instead of the plain object, which matters for nested DTOs and for class methods. It does not, by itself, change `\"2\"` into `2`.",
            "**`transformOptions.enableImplicitConversion`** is the option to leave off for JSON bodies. It converts each value to the property's declared type before the validators run, so `\"2\"` passes `@IsInt()` and `\"false\"` becomes `true`. Query strings are different, because every query value is a string; lesson 2.2 parses them explicitly.",
            "**`stopAtFirstError: true`** (optional) reports only the first failing rule per property, which keeps messages short when several rules fail at once.",
        ]),
        p("With this in place, the partner's request gets a 400 and nothing is written:"),
        code("bash", `
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"message":["plan must be one of the following values: free, premium","seats must be an integer number"],
 "error":"Bad Request","statusCode":400}`, "terminal"),
        p("That body is Nest's default shape. Lesson 2.3 replaces it with a `application/problem+json` body that lists `{ field, message }` pairs, using the pipe's `exceptionFactory` option, so every client gets field errors in the same format as every other error."),

        challenge("chal_quiz_nmm_211"),

        h2("5. How to verify it"),
        bullets([
            "**Unit test the DTO without Nest.** `plainToInstance(EnrollDto, body)` followed by `await validate(instance)` returns the same errors the pipe would. One test per rule, including the incident body with `\"PREMIUM\"`.",
            "**An end-to-end test through the real pipe.** Build the app in the test with the same `useGlobalPipes(...)` call as `main.ts` (better: move it into a `configureApp(app)` function both call), then post the bad body and expect 400 and zero new rows.",
            "**curl, as in section 2.** The exact partner request now returns 400 with a message that names the field.",
            "**The database.** Find the rows that are already wrong, fix them, then add the constraint so no other writer can repeat it.",
        ]),
        code("typescript", `
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { EnrollDto } from "./enroll.dto";

it("rejects a plan outside the enum", async () => {
  const dto = plainToInstance(EnrollDto, { courseId: "c_1042", email: "ana@codedev.test", plan: "PREMIUM" });
  const errors = await validate(dto);
  expect(errors.map((e) => e.property)).toEqual(["plan"]);
});`, "enroll.dto.spec.ts"),
        code("sql", `
-- 1. find and fix the rows the API already accepted
UPDATE enrollments SET plan = 'premium'
WHERE plan <> 'premium' AND lower(trim(plan)) = 'premium';

-- 2. stop every writer, not only the API, from adding new ones
ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_plan_check CHECK (plan IN ('free', 'premium'));`, "fix-plans.sql"),

        h2("6. Common mistakes"),
        bullets([
            "**A DTO with types and no decorators.** It compiles, it autocompletes, and it validates nothing. Spot it by looking for classes under `dto/` whose properties have no decorator, or by posting a body with wrong types in an end-to-end test and getting 201.",
            "**An interface or type alias as the body type.** `@Body() dto: EnrollInput` where `EnrollInput` is an `interface` gives `ValidationPipe` nothing to instantiate (interfaces do not exist at runtime), so it passes the body through unchecked. Spot it when a `@Body()` parameter's type is not a class.",
            "**A pipe that only exists in main.ts.** End-to-end tests that build the app with `Test.createTestingModule` do not run `main.ts`, so they test a different app that accepts anything. Spot it when a validation test passes in Postman and fails in CI, or the other way round.",
            "**Implicit conversion on JSON bodies.** `\"2\"` passes as 2 and `\"false\"` is stored as true. Spot it by searching for `enableImplicitConversion` and by sending strings in numeric and boolean fields in a test.",
            "**Repairing values in the validator.** A `@Transform(({ value }) => value.toLowerCase())` added to make an error go away turns a client bug into stored data. Spot it by reviewing every `@Transform` and asking which client sends that value and why.",
        ]),

        h2("7. Write the validator"),
        p("The code runner has no NestJS, so the challenge asks for the same rules as one plain function. It receives the parsed body exactly as a client sent it, as `unknown`, and returns either the typed value or the list of field errors, the same information the `ValidationPipe` builds from the decorators:"),
        code("typescript", `
type FieldError = { field: string; message: string };
type ValidationResult = { ok: true; value: EnrollRequest } | { ok: false; errors: FieldError[] };

function validateEnrollRequest(body: unknown): ValidationResult {
  // 1. is body a JSON object at all?
  // 2. for each field, in order: present? right JSON type? right format or enum value?
  // 3. rules between fields (a coupon needs plan premium)
  // 4. no errors -> build the value from the checked fields only
}`),
        challenge("chal_coding_nmm_212"),

        h2("8. Summary"),
        bullets([
            "A TypeScript type on `@Body()` is erased at runtime; only code that runs (class-validator decorators read by a global `ValidationPipe`) can reject `\"PREMIUM\"` or `\"2\"` before it reaches a service.",
            "Validate shape, types, formats and enums at the boundary, reject instead of repairing, and leave rules that need data to the service and a `CHECK` constraint to the database.",
            "Turn on `whitelist`, `forbidNonWhitelisted` and `transform`, leave `enableImplicitConversion` off for JSON bodies, and prove each rule with a DTO unit test and one end-to-end request.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS documentation: Validation (docs.nestjs.com/techniques/validation) - ValidationPipe options, whitelist, transform, implicit conversion",
            "NestJS documentation: Pipes (docs.nestjs.com/pipes) - where pipes run in the request lifecycle",
            "class-validator README (github.com/typestack/class-validator) - decorators, @IsOptional, custom constraints",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the migration for your own project: a query that lists every value of an enum-like column, an UPDATE for the spellings you find, and a CHECK constraint. Then add an end-to-end test that builds the app with the same pipe configuration as main.ts and posts one body per rule in your EnrollDto."),
    ],
});
