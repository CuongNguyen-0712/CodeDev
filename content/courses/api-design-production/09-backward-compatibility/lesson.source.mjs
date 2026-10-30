// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-adp-3-2",
    title: "Detect breaking changes between response schemas",
    slug: { _type: "slug", current: "detect-breaking-changes-between-response-schemas" },
    description:
        "A release adds one enum value and makes one date nullable, every contract test passes, and the Android catalog goes blank while iOS shows an error screen. Learn why breaking means opposite things for requests and responses, how tolerant readers limit the damage, and how to compare the previous release's response schema with the new one in CI so that a breaking change fails the build instead of the apps.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev API team",
        problem:
            "Thursday's API release added the level expert for a new course and allowed publishedAt to be null for \"coming soon\" courses. Within an hour, Android app 4.12 showed an empty catalog for every learner and iOS app 5.3 showed \"Could not load courses\". The OpenAPI spec was updated in the same pull request and every contract test was green. The team lead wants a CI step that would have stopped this release.",
    },

    content: [
        h2("1. The incident: green tests, broken apps"),
        p("The pull request looked harmless. A new course, \"System Design Interview Prep\", needed a level above advanced, and the content team wanted to list courses before their launch date. The diff to the response schema of `GET /v1/courses` and `GET /v1/courses/{id}` in `openapi.yaml` was four lines:"),
        code("yaml", `
 Course:
   type: object
   required: [id, slug, title, level, publishedAt, enrollmentCount]
   properties:
     level:
       type: string
-      enum: [beginner, intermediate, advanced]
+      enum: [beginner, intermediate, advanced, expert]
     publishedAt:
       type: string
       format: date-time
+      nullable: true`, "openapi.yaml (pull request #807)"),
        p("The handler was changed in the same pull request, the contract tests from lesson 4 validated every response against the new spec, and they all passed. Forty minutes after the deploy, the error tracker showed two new errors, both from apps that were already in the stores:"),
        code("text", `
android/4.12.0  kotlinx.serialization.SerializationException
                at CourseRepository.loadCatalog   events 8,214   first seen 15:42
ios/5.3.1       DecodingError.valueNotFound(String, ... "publishedAt" ...)
                at CatalogService.fetch           events 2,977   first seen 15:44
web             no new errors (deployed together with the API)`, "error tracker, 2026-10-15"),
        bullets([
            "**Android 4.12** decodes `level` into a closed Kotlin enum with three entries. One course with `expert` makes the decoder throw, and because the whole page of courses is decoded as one list, the catalog is empty for everyone - not only on the new course.",
            "**iOS 5.3** declares `publishedAt` as a non-optional `String`. The first \"coming soon\" course sends `\"publishedAt\": null`, Swift's `JSONDecoder` throws `valueNotFound`, and the screen shows its generic error.",
            "**The web app** was built from the same commit as the API, so it already knew both changes.",
        ]),

        h2("2. Why the contract tests could not catch it"),
        p("Contract tests answer one question: does the server's response match the spec? In this pull request the spec and the server changed together, so the answer was yes. Nothing compared the new spec with the **previous** one - the contract that the apps in the stores were built against. A mobile app is released through a store review and updated by each user when they feel like it, so the contract from three months ago is still being read by a large share of your traffic today."),
        p("Two different checks are needed, and they protect different things:"),
        bullets([
            "**Contract test** (lesson 4): the implementation matches the spec of this commit. It catches a handler that forgets a field.",
            "**Compatibility check**: the spec of this commit can be read by every client built against the spec of the last release. It catches a spec change that old clients cannot handle, even when the implementation is perfect.",
        ]),

        h2("3. Who reads decides what breaks"),
        p("A change is breaking when a client that worked yesterday, and has not changed, fails today. Whether an edit can do that depends on the direction of the data, because the reader is the one who gets surprised:"),
        bullets([
            "**Response**: the server writes, the old client reads. Anything the old client has never seen before can break it: a property that is missing, a `null` where there was always a string, a value outside the enum it knows, a number where it expected a string. Sending **less variety** than before is safe: dropping an enum value it will simply never see, never sending `null` again, always including a field that used to be optional.",
            "**Request**: the old client writes, the server reads. Now the server is the one who can be surprised, and the old client cannot change what it sends. Accepting **more** is safe: a required field becomes optional, an enum accepts a new value. Accepting **less** is breaking: a new required field, a removed enum value, a stricter format.",
        ]),
        image("breaking-depends-on-reader", {
            alt: "Two columns comparing the same schema edits for a response and for a request. In a response, the server writes and the old client reads: removing a property, changing a type, required to optional, becoming nullable and adding an enum value are breaking, in red; adding a property, optional to required, removing an enum value and dropping nullable are safe, in green. In a request, the old client writes and the server reads: adding a required property, optional to required and removing an enum value are breaking; adding an optional property, required to optional and adding an enum value are safe.",
            caption: "The same edit can be safe in one direction and breaking in the other. Ask who reads the data and whether they can receive something new.",
        }),
        h3("Postel's principle and tolerant readers"),
        p("The robustness principle - \"be conservative in what you send, be liberal in what you accept\" - comes from the early Internet protocol specifications. RFC 9413 (2023) looks back at it and points out the cost: when every receiver silently accepts sloppy input, senders never get fixed and the protocol drifts. The useful part for APIs is narrower and well established: a **tolerant reader** ignores properties it does not know, maps unknown enum values to a fallback, and treats optional data as optional. Here is the Android decoder written that way, in the TypeScript the web app uses:"),
        code("typescript", `
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Level = (typeof LEVELS)[number] | "unknown";

function parseLevel(value: unknown): Level {
    return typeof value === "string" && (LEVELS as readonly string[]).includes(value)
        ? (value as Level)
        : "unknown";                       // a new server value is shown as a plain badge, not a crash
}

type CourseCard = { id: string; title: string; level: Level; publishedAt: string | null };

function toCourseCard(raw: Record<string, unknown>): CourseCard {
    return {
        id: String(raw.id),
        title: String(raw.title),
        level: parseLevel(raw.level),
        publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : null,
    };
}`, "src/api/course.ts"),
        p("Tolerant readers make your clients survive the next mistake, and you should ask client teams for them. They do not remove the server's duty: the apps already in the stores were written last year, and you cannot ship them a better decoder. A server-side check is the only thing that protects clients that already exist."),
        callout("info", "When you do not need this gate",
            "If an API has exactly one client that is built and deployed from the same commit - a backend-for-frontend used only by the web app, an internal endpoint called only by a job in the same repository - a breaking change costs one coordinated deploy, and a compatibility gate mostly slows you down. The gate earns its place as soon as a client is released on its own schedule: mobile apps, partner integrations, public SDKs, other teams' services."),

        p("Check that you can apply the direction rule before you automate it:"),
        challenge("chal_quiz_adp_321"),

        h2("4. Turning the rules into a check"),
        p("A compatibility check walks the old and the new schema together, from the root, and asks at each node whether an old reader could now receive something new. For response schemas written in the usual OpenAPI subset, the questions are:"),
        numbered([
            "**Did the type change?** A string that becomes an object, or an integer that becomes a number (`1.5` can now arrive where an `Int` was decoded), is breaking. When the type changed, the old and new children have nothing to be compared with, so the walk stops at that node. One direction is safe: `number` to `integer`, because every integer was already a valid number.",
            "**Can it be null now?** `nullable` appearing on a response property is breaking, as iOS showed.",
            "**Did the set of values grow?** New enum values are breaking for strict readers. Removing the enum list altogether means any string can arrive, which is the widest growth of all.",
            "**Can a property be missing now?** A removed property, and a property that leaves the `required` list, can both be absent where an old reader expects it.",
            "**And below it?** Object properties and array items are compared the same way, with a path that says where the change is: `/instructor/name`, or `/lessons/[]/title` for the title of every element of `lessons`.",
        ]),
        p("Everything else is additive or narrowing and passes: a new property (required or not - an old reader ignores it), a property that becomes required, `nullable` that disappears, an enum value that the server stops sending. Reporting those would make the gate cry wolf, and a gate that fails on safe changes is soon switched off."),
        callout("warning", "Adding an enum value is a decision, not a law",
            "Some teams publish a rule that clients must accept unknown enum values, and then treat new values as non-breaking. That is legitimate if the rule is written in the API guidelines from day one and checked in every client's code review. CodeDev never promised it, Android 4.12 shows that clients did not do it, so this course treats a new enum value in a response as breaking. Whatever you choose, document it next to the check."),
        p("In CI, the check runs on the previous release's spec and the spec in the pull request. A small script is enough; this one assumes every schema is inlined (resolve `$ref` first, for example with a dereferencing step in the build) and checks the `200` JSON response of every operation:"),
        code("typescript", `
// scripts/check-breaking.ts - tested with Node.js 22 (verify before use)
import { readFileSync } from "node:fs";
import { breakingChanges, type Schema } from "./breaking-changes.js";

type Operation = { responses: Record<string, { content?: Record<string, { schema: Schema }> }> };
type OpenApi = { paths: Record<string, Record<string, Operation>> };

const [basePath, headPath] = process.argv.slice(2);
const base: OpenApi = JSON.parse(readFileSync(basePath, "utf8"));
const head: OpenApi = JSON.parse(readFileSync(headPath, "utf8"));
const okJson = (op?: Operation) => op?.responses["200"]?.content?.["application/json"]?.schema;

let breaking = 0;
for (const [route, operations] of Object.entries(base.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
        const before = okJson(operation);
        if (!before) continue;
        const after = okJson(head.paths[route]?.[method]);
        const where = \`\${method.toUpperCase()} \${route}\`;
        if (!after) { console.log(\`\${where}: 200 JSON response removed\`); breaking++; continue; }
        for (const change of breakingChanges(before, after)) {
            console.log(\`\${where}: \${change.kind} \${change.path}\${"value" in change ? " " + change.value : ""}\`);
            breaking++;
        }
    }
}
process.exitCode = breaking > 0 ? 1 : 0;`, "scripts/check-breaking.ts"),
        code("bash", `
$ git show v2026.10.2:openapi.json > base.json      # the spec of the last release
$ node dist/scripts/check-breaking.js base.json openapi.json
GET /v1/users/me/enrollments: property_removed /[]/course/instructorName
$ echo $?
1`, "CI step"),
        p("Your turn: write `breakingChanges` itself. The challenge defines the schema subset, the path format and the exact order of the reports, including what to do below a node whose type changed."),
        challenge("chal_coding_adp_322"),

        h3("Use a maintained tool for the full specification"),
        p("Real OpenAPI documents have `$ref`, `allOf`/`oneOf`, parameters, headers, several status codes and several media types. For the whole document, use a maintained OpenAPI diff tool - oasdiff and openapi-diff are two open-source examples - which compares two spec files, classifies each change as breaking or not for requests and responses, and returns a failing exit code for CI. Check each tool's documentation for its exact commands and options, and compare its rules with yours: tools differ on exactly the judgment calls above, such as new enum values in responses. Writing the core yourself, as in the challenge, is how you learn to read their reports and to decide which rules your API follows."),

        h2("5. How to verify the gate"),
        numbered([
            "**Replay the incident.** Run the check with the spec of the last release before #807 as the base and #807's spec as the head. It must fail and name `/level` and `/publishedAt`. A gate that has never failed on a real incident has not shown it can.",
            "**Feed it safe changes.** A new optional property, a new required property, a removed enum value: the check must pass. This is what keeps the team from disabling it.",
            "**Compare against the right base.** The base is the spec of the last **released** version (a tag), not the target branch: two unreleased pull requests may each be compatible with `main` and still break the apps together.",
            "**Watch the exit code in CI.** The step must fail the pipeline, not only print. Check it once by opening a test pull request that removes a property.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Trusting contract tests for compatibility.** They compare the server with today's spec. Detect it: change the spec and the handler together in a test branch; if nothing fails, you have no compatibility gate.",
            "**Using the request rules for responses.** \"Only additions are safe\" is true for request bodies and false for enum values and nullability in responses. Detect it: for each edit, write down who reads the data before you classify it.",
            "**Removing an \"unused\" optional property.** Optional does not mean unread: the apps may show it whenever it is present. Detect it with client telemetry or a code search of each released app version (lesson 10), not by guessing.",
            "**Comparing with `main` instead of the last release.** The gate passes each pull request on its own while their sum breaks the apps. Detect it: the base path in CI is a release tag.",
            "**Failing on safe changes.** A check that reports new optional properties or removed enum values in responses gets ignored. Detect it with a test case of purely additive changes that must pass.",
        ]),

        h2("7. Summary"),
        bullets([
            "Breaking depends on the reader: in responses, anything new for the old client (missing, null, new values, new type) breaks it; in requests, anything the server no longer accepts breaks the old client.",
            "Contract tests check today's spec; a compatibility check compares it with the last release's spec. You need both, in CI.",
            "Ask clients to be tolerant readers, and still protect the clients already in the stores with a server-side gate whose rules - such as new enum values - are written down.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Take the OpenAPI document of an API you work on (or write a small one for the CodeDev courses endpoints), tag it as the base, and make five edits on a branch: add an optional property, remove a property, add an enum value, make a field nullable, make a request field required. Run an OpenAPI diff tool and your own check on the pair, and write a one-page note: which edits each one flags, where they disagree, and which rule your API will follow for new enum values."),

        h2("Sources"),
        bullets([
            "RFC 9413, Maintaining Robust Protocols (the robustness principle and its costs): https://www.rfc-editor.org/rfc/rfc9413",
            "OpenAPI Specification 3.1.0 (Schema Object, required, enum; nullable is the 3.0 keyword, 3.1 uses type: [\"string\", \"null\"]): https://spec.openapis.org/oas/v3.1.0",
            "Martin Fowler, TolerantReader: https://martinfowler.com/bliki/TolerantReader.html",
        ]),
    ],
});
