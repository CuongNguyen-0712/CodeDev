// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-1-2",
    title: "Designing narrow tools with clear descriptions & schemas",
    slug: { _type: "slug", current: "narrow-tools-clear-descriptions-schemas" },
    description:
        "The support agent's getEnrollment tool had the description \"Gets enrollment.\" and one parameter called id. The model passed the learner's email as the course id, the API answered 404, the handler turned that into null, and the agent told a paying learner he was not enrolled in anything. Learn to design tools as two things at once - a prompt the model reads and a contract your code enforces: narrow, task-shaped tools, names and descriptions that leave no guess, schemas with the tightest types, errors that tell the model exactly what to fix, and a registry that refuses vague tools before the agent starts.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer, CodeDev support agent",
        problem:
            "Ticket #9034 from Minh Tran: \"I paid for React Hooks yesterday but lesson 4 is still locked.\" The support agent answered: \"I checked your account and you are not enrolled in any course yet. You can buy React Hooks at app.codedev.test/courses/react-hooks.\" Minh had paid 299,000 VND the day before and was enrolled. The trace shows one tool call, getEnrollment {\"id\":\"minh.tran@example.com\"}, which returned null. The internal API log for the same second shows GET /internal/enrollments?courseId=minh.tran%40example.com&learnerId=u_4410 -> 404 course_not_found.",
    },

    content: [
        h2("1. The incident: a tool the model had to guess"),
        p("The support agent from lesson 1.1 kept a few read-only tools for its investigation step. One of them was added in a hurry, in the style of a quick internal helper:"),
        code("typescript", `
// support/tools.ts - the version that shipped
export const getEnrollment = {
    name: "getEnrollment",
    description: "Gets enrollment.",
    parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
    },
    async run(args: { id: string }, ticket: Ticket) {
        const res = await internalApi.get(\`/internal/enrollments?courseId=\${encodeURIComponent(args.id)}&learnerId=\${ticket.learnerId}\`);
        return res.ok ? res.json() : null;            // "nothing found"
    },
};`, "support/tools.ts"),
        p("Read it as the model does. It sees a name, the words \"Gets enrollment.\" and a parameter called `id` with type `string`. An id of what? The ticket in front of it contains one obvious identifier: the learner's email address. So the model passed that."),
        p("Then three things went wrong in a row. The schema accepted any string, so nothing rejected the email. The API answered `404 course_not_found`, which the handler collapsed into `null`. And the model, reading `null` after asking for an enrollment, concluded the learner had none, and said so with confidence."),

        h2("2. Read the evidence"),
        p("The agent's trace for the ticket, followed by the internal API's access log for the same second:"),
        code("text", `
ticket #9034  learner u_4410 (from the ticket, not from the model)
turn 1  model -> getEnrollment {"id":"minh.tran@example.com"}
        tool  -> null
turn 2  model -> final: "I checked your account and you are not enrolled in any course yet. You can buy ..."

internal-api  10:42:17.205  GET /internal/enrollments?courseId=minh.tran%40example.com&learnerId=u_4410  404  {"error":"course_not_found"}  6ms`, "trace + access log"),
        p("The evidence separates three design failures, each fixable on its own:"),
        numbered([
            "**The definition did not say what to pass.** No description for `id`, a name that does not say course, nothing about the format. The model filled the gap with the most likely string in its context.",
            "**The schema accepted values that can never be right.** A course slug never contains `@`. The constraint existed in everyone's head and nowhere in the schema.",
            "**The error was disguised as an answer.** \"Your input is not a course\" and \"this learner has no enrollment\" both became `null`. The model cannot recover from an error it cannot see.",
        ]),
        p("You can reproduce the whole incident without any real model: a scripted fake model (lesson 1.3) that proposes `getEnrollment {\"id\":\"minh.tran@example.com\"}` runs through the same handler and gets the same `null`. That script becomes the regression test."),

        h2("3. Core idea: one definition, two readers"),
        p("A tool definition is read twice. The **model** reads it on every request, as part of its prompt, to decide which tool to call and what to pass. **Your code** reads it on every proposed call, as a contract, to decide whether that call may run. A good definition serves both: everything the model needs to choose correctly, and every constraint your validator needs to say no precisely."),
        h3("Narrow, task-shaped tools"),
        p("A narrow tool does one job for the agent's actual tasks, with only the parameters that job needs. Two designs look reasonable and are not:"),
        bullets([
            "**Mirroring the REST API.** Thirty endpoints become thirty tools: `get_user`, `get_course`, `get_enrollment`, `list_enrollments`... The model must chain three of them to answer \"is this learner enrolled in React Hooks?\", and every extra step is a chance to pass the wrong id to the wrong tool.",
            "**One generic escape hatch.** `run_sql(query)` or `http_request(method, path, body)` can do anything, which means your validator can check nothing and the model must get the hard part (which table, which id, which filter) right on its own. OWASP lists this under LLM06 Excessive Agency: more functionality than the task needs.",
        ]),
        p("The task-shaped alternative is `get_learner_enrollment(course_slug)`: the learner is already known from the ticket (the identity rule from the Node.js AI course still applies: never a parameter), so the only thing the model chooses is the course, and the tool's name says so."),
        h3("Names and descriptions"),
        bullets([
            "**Names: `verb_noun`, snake_case, distinct.** `search_courses`, `get_learner_enrollment`, `list_submissions`. Never two tools whose names differ only by synonyms (`get_enrollment` and `fetch_enrollment_data`): the model will pick between them at random. Providers restrict tool names (typically letters, digits, underscores and hyphens, up to about 64 characters; check your provider's documentation), so a house rule stricter than all of them keeps you portable.",
            "**Descriptions: what, when, returns, format.** What the tool does, when to use it and when to use another tool instead, what it returns (including the \"nothing found\" shape), and for every parameter its format with one example. Write for a new colleague who has never seen your codebase, because that is what the model is.",
            "**Short enough to send every time.** Every description is part of every request's input tokens. Say the four things above and stop; a registry can enforce a length range as a lint, though no lint can tell you a description is clear.",
        ]),
        h3("Schemas: the tightest type that is still correct"),
        p("Each constraint does double duty: the model reads it, the validator enforces it. Prefer `enum` to a free string when the values are known, `integer` with `minimum` and `maximum` to an unbounded number, and strings with `maxLength` and a `pattern` when the format is fixed. A course slug is `^[a-z0-9]+(-[a-z0-9]+)*$`; an email will never match it."),
        h3("Errors the model can act on"),
        p("A tool call can end in three different ways, and the model must be able to tell them apart:"),
        bullets([
            "**Bad input**: an error that names every violated parameter and the expected format, all at once, so the model can fix everything in its next turn. \"`course_slug` does not match pattern ...\" is actionable; \"invalid request\" is not.",
            "**Nothing found**: a normal result, such as `{ \"found\": false, \"reason\": \"not_enrolled\" }`. That is an answer, not an error.",
            "**The tool is broken**: an error that says so (\"orders API timed out\"), so the model can try another way or hand over to a human. Lesson 1.3 turns these three into structured entries in the transcript.",
        ]),
        h3("When not to add a tool"),
        p("Do not add a tool for a value your code already knows: the learner, the ticket, the current course page. Load it and put it in the prompt. And do not grow the list without limit: overlapping tools lower the chance the model picks the right one, and every definition costs tokens on every call. The workflow from lesson 1.1 helps here: each route gets its own small tool set instead of one agent with everything."),

        challenge("chal_quiz_aam_121"),

        h2("4. Worked example: the fixed tools and a registry"),
        p("The rewrite splits the vague tool into two task-shaped ones. Notice what each description says about the other tool: the model learns the path \"title -> slug -> enrollment\" from the definitions themselves."),
        code("json", `
[
  {
    "name": "search_courses",
    "description": "Search the CodeDev catalog by words from a course title. Returns up to 5 courses with slug, title and level. Use it when the learner names a course but you do not know its slug.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Words from the course title, e.g. React Hooks", "minLength": 2, "maxLength": 100 },
        "level": { "type": "string", "description": "Only courses of this level", "enum": ["beginner", "intermediate", "advanced", "expert"] }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get_learner_enrollment",
    "description": "Read the enrollment of the learner who opened the current ticket in one course (the learner comes from the ticket, never from you). Returns status, progress and purchase date, or found: false.",
    "parameters": {
      "type": "object",
      "properties": {
        "course_slug": {
          "type": "string",
          "description": "Course slug as in the course URL, e.g. react-hooks for https://app.codedev.test/courses/react-hooks. Not an email, not a title: call search_courses first if you only have the title.",
          "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
          "maxLength": 80
        }
      },
      "required": ["course_slug"]
    }
  }
]`, "support/tools.json"),
        p("The handler keeps the three outcomes apart instead of returning `null` for all of them:"),
        code("typescript", `
type ToolResult = { ok: true; value: unknown } | { ok: false; error: string };

async function getLearnerEnrollment(args: { course_slug: string }, ticket: Ticket): Promise<ToolResult> {
    const res = await internalApi.get(
        \`/internal/enrollments?courseSlug=\${encodeURIComponent(args.course_slug)}&learnerId=\${ticket.learnerId}\`);
    if (res.status === 200) return { ok: true, value: { found: true, ...(await res.json()) } };
    const body = await res.json().catch(() => ({}));
    if (res.status === 404 && body.error === "not_enrolled") return { ok: true, value: { found: false, reason: "not_enrolled" } };
    if (res.status === 404 && body.error === "course_not_found") {
        return { ok: false, error: \`course "\${args.course_slug}" does not exist; call search_courses to find the slug\` };
    }
    return { ok: false, error: \`enrollments API answered \${res.status}; try again later or escalate\` };
}`, "support/getLearnerEnrollment.ts"),
        h3("The registry: refuse vague tools before the agent starts"),
        p("Every tool goes through one registry. It checks each definition once, at startup, and returns **every** problem it finds, so a developer fixes a tool file in one pass instead of one error per restart:"),
        code("typescript", `
function registerTool(registry: Map<string, ToolSpec>, spec: ToolSpec): string[] {
    const errors: string[] = [];
    if (spec.name.length > 64 || !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(spec.name)) {
        errors.push(\`name must be snake_case, 1-64 characters (got \${JSON.stringify(spec.name)})\`);
    } else if (registry.has(spec.name)) {
        errors.push(\`name "\${spec.name}" is already registered\`);
    }
    // ... description length, parameter descriptions, types, ranges, patterns, required entries
    if (errors.length === 0) registry.set(spec.name, spec);   // only a clean spec is registered
    return errors;
}

// at startup: refuse to start an agent with a vague tool
const problems = allToolSpecs.flatMap((spec) => registerTool(registry, spec).map((e) => \`\${spec.name}: \${e}\`));
if (problems.length > 0) throw new Error(\`tool registry:\\n\${problems.join("\\n")}\`);`, "support/registry.ts"),
        p("The shipped `getEnrollment` fails three checks at once: its name is camelCase, its description is under the length floor, and `id` has no description. The same registry produces the listing the model receives (each definition normalised: trimmed text, a fixed key order, `additionalProperties: false`) and validates every proposed call against it. For the incident's call it answers:"),
        code("text", `
call get_learner_enrollment {"course_slug":"minh.tran@example.com"}
-> rejected: "course_slug" does not match pattern ^[a-z0-9]+(-[a-z0-9]+)*$`, "registry output"),
        p("That message goes back to the model instead of `null`. Replayed with a scripted fake model, the next turn is `search_courses {\"query\":\"React Hooks\"}`, then `get_learner_enrollment {\"course_slug\":\"react-hooks\"}`, then a correct answer: enrolled since yesterday, lesson 4 locked because lesson 3's quiz is not passed yet."),

        h2("5. How to verify"),
        bullets([
            "**Registry lint in CI.** A unit test registers every tool file and fails on the first non-empty error list. A vague tool never reaches production, and the error tells the author what to fix.",
            "**Snapshot the listing.** Store the JSON the model receives in a snapshot test. When someone edits a description, the review diff shows exactly what the model will read differently.",
            "**Replay the incident.** The scripted fake model proposes the email again; the test asserts the handler never ran and the transcript holds the pattern error. That pins both the schema and the error path.",
            "**Watch rejections per tool.** Log every validation rejection with the tool name and the messages. A jump in rejections for one tool right after a description change is a regression you can see the same day.",
            "**Tool-selection eval (offline).** A few dozen recorded tickets with the tool and arguments a human would choose, run against the real model when definitions change. Measure the share of correct first calls per tool.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Constraints only in prose.** \"Must be a course slug\" in the description but `type: \"string\"` alone in the schema: the model may follow it, the validator cannot. Spot it by searching descriptions for \"must\", \"only\" and \"format\" and checking the schema says the same thing.",
            "**Errors collapsed into empty results.** `return res.ok ? data : null` hides bad input and outages behind a fake \"nothing found\". Spot handlers that return `null`, `[]` or `{}` from a `catch` or a non-2xx branch.",
            "**Stopping at the first violation.** The model fixes one problem per turn and each turn resends the whole transcript. Spot validators that `return` inside the loop over parameters.",
            "**Overlapping tools.** Two tools that can answer the same question with different names. Spot it by asking, for each pair of tools, \"for which ticket would the model pick one over the other?\" If you cannot answer, merge them.",
            "**Copying the spec into the listing.** Sending the raw tool file to the model leaks internal fields and whatever whitespace or key order the author used. Spot it when the listing code is `JSON.stringify(spec)` instead of a function that builds the model's view.",
        ]),

        h2("7. Build the tool registry"),
        p("Write the registry the support agent uses: register tool specs with every problem listed in a fixed order, list the registered tools exactly as the model receives them, and validate proposed calls with every violation listed. The tests replay the incident, recorded proposals with inherited names such as `constructor` and `__proto__`, values at every limit, and 600 recorded calls against 40 tool files."),
        challenge("chal_coding_aam_122"),

        h2("8. Summary"),
        numbered([
            "A tool definition is a prompt for the model and a contract for your code. Make tools narrow and task-shaped: no REST mirror, no generic escape hatch, identity from the session.",
            "Leave the model nothing to guess: snake_case `verb_noun` names, descriptions that say what, when, what returns and in which format, and schemas with the tightest types (enum, ranges, lengths, patterns).",
            "Errors are for the model: list every violation with the parameter and the expected format, keep \"nothing found\" as a result, and refuse vague tools in a registry before the agent starts.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic, \"Building effective agents\", appendix on prompt engineering your tools - anthropic.com/engineering/building-effective-agents",
            "JSON Schema, Understanding JSON Schema: type-specific keywords (string length and pattern, numeric ranges, enum) and object properties - json-schema.org/understanding-json-schema",
            "OWASP Top 10 for Large Language Model Applications 2025, LLM06 Excessive Agency - owasp.org/www-project-top-10-for-large-language-model-applications",
            "Your model provider's tool-use documentation, for its exact name rules and schema support",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the tool list of an agent you know, or draft one for the CodeDev certificate questions (\"where is my certificate?\", \"my name is wrong on it\"). For each tool write the one-line answer to \"when would the model pick this one and not another?\". Merge every pair where you cannot answer, then run the tool files through your registry and fix everything it lists."),
    ],
});
