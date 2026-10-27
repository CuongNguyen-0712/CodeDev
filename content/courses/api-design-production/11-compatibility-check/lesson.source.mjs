// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-4-2",
    title: "Detect breaking changes automatically",
    slug: { _type: "slug", current: "detect-breaking-changes-automatically" },
    description:
        "A week after the course DTO incident, a pull request that \"only adds things\" - a new enum value and a nullable rating - is approved as safe and would have crashed Android 3.9. Learn which schema changes break clients that read a response and which are safe, why the answer flips for requests, how to compare two JSON Schemas mechanically with JSON Pointer paths, and how to make the check block CI instead of printing a warning nobody reads.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API team",
        problem:
            "Thursday 29 Oct. PR #517 adds an \"expert\" course level and lets averageRating be null for courses without reviews. The reviewer writes \"Only additions, nothing removed - safe to merge\" and approves. On staging, the Android 3.9 build crashes on the first expert course and on every course without reviews. The OpenAPI diff job from the last incident printed both changes, but as one line among forty in a log that nobody opened, and it was still configured not to fail the pipeline. The team asks for a check that knows which changes break readers of a response, and that blocks the merge.",
    },

    content: [
        h2("1. The incident: \"only additions\""),
        p("The pull request looked like the safest kind of change. Here is the part of the generated `openapi.json` it touched, for `GET /v1/courses/{slug}`:"),
        code("text", `
   "level": {
     "type": "string",
-    "enum": ["beginner", "intermediate", "advanced"]
+    "enum": ["beginner", "intermediate", "advanced", "expert"]
   },
   "averageRating": {
-    "type": "number"
+    "type": ["number", "null"]
   },
+  "badges": { "type": "array", "items": { "type": "string" } },`, "PR #517, diff of the generated openapi.json"),
        p("Three additions: one enum value, one type in a list, one property. The reviewer counted removed lines, found none, and approved. Now look at what Android 3.9 decodes the response into:"),
        code("text", `
enum class Level {
    @SerialName("beginner") BEGINNER,
    @SerialName("intermediate") INTERMEDIATE,
    @SerialName("advanced") ADVANCED,
}

@Serializable
data class CourseDto(/* ... */ val level: Level, val averageRating: Double /* ... */)

private val json = Json { ignoreUnknownKeys = true }`, "Android 3.9 model (Kotlin)"),
        p("A closed enum with three entries cannot hold `\"expert\"`, and a non-nullable `Double` cannot hold `null`. Both additions make the response carry values the client was promised it would never see. Only `badges` is really harmless, because 3.9 ignores unknown keys."),

        h2("2. Reproduce it and read the evidence"),
        p("You do not need a phone to see it. Validate a real staging response against the schema of the **previous** release, which is exactly what 3.9 was built from:"),
        code("bash", `
git show main:openapi.json > /tmp/openapi-main.json
curl -s https://api.codedev.test/v1/courses/kotlin-for-experts > /tmp/course.json
npx ajv validate --spec=draft2020 -s /tmp/course.schema-main.json -d /tmp/course.json
# /tmp/course.json invalid
# [ { instancePath: '/level', keyword: 'enum', message: 'must be equal to one of the allowed values' } ]`, "Old schema against a new response (course.schema-main.json = the course schema extracted from openapi-main.json)"),
        p("The diff told the truth; the reviewer read it in the wrong direction. That is the whole problem this lesson solves: **whether a change breaks someone depends on who reads the data**, and humans counting plus and minus lines get the direction wrong."),

        h2("3. Core idea: compatibility has a direction"),
        p("A response is data the server writes and clients read. A client was written against the old schema, which is a promise: \"every response will match this\". A change is safe for readers when every response that matches the **new** schema still matches the **old** one. In other words, the new schema may only promise **more** (narrower), never less:"),
        bullets([
            "**Breaking for readers:** a property removed (a client may read it, required or not), a required property made optional, `null` added to a type, a type changed or widened (`integer` to `number`, `string` to `string or integer`), a new enum value.",
            "**Safe for readers:** a new property (clients must ignore unknown keys - check that they do), an optional property made required, `null` removed, an enum value removed.",
        ]),
        p("For a **request body** the server is the reader, so every rule flips. Adding a required request property breaks every client that does not send it; adding an enum value the server accepts is safe; removing one breaks the clients that send it. A check that applies the response rules to requests, or the other way round, is wrong half the time. This lesson and its challenge cover responses."),
        callout("info", "Are new enum values always breaking?",
            "Only for clients that treat the enum as closed. A client with a fallback (an `UNKNOWN` entry, `coerceInputValues`, a `default` branch that renders something sensible) survives new values. CodeDev's Android apps decode into closed Kotlin enums, so the team's rule is: a new response enum value is breaking unless the endpoint documents the enum as open (\"clients must accept unknown values\") from day one. Decide this per API and write it down; a check needs one answer."),
        h3("When not to bother"),
        p("A mechanical check pays off when clients are out of your control: mobile apps, partners, other teams. For an internal endpoint called only by a web app deployed in the same pipeline, the end-to-end tests of that app are a stronger and cheaper signal. Do not let the tool become the reason to ship nothing: a breaking change with an expand/contract plan (lesson 4.1) is fine; a breaking change nobody noticed is not."),

        h2("4. Compare two schemas mechanically"),
        p("OpenAPI 3.1 schemas are JSON Schema, so \"is the new schema narrower?\" can be checked by walking both trees side by side. A useful checker for responses does five things at every node:"),
        numbered([
            "Compare nullability: `null` added to the type list is breaking, removed is safe.",
            "Compare the other types. If they differ, report a type change and stop: comparing the properties of an object that is now a string only produces noise.",
            "Compare enums value by value: added values are breaking, removed values are safe.",
            "For objects, compare properties and the `required` list: removed, added, made optional, made required. Then walk into each property that exists on both sides.",
            "For arrays, walk into `items`. Most breaking changes in list endpoints live at `/properties/items/items/...`, where a quick review rarely looks.",
        ]),
        p("Every finding needs an address a human can follow. JSON Pointer (RFC 6901) is the standard one: a path of tokens separated by `/`, where a `~` in a name is written `~0` and a `/` is written `~1`. For PR #517 a checker following these rules reports:"),
        code("json", `
{
  "breaking": [
    { "path": "/properties/averageRating", "change": "became-nullable" },
    { "path": "/properties/level", "change": "enum-value-added", "detail": "\\"expert\\"" }
  ],
  "safe": [
    { "path": "/properties/badges", "change": "property-added" }
  ]
}`, "Report for PR #517, response of GET /v1/courses/{slug}"),
        p("Two details make the report usable in CI. It is **sorted** (by path, then change, then detail, in plain code-unit order, not by locale), so the same diff always gives byte-for-byte the same output and a snapshot test can pin it. And it separates breaking from safe, so the pipeline fails on the first list and only prints the second."),

        challenge("chal_quiz_adp_421"),

        h2("5. The challenge: write the checker"),
        p("Write the comparison for the schema subset in the description: `type` (with nullability as `\"null\"` in a type array), `properties`, `required`, `enum` and `items`. The tests include a list endpoint with changes deep inside array items, a type change with nested properties below it, property names that need escaping in a pointer, invalid input and a large schema."),
        challenge("chal_coding_adp_422"),

        h2("6. Put it in CI so it blocks"),
        p("You do not have to run your own checker in production; mature tools exist. oasdiff, for example, compares two OpenAPI documents and has a mode that reports only breaking changes and can fail the build (check the flags of the version you install). What matters is the setup around the tool:"),
        code("yaml", `
# .github/workflows/api-contract.yml
api-contract:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with: { fetch-depth: 0 }
    - run: npm ci && npm run openapi:generate          # writes openapi.json from the Nest app
    - run: git show origin/main:openapi.json > openapi-main.json
    - run: oasdiff breaking openapi-main.json openapi.json --fail-on ERR
  # no allow_failure / continue-on-error: a breaking change fails the pull request`, "CI job comparing the pull request with main"),
        bullets([
            "**Compare against what clients have, not against the previous commit.** main is a good base for pull requests. For a release, compare against the last **deployed** document too, so three \"safe\" pull requests cannot add up to an unnoticed break.",
            "**Block, with a reviewed way out.** A real breaking change with an expand/contract plan needs an override: a label such as `breaking-change-approved` that only the API owners can set, and a link to the deprecation notice. An override that anyone can add silently is `allow_failure` again.",
            "**Add consumer schemas.** The spec diff only sees the document. Keep the schema each important client decodes (lesson 4.1) and validate real responses against it; that catches a mapper that disagrees with its own spec.",
        ]),

        h2("7. How to verify the check itself"),
        p("A compatibility check that never fails looks exactly like one that works. Prove it catches what it should:"),
        bullets([
            "**Replay the incidents.** Run it on the diff of release 2026.10.22-2 and on PR #517: it must report the two removed properties and the price type change, then the enum value and the nullable rating. Keep both diffs as fixtures in the check's own tests.",
            "**Plant a break.** In a throwaway branch, remove a property deep in a list item or make a field nullable, and confirm the pipeline goes red with the right JSON Pointer.",
            "**Check the safe side.** Add an optional property and confirm the pipeline stays green. A check that cries wolf gets an `allow_failure` within a month.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Counting removed lines.** New enum values, a `null` in a type list and widened types are additions that break readers. Spot it: a review comment like \"only additions\" on a response schema; ask what an old client does with the new value.",
            "**Using one rule set for requests and responses.** The direction flips. Spot it: a checker or reviewer who calls \"added required property\" breaking on a response, or \"added enum value\" breaking on a request body.",
            "**Stopping at the top level.** List responses keep their data under `items`. Spot it: the check reports nothing for a change inside `/properties/items/items`; test it with a planted break there.",
            "**Assuming clients ignore unknown keys.** \"New property = safe\" holds only if every client is configured that way (kotlinx.serialization, for example, rejects unknown keys unless `ignoreUnknownKeys` is set). Spot it: ask each client team, or look at their decoder configuration.",
            "**A report instead of a gate.** Spot it: `allow_failure`, `continue-on-error` or a check that is not required for merging.",
        ]),

        h2("9. Summary"),
        numbered([
            "For a response, a change is safe only if every new response still matches the old schema: removals, optional-now, nullable-now, type changes and new enum values break readers; additions of properties and narrowing are safe. For requests the rules flip.",
            "Compare schemas by walking both trees: nullability, types (stop when they differ), enums, properties and required, items, and report each finding with a JSON Pointer in a stable order.",
            "Make the check block CI with a reviewed override, replay past incidents as fixtures, and add consumer schemas so real responses are checked too.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAPI Specification 3.1.0 (Schema Object = JSON Schema 2020-12) - spec.openapis.org/oas/v3.1.0",
            "RFC 6901: JavaScript Object Notation (JSON) Pointer - rfc-editor.org/rfc/rfc6901",
            "oasdiff documentation: breaking changes - github.com/oasdiff/oasdiff",
        ]),
        callout("tip", "Self-practice (not graded): the request-side rules",
            "Write the table for request bodies, where the server is the reader: for each change in this lesson (property removed or added, required added or removed, null added or removed, type changed, enum value added or removed), mark it breaking or safe for the clients that send the request, with one sentence of why. Then find one endpoint of a real API you use where the same schema is used for both a request and a response (for example a PUT that sends back what it received), and decide which changes are safe for both."),
    ],
});
