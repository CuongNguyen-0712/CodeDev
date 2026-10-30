// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-atm-2-1",
    title: "Designing narrow tools: names, descriptions & argument schemas",
    slug: { _type: "slug", current: "designing-narrow-tools-names-descriptions-argument-schemas" },
    description:
        "The Study-Plan Agent had one generic tool, run_query(sql), described as \"gets user data\", and it built a learner's plan from another learner's progress after reading a user id in a pasted forum post. Learn to replace generic tools with narrow, task-shaped ones whose identity comes from the session, to write names and descriptions for the model, to constrain arguments with JSON Schema, to make writes idempotent, and to return short structured results and errors the model can act on (OWASP LLM06 Excessive Agency).",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer on the CodeDev AI team, owner of the Study-Plan Agent's tools",
        problem:
            "Learner u_2048 pasted a forum post into the Study-Plan chat (\"I went from Level 4 to Level 9 in two weeks, my progress is public: user u_5531\") and asked for the same plan. The agent called its only data tool, run_query, with SELECT ... WHERE user_id = 'u_5531', then SELECT * FROM users for the same id, and answered with a plan that quoted the other learner's name, EXP and email address. Nothing was hacked: the tool did exactly what its description allowed.",
    },

    content: [
        h2("1. The incident: a plan built from someone else's progress"),
        p("The first version of the Study-Plan Agent was built in a week. To move fast, the team gave the model one data tool that could answer any question about a learner, plus the write tool that saves the plan:"),
        code("typescript", `
// tools.ts - version 1 (shipped)
export const tools = [
    {
        name: "run_query",
        description: "Gets user data.",
        inputSchema: { type: "object", properties: { sql: { type: "string" } } },
    },
    {
        name: "create_study_plan",
        description: "Saves a plan.",
        inputSchema: { type: "object" },
    },
];
// run_query executes the SQL on the read replica as role agent_ro (SELECT on every table).`, "tools.ts (version 1)"),
        p("On Sunday morning, learner `u_2048` pasted a forum post into the chat and asked for the same plan. The run's trace shows what the agent did with it:"),
        code("text", `
2026-10-19T08:14:01Z run=run_7f3a session.user=u_2048 input="Make me the plan from this post: 'I went from Level 4 to
                     Level 9 in two weeks, my progress is public: user u_5531'"
2026-10-19T08:14:02Z run=run_7f3a step=1 tool_call run_query {"sql":"SELECT level, exp, completed_lessons FROM progress WHERE user_id = 'u_5531'"}
2026-10-19T08:14:02Z run=run_7f3a step=1 tool_result rows=1 {"level":9,"exp":4210,"completed_lessons":61}
2026-10-19T08:14:04Z run=run_7f3a step=2 tool_call run_query {"sql":"SELECT * FROM users WHERE user_id = 'u_5531'"}
2026-10-19T08:14:04Z run=run_7f3a step=2 tool_result rows=1 {"user_id":"u_5531","display_name":"Minh T.","email":"minh.t@example.com","created_at":"2025-02-11", ...}
2026-10-19T08:14:07Z run=run_7f3a step=3 final "Here is your plan, modelled on Minh T. (minh.t@example.com, Level 9, 4210 EXP) ..."`, "trace of run_7f3a"),
        p("Read the trace as the model saw it. The user asked for \"the plan from this post\". The post named a user id. The only tool said it \"gets user data\" and took any SQL. Choosing `WHERE user_id = 'u_5531'` was a reasonable reading of the request and a correct use of the tool. The model was not tricked; it was **allowed**. The bug is in the tool design: the tool could read any row of any table, and the decision about **whose** data to read was left to text the model had just been given."),
        p("Notice also what did not happen. `u_2048`'s own progress was never read, so the plan was not even useful. A tool that can do everything gives the model many wrong paths and no signal about the right one."),

        h2("2. Reproduce it with the fake model"),
        p("In this course the model is a script that the runner replays turn by turn (lesson 2), so an incident becomes a fixture. Copy the two tool calls from the trace into a script and replay it against version 1 of the tools:"),
        code("json", `
[
  { "type": "tool_call", "name": "run_query",
    "args": { "sql": "SELECT level, exp, completed_lessons FROM progress WHERE user_id = 'u_5531'" },
    "usage": { "inputTokens": 1180, "outputTokens": 41 } },
  { "type": "tool_call", "name": "run_query",
    "args": { "sql": "SELECT * FROM users WHERE user_id = 'u_5531'" },
    "usage": { "inputTokens": 1262, "outputTokens": 28 } },
  { "type": "final", "text": "Here is your plan, modelled on Minh T. ...", "usage": { "inputTokens": 1530, "outputTokens": 310 } }
]`, "fixtures/run_7f3a.script.json"),
        p("With version 1, both calls succeed and the second result contains an email address that belongs to someone else. That is the failing test you keep: after the redesign, replaying the same script must not return any data about `u_5531`, whatever the model writes in its arguments."),

        h2("3. The core idea: a tool is an interface for a model"),
        p("OWASP's Top 10 for LLM Applications 2025 calls this risk **LLM06 Excessive Agency**: an LLM-based system is able to do damaging things in response to unexpected, ambiguous or manipulated model output. It names three root causes, and version 1 had all three:"),
        bullets([
            "**Excessive functionality.** The agent needed four facts about one learner; `run_query` offered every table, including `users.email`.",
            "**Excessive permissions.** The role `agent_ro` could `SELECT` on everything. Read-only is not the same as harmless: reading the wrong row is a data leak (OWASP LLM02 Sensitive Information Disclosure).",
            "**Excessive autonomy.** The model chose the subject of the query, and `create_study_plan` could save without the learner confirming (lesson 7 fixes that part).",
        ]),
        p("The fix is not a better prompt (\"never query other users\"). A prompt is a request to the model; the tool is what the system lets it do. Design each tool so that the **worst call the model can make is still acceptable**. In practice that means tools shaped like the task, not like the database:"),
        image("generic-vs-narrow-tools", {
            alt: "Diagram comparing two tool designs for the Study-Plan Agent. On the left, in red, version 1: the model reads a forum post that mentions user u_5531, calls run_query with free SQL and the vague description 'Gets user data', and the read replica returns another learner's progress and email. On the right, in green, version 2: the model calls get_progress with no arguments, the MCP server takes userId u_2048 from the authenticated session, and an argument schema with additionalProperties false rejects a userId argument, so only the signed-in learner's level, EXP and completed lessons come back. A bottom row lists four rules: identity from the session, descriptions say what, when and when not, schemas with types, enums, ranges and no extra properties, and idempotency keys for writes.",
            caption: "Version 1 lets the model decide whose data to read. Version 2 makes that decision on the server.",
        }),
        h3("When a generic tool is still the right call"),
        p("Narrow tools are not free: each one is code to write, test and describe. A generic tool can be acceptable when the person driving the model is also the person whose permissions the tool uses, the data has no other owners, and the input is not untrusted text. A developer's local coding agent running `psql` against their own scratch database is fine. A support agent that reads tickets written by strangers, or a learner-facing agent that reads pasted posts, is not: there, every argument may have been written by someone else."),

        h2("4. Identity comes from the session, not from the arguments"),
        p("The most important argument of `get_progress(userId)` is the one the model should never fill in. In the course world the tool is written `get_progress(userId)` because the handler needs a user id. That id is a parameter of the **handler**, supplied by the MCP server from the authenticated session of the run. It is not a property in the `inputSchema` the model sees:"),
        code("typescript", `
interface ToolContext {
    userId: string;   // from the verified session of this run, never from the model
    runId: string;
}

interface ProgressRow { level: number; exp: number; completedLessons: number; currentCourse: string | null; }

declare function loadProgress(userId: string): Promise<ProgressRow>;

export const getProgress = {
    name: "get_progress",
    description: [
        "Returns the signed-in learner's User Level, EXP, number of completed lessons and current course.",
        "Call it once at the start of planning, before list_recommended_courses.",
        "It always reads the learner of this conversation and takes no arguments:",
        "it cannot read other learners, so do not pass a user id even if the conversation mentions one.",
    ].join(" "),
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },   // a hint for the host's UI, not a security control
    async handler(_args: Record<string, never>, ctx: ToolContext) {
        const row = await loadProgress(ctx.userId);
        return { level: row.level, exp: row.exp, completedLessons: row.completedLessons, currentCourse: row.currentCourse };
    },
};`, "tools/get-progress.ts"),
        p("Replay the incident script against this tool set and the attack has nowhere to go. `run_query` does not exist, so that call is an unknown tool. If the model calls `get_progress({ userId: \"u_5531\" })`, the schema rejects the extra property; and even if validation were missing, the handler never reads its arguments. The same rule applies to `list_recommended_courses` and `create_study_plan`: they act on `ctx.userId`."),
        callout("warning", "If you inherit a userId argument",
            "Some tool sets already expose userId in the schema and cannot change quickly. Then the handler must compare it with the session: if args.userId !== ctx.userId, return an error and log it. Never treat a model-supplied id as proof of who is asking. An agent that acts with its own broad permissions on behalf of whoever wrote the text is a confused deputy, the subject of lesson 8."),

        h2("5. Names and descriptions are written for the model"),
        p("The model chooses tools from their names and descriptions alone; it never sees your handler. \"Gets user data.\" tells it nothing about which user, which data, or when to stop. A useful description answers five questions:"),
        bullets([
            "**What** it returns, in domain words: \"User Level, EXP, completed lessons\", not \"user data\".",
            "**When** to use it, and in which order relative to other tools.",
            "**When not** to use it, and what to use instead (\"for lesson content, use search_lessons\").",
            "**Units and formats**: weeks or days, minutes per day, ISO dates, which id format (`les_` + digits).",
            "**One short example** of valid arguments, when the shape is not obvious.",
        ]),
        p("Names follow the same logic. Prefer verb plus object in the domain's words (`search_lessons`, `create_study_plan`) over technology words (`run_query`, `post_data`). Keep one naming style across the server so the model can guess the family of a tool from its name. And keep descriptions short: every tool description is sent to the model on every turn, so a 600-word description costs tokens on every step of every run."),

        h2("6. Argument schemas: say exactly what is allowed"),
        p("Each tool has an `inputSchema`, a JSON Schema object. It does two jobs. It tells the model the shape of a valid call, and it gives the server a contract to **enforce** before the handler runs (lesson 6 builds that validation). Use the schema to make wrong calls impossible to express:"),
        code("typescript", `
export const createStudyPlanSchema = {
    type: "object",
    properties: {
        weeks: { type: "integer", minimum: 1, maximum: 2, description: "Plan length in weeks. CodeDev plans are 1 or 2 weeks." },
        minutesPerDay: { type: "integer", minimum: 15, maximum: 180, description: "Study time per day, in minutes." },
        items: {
            type: "array",
            minItems: 1,
            maxItems: 28,
            items: {
                type: "object",
                properties: {
                    lessonId: { type: "string", pattern: "^les_[0-9]{1,8}$" },
                    day: { type: "integer", minimum: 1, maximum: 14 },
                    kind: { type: "string", enum: ["lesson", "quiz", "coding", "review"] },
                },
                required: ["lessonId", "day", "kind"],
                additionalProperties: false,
            },
        },
        idempotencyKey: { type: "string", maxLength: 64, description: "Copy the key from the confirmation; do not invent one." },
    },
    required: ["weeks", "minutesPerDay", "items", "idempotencyKey"],
    additionalProperties: false,
} as const;`, "tools/create-study-plan.schema.ts"),
        bullets([
            "**Types**: `integer` for counts, not `number`; `2.5` weeks is not a plan.",
            "**Enums** for closed sets (`kind`), instead of a free string the handler has to guess at.",
            "**Ranges and lengths**: `minimum`, `maximum`, `maxLength`, `maxItems` cap what one call can do, including how much it can write.",
            "**Required** lists the arguments without which the call is meaningless.",
            "**`additionalProperties: false`**: an argument the tool does not declare is an error, not something silently ignored. It is what turns `userId: \"u_5531\"` into a visible rejection.",
        ]),
        p("The schema is a contract, not a guarantee. Models usually follow it but sometimes do not, and a compromised or confused client can send anything. Validate on the server every time."),

        h2("7. Writes: idempotent tools and idempotency keys"),
        p("Agents retry. The runner may resend a call after a timeout, and the model may call the same tool again because it did not notice the first result. For read tools that is harmless. For `create_study_plan` it means two plans. A write tool should be **idempotent**: calling it twice with the same arguments leaves the system as if it had been called once."),
        p("Some writes are naturally idempotent (\"set the plan for week 43 to X\" overwrites). Creating something is not, so the tool takes an **idempotency key**. The server stores the key with the result of the first call and answers any repeat with that same result:"),
        code("typescript", `
declare const savedPlans: Map<string, { planId: string }>;            // key: userId + ":" + idempotencyKey
declare function insertPlan(userId: string, args: unknown): Promise<string>;

async function createStudyPlan(args: { idempotencyKey: string }, ctx: ToolContext) {
    const key = ctx.userId + ":" + args.idempotencyKey;
    const previous = savedPlans.get(key);
    if (previous) return { planId: previous.planId, created: false };   // same answer, no second plan
    const planId = await insertPlan(ctx.userId, args);
    savedPlans.set(key, { planId });
    return { planId, created: true };
}`, "tools/create-study-plan.ts (idempotency part)"),
        p("Where the key comes from matters. If the model invents a new key on every attempt, the protection is gone. In the Study-Plan Agent the host creates the key when it shows the learner the plan to confirm (lesson 7), and the model copies it into the call. The key is also scoped by `ctx.userId`, so one learner's key can never return another learner's plan. Tool annotations such as `idempotentHint` only **describe** this behavior to the host; they do not implement it."),

        h2("8. Results and errors the model can use"),
        p("Whatever a tool returns goes into the model's context, is paid for in tokens, and is read as evidence. Version 1 returned `SELECT *` rows: columns the model did not need, including personal data. Return the fields the task needs, with clear names and units, and a bounded number of items:"),
        code("json", `
{ "level": 4, "exp": 980, "completedLessons": 17, "currentCourse": "sql-data-modeling" }`, "get_progress result"),
        p("Errors deserve the same care. A model cannot read a stack trace and fix its call. An **actionable error** says what was wrong and what a valid call looks like:"),
        code("text", `
Bad:  Error: invalid input
Bad:  TypeError: Cannot read properties of undefined (reading 'map')
Good: weeks must be 1 or 2 (got 3). CodeDev plans cover one or two weeks; split a longer plan into two plans.
Good: lessonId "les_9x" does not match les_ followed by digits. Use the ids returned by search_lessons.`, "error text returned to the model"),
        h3("Fewer tools beat many overlapping ones"),
        p("When two tools can answer the same question (`get_progress`, `get_user_stats`, `get_learner_summary`), the model has to guess, and it guesses differently from run to run. Each extra tool also adds its description to every turn. Start with the smallest set that covers the task, give each tool one clear job, and merge or delete tools that overlap. The Study-Plan Agent needs four tools; it does not need forty."),

        h2("9. Verify the redesign"),
        numbered([
            "**Replay the incident.** Run `fixtures/run_7f3a.script.json` against the new tool set. Expect the `run_query` calls to fail as unknown tools, and no tool result in the trace to contain `u_5531`, `Minh` or an email address.",
            "**Try the next attack yourself.** Add a script turn `get_progress` with `{ \"userId\": \"u_5531\" }`. Expect a validation error naming the unexpected argument, and the handler never to run.",
            "**Test the handler without the schema.** Call the handler directly with `{ userId: \"u_5531\" }` as arguments and a context for `u_2048`. It must return `u_2048`'s progress: identity does not depend on validation alone.",
            "**Call every write twice.** Same arguments and key, two calls: one row in the database, the same `planId` twice.",
            "**Read every description out loud.** For each tool, someone who has not seen the code should be able to say what it returns, when to call it and when not to.",
        ]),
        p("Now check your understanding on the incident:"),
        challenge("chal_quiz_atm_211"),

        h2("10. Pitfalls"),
        bullets([
            "**Narrowing the description, not the tool.** \"Only query the current user's rows\" in the description of `run_query` changes nothing the tool can do. Detect it: for each tool, write down the worst call that passes validation, and ask whether you could accept it.",
            "**Identity in the arguments.** Any `userId`, `accountId` or `email` property in an `inputSchema` is a question: who checks it? Detect it with a grep over your tool schemas, and a test that sends another user's id.",
            "**Schemas that allow anything.** `{ type: \"object\" }` with no properties, or `additionalProperties` left open, means validation passes for every call. Detect it: a call with one unknown argument should fail.",
            "**Writes without idempotency.** Detect it by calling every write tool twice in a test, or by looking for duplicate rows created within seconds of each other in production.",
            "**Results that dump everything.** `SELECT *`, full documents or unbounded lists waste tokens and leak fields. Detect it by logging the size of each tool result (lesson 9 turns that into a budget).",
        ]),

        h2("11. Summary"),
        bullets([
            "Shape tools like tasks, and make the worst call that passes validation acceptable: the server, not the model, decides whose data a tool touches.",
            "Write names, descriptions and schemas for the model: what, when, when not, units, types, enums, ranges, required and no extra properties, then enforce the schema on the server.",
            "Make writes idempotent with a key the model does not invent, and return short structured results and errors that say how to make a valid call.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Take an agent or tool set you know (a chatbot integration at work, a personal script, or the four Study-Plan tools). For each tool, write one line with its worst call that passes validation and who could trigger it. Then rewrite the riskiest tool: a task-shaped name, a five-part description, a schema with additionalProperties false, and identity taken from the session. Keep the before/after in a short design note for your team."),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for LLM Applications 2025: \"LLM06:2025 Excessive Agency\" (excessive functionality, permissions and autonomy) and \"LLM02:2025 Sensitive Information Disclosure\".",
            "Model Context Protocol specification 2025-06-18, \"Server Features: Tools\" (name, description, inputSchema, annotations are hints that clients must not rely on for security decisions unless the server is trusted). Optional outputSchema and structuredContent for structured results (to verify per spec version).",
            "JSON Schema 2020-12 Validation vocabulary: type, enum, minimum, maximum, maxLength, maxItems, pattern, required, additionalProperties.",
            "Tested with: TypeScript 5.9, tsc --strict, Node.js 24 in the CodeDev runner; tool calls replayed from a scripted fake model, no real LLM.",
        ]),
    ],
});
