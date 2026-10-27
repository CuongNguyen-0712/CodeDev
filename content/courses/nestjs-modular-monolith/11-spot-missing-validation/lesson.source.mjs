// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nmm-4-2",
    title: "Spot the AI mistake: a DTO that lets unknown fields through",
    slug: { _type: "slug", current: "spot-ai-mistake-dto-unknown-fields" },
    description:
        "An AI assistant wrote the validation for PATCH /users/me/profile. It checked every field it was asked about and then passed the whole request body to the repository, so isAdmin, role and exp went straight into the users table. Learn why a TypeScript type does not filter anything at runtime, how a whitelist (ValidationPipe with whitelist and forbidNonWhitelisted) differs from a denylist, why __proto__ and constructor keys need the same treatment, and how to review AI-generated validation with tests that send what an attacker would send.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev learning platform",
        problem:
            "Thursday morning the weekly leaderboard at https://app.codedev.test shows a learner, u_4471, in first place with 9,999,999 EXP, earned in no lessons. The audit log of https://api.codedev.test shows that the same account became an admin two minutes earlier. Both changes came through PATCH /users/me/profile, the endpoint learners use to change their display name and bio. Its validation was written with an AI coding assistant last week; the PR had tests, and they passed.",
    },

    content: [
        h2("1. The incident: a profile update that made an admin"),
        p("The audit log is short and very clear:"),
        code("text", `
2026-10-22 08:14:03  PATCH /users/me/profile  user=u_4471  200
  body: {"displayName":"Minh","isAdmin":true,"role":"admin","exp":9999999}
  changed: display_name, is_admin, role, exp
2026-10-22 08:16:40  GET /admin/users  user=u_4471  200`, "api.codedev.test audit log"),
        p("Nobody wrote a feature that lets learners change `is_admin`. The request that reached the database came from an endpoint that was supposed to accept three fields. To see how, read what was asked and what was produced."),
        h3("What the assistant was asked"),
        p("The ticket gave the assistant exactly the contract the team wanted:"),
        code("text", `
Write the request validation for PATCH /users/me/profile. UpdateProfileDto has three
optional fields: displayName (string, 1-50 characters), bio (string, at most 280
characters) and avatarUrl (https URL, at most 2048 characters). Return 400 with the
list of messages when the body is invalid, otherwise pass the DTO to
UsersRepository.updateProfile().`, "the request sent to the AI assistant"),
        h3("What it produced"),
        code("typescript", `
// users/dto/update-profile.validation.ts
export function validateUpdateProfile(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }
  const input = body as Record<string, unknown>;
  const { displayName, bio, avatarUrl } = input;
  const errors: string[] = [];

  if (displayName !== undefined) {
    if (typeof displayName !== "string") errors.push("displayName must be a string");
    else if (displayName.length < 1 || displayName.length > 50) errors.push("displayName must be between 1 and 50 characters");
  }
  // ... the same for bio (max 280) and avatarUrl (https, max 2048)

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, dto: input as UpdateProfileDto };
}

// users/users.repository.ts
async updateProfile(userId: string, changes: UpdateProfileDto): Promise<void> {
  await this.users.update({ id: userId }, changes);   // UPDATE ... SET <every key of changes>
}`, "as merged"),
        p("Every rule from the request is there, and every message is clear. The tests in the PR sent a valid body, a too-long bio and a number as a display name, and all of them passed. What none of them sent was a field the DTO does not have."),

        h2("2. Reproduce it and read the evidence"),
        p("Reproduce it on a local API with your own test account. Send one field the DTO declares and one it does not:"),
        code("bash", `
curl -i -X PATCH http://localhost:3000/users/me/profile \\
  -H "Authorization: Bearer $TEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"displayName":"Minh","isAdmin":true}'

HTTP/1.1 200 OK
{"updated":true}

psql -c "select display_name, is_admin from identity.users where id = 'u_test'"
 display_name | is_admin
--------------+----------
 Minh         | t`, "terminal, local API"),
        p("Read the last line of the validator again: `return { ok: true, dto: input as UpdateProfileDto }`. The cast is the bug. `as UpdateProfileDto` is a promise to the compiler that the object has the shape of the DTO. TypeScript erases it at compile time: the emitted JavaScript is `return { ok: true, dto: input }`. The object that leaves the function is the parsed request body, with **every** key the client sent. The repository then writes every key it receives."),

        h2("3. Core idea: describe what is allowed, reject the rest"),
        p("Validation answers two different questions, and the assistant answered only the first:"),
        numbered([
            "**Are the fields I know about valid?** Types, lengths, formats, enums.",
            "**Is there anything here I do not know about?** A body is an object chosen by the client. It can carry any key, including keys that match columns you never meant to expose (`isAdmin`, `role`, `exp`, `emailVerified`, `userId`).",
        ]),
        p("The safe answer to the second question is a **whitelist**: the DTO lists the allowed properties, and everything else is either removed or rejected. The opposite, a **denylist** (\"remove isAdmin, role and exp\"), protects you only from the fields you already thought of. The next column added to the users table is exposed the day it is created."),
        h3("In NestJS: ValidationPipe with a whitelist"),
        code("typescript", `
// users/dto/update-profile.dto.ts
export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 50)
  displayName?: string;

  @IsOptional() @IsString() @MaxLength(280)
  bio?: string;

  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2048)
  avatarUrl?: string;
}

// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // strip properties without a decorator
  forbidNonWhitelisted: true,   // ... or rather: reject the request with 400
  transform: true,              // hand the controller an UpdateProfileDto instance
}));`, "update-profile.dto.ts and main.ts"),
        p("With `whitelist: true`, properties without a validation decorator are stripped. With `forbidNonWhitelisted: true` as well, the request is rejected instead, with one message per unknown property: `property isAdmin should not exist`. The controller method never runs."),
        p("Which one to choose? Rejecting is better for an API you control end to end: a client that sends `isAdmin` has a bug or is probing, and a 400 tells it so. Stripping silently is kinder to public APIs with old clients that still send a removed field, but log what you strip, or you will never learn that someone tried."),
        h3("Prototype keys are just more unknown keys"),
        p("`JSON.parse('{\"__proto__\": {\"isAdmin\": true}}')` creates an object with an **own** property named `__proto__`. Copy that object with `Object.assign(user, body)` and the assignment goes through the `__proto__` setter: the user object gets a new prototype, and every property it does not define itself is now read from the attacker's object. A whitelist rejects `__proto__`, `constructor` and `prototype` like any other unknown key, as long as you check the key against your list of fields and **not** with the `in` operator, which also finds inherited names such as `constructor` and `toString`."),
        callout("warning", "TypeScript types are not validation",
            "A type annotation, an interface or an `as` cast never runs. Everything that crosses a trust boundary (request bodies, query strings, headers, webhook payloads, messages from a queue) is `unknown` until code has checked it and built a new value out of it. The DTO class works in NestJS because ValidationPipe turns its decorators into runtime checks."),
        p("Also keep the size of the problem bounded. Express's JSON body parser, which Nest uses by default, rejects bodies over 100 kB with 413 before validation runs; a profile update needs far less, so a smaller limit for this route is reasonable. Length rules on each string do the rest."),

        challenge("chal_quiz_nmm_421"),

        h2("4. Reviewing AI-generated validation"),
        p("Assistants are good at writing the checks you list and at making the happy path pass. They are less reliable at what you did not list. Read generated validation with this checklist:"),
        numbered([
            "**Find the line that returns the value.** Does it return a **new** object built from checked fields, or the input with a cast? `as SomeDto` on a request body is a red flag.",
            "**Ask what happens to a key nobody mentioned.** Is there a whitelist (`forbidNonWhitelisted`, or a list of allowed keys), or does every key flow through?",
            "**Follow the value to the database.** `repository.update(id, dto)`, `Object.assign(entity, dto)` and `{ ...entity, ...dto }` write whatever they receive. Prefer a repository method that names its columns.",
            "**Look for `in` and `obj[key]` lookups in the whitelist.** Both see inherited names; use an array, a `Set` or `Object.hasOwn()`.",
            "**Write the test the assistant did not write.** Extra fields, `__proto__` and `constructor`, wrong types, a body that is not an object, a body that is far too big. Add them to the request next time: \"also return the tests that try to set isAdmin\".",
        ]),
        p("You will review the assistant's validator yourself in the challenge. The file contains the validator, a fake `UsersRepository` that copies every property it receives (like an ORM's update), the controller and a test runner that prints the response, what the repository received and the stored user. The public tests pass on the assistant's code, as the PR's tests did; the hidden tests send what the attacker sent."),
        challenge("chal_coding_nmm_422"),

        h2("5. How to verify the fix"),
        bullets([
            "**An e2e test of the route** with the real global pipe: send `isAdmin`, expect 400 and the message, then read the user and expect `isAdmin` unchanged. It must fail on the merged code and pass on the fix.",
            "**A test per unknown-key family:** a column name (`role`), a prototype key (`__proto__`), an inherited name (`constructor`), a nested object, a body that is an array.",
            "**The audit log after the deploy:** no profile update changes anything but `display_name`, `bio` and `avatar_url`. Query it: `select count(*) from audit.events where route = 'PATCH /users/me/profile' and changed && array['is_admin','role','exp']`.",
            "**Clean up the incident:** reset the affected accounts from the audit log, and remove the EXP from the leaderboard.",
        ]),
        code("typescript", `
// test/users.e2e-spec.ts (supertest, see lesson 4.3 for the setup)
it("rejects fields that are not in UpdateProfileDto", async () => {
  await request(app.getHttpServer())
    .patch("/users/me/profile")
    .set("Authorization", \`Bearer \${learnerToken}\`)
    .send({ displayName: "Minh", isAdmin: true, role: "admin", exp: 9999999 })
    .expect(400)
    .expect(({ body }) => {
      expect(body.message).toEqual([
        "property isAdmin should not exist",
        "property role should not exist",
        "property exp should not exist",
      ]);
    });

  const user = await users.findById(learnerId);
  expect(user).toMatchObject({ isAdmin: false, role: "learner", exp: 1240 });
});`, "users.e2e-spec.ts"),

        h2("6. Common mistakes"),
        bullets([
            "**Trusting a cast or an interface.** Spot it: `body as Dto`, `req.body as Dto`, or a controller parameter typed with an interface (interfaces have no decorators, so ValidationPipe checks nothing).",
            "**A denylist instead of a whitelist.** Spot it: code that deletes or rejects named fields (`delete body.isAdmin`). Ask what happens to the next column.",
            "**`whitelist: true` set on one controller but not globally, or a DTO property without any decorator.** A property without a decorator is not whitelisted, so it is stripped even if you meant to accept it, and nested objects need `@ValidateNested()` with `@Type()` to be checked at all. Spot it: an e2e test that sends a valid nested object and gets it back empty.",
            "**`@IsOptional()` read as \"may be missing\".** It also accepts `null`, which then reaches the database. Spot it: send `{\"bio\": null}` and look at the column.",
            "**Copying the request into the entity.** `Object.assign(user, dto)` or `{ ...user, ...dto }` turn every validation gap into a write. Spot it: repository methods that take a whole DTO instead of named fields.",
        ]),

        h2("7. Summary"),
        numbered([
            "A TypeScript type or `as` cast does not remove anything at runtime: validation must build a new value from the fields it checked.",
            "Whitelist, do not denylist: ValidationPipe with `whitelist` and `forbidNonWhitelisted` rejects every property the DTO does not declare, `__proto__` and `constructor` included.",
            "Review AI-generated validation by asking what happens to the fields nobody mentioned, and prove the answer with tests that send them.",
        ]),

        h2("Sources"),
        bullets([
            "NestJS documentation: Validation (whitelist, forbidNonWhitelisted, transform) - https://docs.nestjs.com/techniques/validation",
            "class-validator: decorators and validation options - github.com/typestack/class-validator",
            "OWASP: Mass Assignment Cheat Sheet",
        ]),
        callout("tip", "Self-practice (not graded): audit your own endpoints",
            "List every endpoint of an API you work on that accepts a body. For each one, write the DTO class it validates with, whether the global ValidationPipe has whitelist and forbidNonWhitelisted, and the repository call the body ends up in. Mark every place where a whole DTO or body is spread or assigned into an entity, and write one e2e test that sends an unknown field to that route."),
    ],
});
