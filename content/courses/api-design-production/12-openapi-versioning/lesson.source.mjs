// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-4-3",
    title: "OpenAPI & versioning: deprecate without surprises",
    slug: { _type: "slug", current: "openapi-versioning-deprecate-without-surprises" },
    description:
        "A partner asks whether the rating field will disappear and when. The docs don't mark it deprecated, the changelog is a chat thread and the OpenAPI document has said version 1.0.0 since March. Make the OpenAPI document the contract (generated from NestJS or written first, and tested against real responses either way), choose between URL versions, header or media-type versions and additive evolution, write a deprecation and sunset policy with Deprecation and Sunset headers, and keep a changelog and contract tests in CI.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API team",
        problem:
            "Wednesday 4 Nov. The integration team of a partner university, whose LMS imports the CodeDev catalog every night, emails support: \"Your docs show averageRating, but our import reads rating. Will rating disappear? When? We only saw the change because our logs started showing a Sunset header.\" The API docs page, generated from the NestJS code, lists rating without any deprecation mark. The only changelog is a thread in the team chat. The OpenAPI document says \"version\": \"1.0.0\", unchanged since March. Nobody can say which other integrations read rating.",
    },

    content: [
        h2("1. The incident: a contract nobody can read"),
        p("The expand/contract fix from lesson 4.1 worked: no client broke. But a migration is a conversation with clients, and this one only reached the clients that happened to log response headers. Look at what a partner could find on 4 Nov:"),
        bullets([
            "**The docs** (Swagger UI generated from the Nest app): `rating` and `averageRating` side by side, no hint which one to use.",
            "**The OpenAPI document**: `\"info\": { \"version\": \"1.0.0\" }`, the same since March, although the course schema changed twice in October.",
            "**The changelog**: none. The deprecation was announced in a chat thread the partner cannot see.",
            "**The responses**: `Deprecation`, `Sunset` and `Link` headers. The partner found out from these, which is the one part that worked.",
        ]),
        p("This lesson turns the pieces into a policy: the document is the contract, it says what is deprecated, it has a version and a changelog, and CI keeps all of it true."),

        h2("2. OpenAPI as the contract"),
        p("An OpenAPI 3.1 document describes every endpoint, parameter, request body and response, with schemas that are JSON Schema 2020-12. It is the one artifact every client can use: the mobile team generates Kotlin models from it, partners read it in Swagger UI, CI diffs it (lesson 4.2). There are two ways to produce it."),
        h3("Generated from code (code-first)"),
        p("With `@nestjs/swagger` the document is built from the controllers and the decorated DTO classes when the app starts. It stays close to the code with little effort, and it is the right default for a team whose API is mostly consumed by its own apps. Its weakness is that it describes the **decorators**, not the behaviour:"),
        code("typescript", `
export class CourseDto {
  @ApiProperty({ type: "integer", description: "Price in dong" })
  price: number;

  @ApiProperty({ type: Number, nullable: true, deprecated: true,
                 description: "Use averageRating. Removed after 2026-11-30." })
  rating: number | null;
}

// main.ts - build the document and write it to the repo so CI can diff it
const document = SwaggerModule.createDocument(app, new DocumentBuilder()
  .setTitle("CodeDev API").setVersion("1.4.0").build());
writeFileSync("openapi.json", JSON.stringify(document, null, 2));`, "src/courses/course.dto.ts and main.ts (NestJS, @nestjs/swagger)"),
        p("If a mapper returns a string where the decorator says integer, the generated document is confidently wrong. Check also which OpenAPI version your version of `@nestjs/swagger` emits: older versions write 3.0, where nullability is `nullable: true` instead of a `\"null\"` in the type list, and a diff tool must know which one it reads."),
        h3("Written first (design-first)"),
        p("The team writes `openapi.yaml` by hand (or in an editor), reviews it like code, and the server is checked against it: request validation from the document, response validation in tests, models generated for clients. It costs more discipline, and pays off when the API is a product for clients you do not control: partners can review a change **before** it is implemented, and the document cannot drift silently because the tests compare the server to it."),
        p("Either way, the rule is the same: **a document is only a contract if something fails when the server disagrees with it.** For code-first that means validating real responses against the generated document in tests; for design-first it means validating both requests and responses."),

        h2("3. Versioning: three options and their costs"),
        p("Versioning is how you change a contract that clients cannot all follow at once. Each option moves the cost to a different place:"),
        bullets([
            "**A version in the URL (`/v1/courses`, `/v2/courses`).** Visible in logs, caches, docs and curl; easy to route to different code. Every major version is a second API to keep secure, tested and documented, and clients have to move all their calls at once. Best for rare, real redesigns.",
            "**A version in a header or media type (`Accept: application/vnd.codedev.v2+json`, or a dated version header).** URLs stay stable and a client can move one endpoint at a time. It is invisible in a plain URL, needs `Vary` for caches, and every client and tool must remember to send it. Best when you need many small versions of the same resources.",
            "**No new versions, additive evolution.** One `/v1` that only grows: new properties, new endpoints, and breaking changes through expand/contract with deprecation and sunset dates. The cheapest to run, and it requires the discipline of lessons 4.1 and 4.2: clients ignore unknown keys, CI blocks unplanned breaking changes, and removals wait for usage data.",
        ]),
        p("CodeDev chose the third option inside a URL major version: `/v1` evolves additively, and `/v2` is reserved for a redesign that cannot be made compatible. A rename like `rating` to `averageRating` is not a reason for `/v2`: expand/contract handled it with one deploy, while a `/v2` would have needed the same sunset for `/v1` anyway."),
        callout("info", "When not to version at all",
            "An endpoint used only by your own web app, deployed in the same pipeline, does not need versions or sunset dates: change client and server together, with an end-to-end test. Versioning and deprecation policies are for clients you cannot deploy."),

        h2("4. Deprecation and sunset policy"),
        p("A deprecation tells clients \"stop using this\"; a sunset tells them \"from this date it may stop working\". Clients need to find both in four places, because different clients look in different places:"),
        numbered([
            "**The document:** `deprecated: true` on the property, parameter or operation (OpenAPI 3.1 supports it on schemas and on operations), with the replacement and the date in the description. Generated clients mark deprecated members, so developers see a warning in their editor.",
            "**The responses:** `Deprecation` and `Sunset` headers, plus `Link` with `rel=\"deprecation\"` (and optionally `rel=\"sunset\"`) pointing to the notice. `Sunset` is defined in RFC 8594 and carries an HTTP-date. `Deprecation` is defined in RFC 9745 (2025) as `@` plus Unix seconds; implementations built on earlier drafts send `Deprecation: true`, so check what your gateway and your clients' libraries produce and understand.",
            "**The changelog:** one entry per change, with the date, what changed, what to use instead, and the sunset date.",
            "**Direct contact** for clients you know: the mobile team, partners with an API key and a contact address.",
        ]),
        code("text", `
HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: @1792746000
Sunset: Mon, 30 Nov 2026 00:00:00 GMT
Link: <https://api.codedev.test/docs/changes/2026-10-course-dto>; rel="deprecation"`, "Headers on every course response until the contract step"),
        p("The policy itself should be short and concrete, so that a pull request can be checked against it:"),
        code("text", `
CodeDev API - deprecation policy
- Additive changes ship in /v1 without notice. Clients must ignore unknown properties.
- A breaking change in /v1 uses expand/contract: the old form stays, marked deprecated,
  with Deprecation, Sunset and Link headers and a changelog entry on the day it is deprecated.
- Minimum time to sunset: 90 days for endpoints used by partners; for our own mobile apps,
  until the minimum app version no longer reads the old form, and at least 14 days.
- Removal needs: the sunset date passed AND the access log shows the old form's clients
  below 1% of the endpoint's traffic for 7 days AND partners with API keys were contacted.`, "docs/api-deprecation-policy.md"),
        p("The usage condition matters because a sunset date alone cannot know who is still calling. Log the client identity you have (an API key, a `User-Agent`, an `X-App-Version` header) on every request to a deprecated endpoint or with a deprecated parameter, so the removal decision is a query, not a guess. The API cannot see which response **fields** a client reads; for those, the per-version log and direct contact are the evidence."),

        challenge("chal_quiz_adp_431"),

        h2("5. Changelog and document version"),
        p("`info.version` in the document is the version of the **document**, not of the URL. Bump it on every change that clients may care about, so that a partner can say \"we built against 1.3.0\" and you can diff exactly that. A practical scheme: minor for additions and new deprecations, patch for description fixes; a removal after a sunset is a minor bump with a changelog entry that links back to the deprecation."),
        code("text", `
## 1.4.0 - 2026-10-23
Deprecated (sunset 2026-11-30): course.rating -> averageRating, course.instructor -> teacher,
  course.price (integer) -> priceAmount (decimal string). Headers: Deprecation, Sunset, Link.
Added: course.averageRating, course.teacher, course.priceAmount.

## 1.3.0 - 2026-10-15
Added: GET /v1/courses?level=... filter.`, "CHANGELOG-API.md"),
        p("Generate the skeleton of each entry from the document diff (the same diff CI runs), then let a human write the \"what to do\" part. A changelog written only from memory misses changes; one generated only by a tool misses the reason."),

        h2("6. Contract tests in CI"),
        p("Each promise above has a check that fails when it is broken:"),
        bullets([
            "**The committed document matches the code.** CI regenerates `openapi.json` and fails if it differs from the committed file, so every contract change shows up in review as a diff of the document.",
            "**No unplanned breaking change.** The breaking-change diff against main and against the last deployed document (lesson 4.2), blocking, with a reviewed override that requires a deprecation notice.",
            "**Responses match the document.** Integration tests validate real responses against the response schemas of the document; this is what catches a mapper that disagrees with its decorators.",
            "**Responses still match what old clients decode.** Consumer schemas, such as the Android 3.8 course schema, stay in the repo until the contract step (lesson 4.1).",
            "**Deprecations are announced.** A test asserts that every operation or schema marked `deprecated` in the document has a changelog entry and that its routes send `Deprecation` and `Sunset`.",
        ]),

        h2("7. How to verify the policy works"),
        bullets([
            "**Ask the partner's question again.** From the docs page alone, can someone find that `rating` is deprecated, its replacement and its sunset date? From `curl -sI` alone? From the changelog alone? Each should answer it.",
            "**Run the removal query before the contract pull request.** The access log grouped by client for the deprecated form, over the last 7 days, attached to the pull request.",
            "**Break it on purpose.** Remove `deprecated: true` from `rating` in a branch and confirm the deprecation test fails; change a decorator type without changing the mapper and confirm the response validation fails.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Trusting a generated document because it is generated.** It describes decorators. Spot it: no test validates responses against it.",
            "**A new major version for every change.** Spot it: `/v2` opened for a rename or a new field; check whether expand/contract would have done it with one code path.",
            "**Deprecation that only lives in the docs.** Clients that never reopen the docs never learn. Spot it: a deprecated property in the document, but no `Deprecation`/`Sunset` headers and no changelog entry.",
            "**A sunset date treated as a removal date.** Spot it: a removal pull request without a usage query; the date is the earliest removal, not an automatic one.",
            "**`info.version` that never changes.** Spot it: the same version string across releases with different schemas; clients cannot say which contract they built against.",
        ]),

        h2("9. Summary"),
        numbered([
            "The OpenAPI document is the contract only if CI fails when the server disagrees with it: generate it or write it first, and validate real responses against it either way.",
            "Prefer additive evolution with expand/contract inside one version; use URL or header versions for redesigns that cannot be compatible, knowing each version is another API to maintain.",
            "Deprecate in four places (document, headers, changelog, direct contact), and remove only after the sunset date and a usage check.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAPI Specification 3.1.0 - spec.openapis.org/oas/v3.1.0",
            "RFC 8594: The Sunset HTTP Header Field - rfc-editor.org/rfc/rfc8594",
            "RFC 9745: The Deprecation HTTP Response Header Field - rfc-editor.org/rfc/rfc9745",
            "RFC 9110: HTTP Semantics (Vary, content negotiation) - rfc-editor.org/rfc/rfc9110",
            "NestJS documentation: OpenAPI (Swagger) - docs.nestjs.com/openapi/introduction",
        ]),
        callout("tip", "Self-practice (not graded): write the API's deprecation policy",
            "Write a one-page deprecation and versioning policy for an API you work on: what counts as additive, how a breaking change is announced (document, headers, changelog, contact), the minimum time to sunset for each kind of client, the usage evidence required before a removal, and who can approve an exception. Then take the last breaking change your team shipped and check it against your own policy, step by step."),
    ],
});
