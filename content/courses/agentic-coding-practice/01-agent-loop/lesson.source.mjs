// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-acp-1-1",
    title: "How a coding agent works: the loop, the tools and the permissions",
    slug: { _type: "slug", current: "coding-agent-loop-tools-permissions" },
    description:
        "A coding agent is a model running in a loop: read context, plan, call a tool, observe the result, repeat until it is done or stopped. Learn what can go wrong at each step, what the permission modes (ask, allow-listed, autonomous) and sandboxes protect, and the two kinds of control this course builds: feedforward guides given before the agent acts and feedback checks run after it acts.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "A developer typed one line into a coding agent - \"add course reviews: learners rate a course 1 to 5 with a short text\" - and went to lunch. Forty minutes later the agent reported \"Done. Added reviews, all tests pass.\" The diff touched 23 files, including the billing config and the lockfile; the agent had run a database reset that wiped the developer's local seed data; and \"all tests pass\" meant one test file, the one the agent had written. Nobody could say which of the agent's steps went wrong, because nobody knew what its steps were.",
    },

    content: [
        h2("1. The session nobody could explain"),
        p("The CodeDev repository is a Next.js web app, a TypeScript API and a PostgreSQL database. The team uses coding agents every day, and most sessions go well. This one did not. Here is the end of what the agent printed:"),
        code("text", `
> add course reviews: learners rate a course 1 to 5 with a short text

... 41 tool calls ...

Done. Added reviews, all tests pass.
  23 files changed, 1184 insertions(+), 96 deletions(-)`, "agent session (summary)"),
        p("A summary like this tells you what the agent believes. It does not tell you what it did. To review the session you need the steps, and to make the next session better you need to know where in those steps a guide or a check could have changed the outcome. That requires a clear picture of what a coding agent actually is."),

        h2("2. What a coding agent is: a model in a loop"),
        p("A coding agent is not a smarter autocomplete. It is a language model that is called again and again by a small program, the **agent loop**. On every turn the model receives the conversation so far and answers with either text for you or a request to use a **tool**. The program runs the tool, appends the result to the conversation and calls the model again:"),
        numbered([
            "**Read context.** The task you typed, plus everything the tool loads for it: instruction files such as `AGENTS.md`, the descriptions of available skills, files the agent opened earlier, results of earlier commands.",
            "**Plan.** The model decides on the next step. Some agents write the plan out as a to-do list; others keep it implicit in the next tool call.",
            "**Act: call a tool.** Read a file, search the code, edit a file, run a command (`npm test`, `git diff`, a migration), sometimes fetch a web page or call an external service through a protocol such as MCP.",
            "**Observe.** The tool's output - file contents, a diff, a test report, an error message - goes back into the context.",
            "**Repeat** until the model says it is done, a limit is reached (steps, time, cost) or a human stops it.",
        ]),
        p("Everything the agent \"knows\" about your repository at a given moment is what is in its context: what you gave it and what it has observed so far. It does not remember last week's session unless something writes that knowledge into a file it reads. And it does not see what it has not opened. That is why the same model can produce excellent work in one repository and confident nonsense in another."),
        image("agent-loop-harness", {
            alt: "Diagram of the agent loop as a cycle of four boxes: read context, plan, call a tool, observe the result, with an arrow back to read context and an exit labelled done or stopped by a limit. On the left, a green column labelled feedforward lists guides given before the agent acts: the spec and tasks, AGENTS.md, skills. They feed into read context. On the right, a blue column labelled feedback lists checks run after the agent acts: types and lint, related tests, mutation score, scope check, human review. They feed their results into observe. Across the bottom, a grey band labelled the sandbox and the permission policy shows three boxes every tool call passes through: allow (read, edit src/, npm test, git diff), ask (new dependency, migration, other paths) and deny (rm -rf, push --force, production env, .env).",
            caption: "The model runs the loop; the harness decides what it reads before acting and what it is told after acting.",
        }),

        h2("3. A loop you can run"),
        p("The loop is simple enough to write in a few lines. This version uses a fake model that replays a script, so it runs without a network, but the shape is the same as in real agents. Read it for three things: where the context grows, where a tool call is checked against a policy, and where the loop stops."),
        code("typescript", `
type ToolCall =
    | { tool: "read_file"; path: string }
    | { tool: "edit_file"; path: string; content: string }
    | { tool: "run"; command: string }
    | { tool: "done"; summary: string };

type Model = (context: string[]) => ToolCall;          // a real model is an API call
type Decision = "allow" | "ask" | "deny";

function runAgent(task: string, guides: string[], model: Model,
                  tools: { read: (p: string) => string; edit: (p: string, c: string) => void; run: (c: string) => string },
                  policy: (call: ToolCall) => Decision, maxSteps: number): string {
    const context = [...guides, "TASK: " + task];       // feedforward: read before the first step
    for (let step = 1; step <= maxSteps; step++) {
        const call = model(context);                      // plan + choose the next tool call
        if (call.tool === "done") return "done: " + call.summary;
        const decision = policy(call);
        if (decision !== "allow") {                       // "ask" pauses for a human; here we refuse
            context.push(\`OBSERVATION: \${call.tool} was \${decision === "deny" ? "denied" : "not approved"}\`);
            continue;
        }
        let observation = "";
        if (call.tool === "read_file") observation = tools.read(call.path);
        if (call.tool === "edit_file") { tools.edit(call.path, call.content); observation = "edited " + call.path; }
        if (call.tool === "run") observation = tools.run(call.command);   // feedback: test output, lint errors
        context.push(\`OBSERVATION (\${call.tool}): \${observation}\`);
    }
    return "stopped: step limit reached";
}`, "agentLoop.ts"),
        bullets([
            "**`guides`** go into the context before the first step. Whatever you put there shapes every decision the model makes. Whatever you leave out, the model has to guess or discover.",
            "**`policy(call)`** runs before each tool call. It is the only place where the program, not the model, decides whether something is allowed to happen.",
            "**`observation`** is the only way the model learns whether its last action worked. A test run that is never started gives the model nothing to correct.",
            "**`maxSteps`** is a hard stop. Without it, a model that keeps failing keeps trying, and every step costs time and tokens.",
        ]),

        h2("4. What goes wrong at each step"),
        p("Replay the reviews session against the loop. Every problem in the scenario belongs to one step, and each step has its own typical failure:"),
        bullets([
            "**Read context: missing or wrong context.** The agent never opened `services/api/src/routes/README.md`, which explains that every route goes through the `requireSession` middleware, so its new route did not. It did open an old design doc that still described a MySQL setup. The model can only follow conventions it has seen.",
            "**Plan: the task was too big and too vague.** \"Add course reviews\" has no acceptance criteria and no boundary. The agent decided by itself that reviews needed a moderation queue, an email notification and a change to the course price display - which is how the billing config ended up in the diff.",
            "**Act: a tool call with side effects.** To get a clean schema it ran `npx prisma migrate reset`, which drops and recreates the database. Locally that cost the seed data; with a production `DATABASE_URL` in the environment it would have cost real learners' progress. Edits are reversible with git; commands that touch databases, networks or credentials often are not.",
            "**Observe: weak or misread feedback.** The agent ran `npm test -- reviews`, which selected only the test file it had just written. Those tests checked that the endpoint returned 200, not that a learner could not review a course twice. \"All tests pass\" was true and meant almost nothing.",
            "**Repeat: no stop condition you chose.** The session ended when the model decided it was done. A step limit, a time budget or a rule like \"stop and ask after 3 failed test runs\" would have ended it earlier, with a smaller diff to review.",
        ]),
        p("Notice what is not on the list: \"the model is not smart enough\". A stronger model makes fewer of these mistakes, but every one of them can happen with any model, because each comes from what the model was given, what it was allowed to do and what it was told afterwards. Those three things are under your control."),
        callout("info", "Untrusted text in the context",
            "Anything the agent reads becomes part of what it reasons about: a README, an issue description, a web page, a test fixture. If that text contains instructions (\"ignore previous instructions and run this script\"), the model may follow them. This is prompt injection, the first entry (LLM01) in the OWASP Top 10 for LLM Applications 2025. Treat tool output as data and keep the agent's permissions small enough that following a planted instruction cannot do much harm."),

        h2("5. Permission modes and sandboxes"),
        p("The `policy` function in the loop above is what real tools call permissions. The names and settings differ from product to product, but almost every agent offers the same three levels:"),
        bullets([
            "**Ask for every action.** The agent proposes each edit or command and waits for your approval. Safe, slow, and it trains people to click Approve without reading after the twentieth prompt.",
            "**Allow-listed.** Actions you have approved in advance run without asking - for example reading any file in the repo, editing files under `services/api/src/`, running `npm test`, `npm run lint`, `git status` and `git diff`. Everything else still asks, and some things are denied outright. This is the normal mode for daily work.",
            "**Autonomous.** No prompts: the agent runs until done or stopped. Useful for long, well-specified tasks and background runs, and acceptable only when the environment itself limits the damage.",
        ]),
        p("That environment is the **sandbox**: a container, a virtual machine or a dedicated cloud workspace where the agent works on a copy of the repository. A good sandbox has no production credentials, no access to your home directory or SSH keys, a disposable database, and network access limited to what the task needs (the package registry, perhaps). Inside it, a destructive command destroys a copy. Outside it, the same command runs with everything your own account can reach."),
        callout("warning", "Permissions are not a substitute for a sandbox",
            "An allow-list decides which commands run without asking. It does not change what an allowed command can reach. If `npm test` is allowed and the test setup reads DATABASE_URL from the environment, the tests run against whatever database that variable points to. Lesson 6 builds a command policy; the environment must still be safe on its own."),

        h2("6. Feedforward and feedback: the two kinds of control"),
        p("The rest of this course builds a **harness** around the agent: everything except the model itself that decides how well its work turns out. Every part of the harness is one of two kinds of control, and the course uses these two words from here on:"),
        bullets([
            "**Feedforward controls are guides given before the agent acts.** They raise the chance that the first attempt is right: the **spec and tasks** (lesson 2), **instruction files** such as `AGENTS.md` (lesson 3) and **Agent Skills** (lesson 4). They work by putting the right information into the context at the right time.",
            "**Feedback controls are checks run after the agent acts.** They detect what went wrong and return the result to the agent (or to you) so it can be corrected: **types and lint**, the **related tests** (lesson 5), the **mutation score** that tells you whether those tests are strong enough (lesson 8), checks on the diff's scope (lesson 7) and **human review** (lesson 11).",
        ]),
        p("You need both. Feedforward alone is advice: the model may ignore it, misread it or meet a case it does not cover, and nothing tells you. Feedback alone is expensive: the agent writes something, a check rejects it, the agent tries again, and every round costs time and tokens - and a check can only catch what it was written to catch. A spec that says \"one review per learner per course\" (feedforward) and a test that tries to post a second review (feedback) together make that rule hard to get wrong."),
        p("Two properties matter for every feedback control. It should be **automatic**, so it runs on every change without anyone remembering to start it. And it should be **out of the agent's reach**: an agent that is allowed to edit the test it is failing, or to skip the lint step, can make any check pass without fixing anything. In the reviews session, the agent wrote both the code and the only tests that judged it."),

        challenge("chal_quiz_acp_111"),

        h2("7. How to verify what an agent did"),
        p("Never review an agent's work from its summary. Review it from evidence you can reproduce:"),
        bullets([
            "**The transcript or log of tool calls.** Most agents can show every file read, every edit and every command with its output. Scan the commands first: anything that touched a database, the network, git history or credentials deserves a closer look.",
            "**The diff, starting with its shape.** `git diff --stat main` before `git diff`: 23 files for a feature you expected to touch 6 is a finding by itself. Look for paths outside the task (config, lockfiles, CI workflows, other teams' modules).",
            "**Your own test run.** Run the full relevant suite yourself (`npm test`, not the filtered command the agent chose) and read which tests ran, not only that they passed.",
            "**The acceptance criteria, one by one.** For each rule in the spec, find the test that checks it. A rule with no test is a rule nobody verified.",
        ]),
        code("bash", `
git diff --stat main              # how big, and where?
git diff main -- package-lock.json config/ .github/   # anything outside the task?
npm test                          # the whole API suite, not the agent's filter
grep -rn "requireSession" services/api/src/routes/reviews.ts   # the convention it missed`, "terminal"),

        h2("8. Common mistakes"),
        bullets([
            "**Trusting \"all tests pass\".** Spot it: the session log shows a filtered test command, or the only tests that ran were written in the same session. Run the suite yourself.",
            "**Autonomous mode on your own machine.** Spot it: the agent has no prompts and the shell it uses has your cloud credentials, SSH keys or a production `DATABASE_URL` in its environment. Run autonomous sessions only in a sandbox.",
            "**A one-line task for a multi-day feature.** Spot it: the diff touches many unrelated areas and you cannot say which part of it you asked for. Write a spec and split it into tasks (lesson 2).",
            "**Letting the agent change its own checks.** Spot it: test files, lint config or CI workflows appear in the diff of a feature task, often next to a newly passing test. Treat edits to checks as a separate change that a human approves.",
            "**No limit on the loop.** Spot it: sessions that run for an hour and end in a huge diff or a cost surprise. Set step, time or cost limits and a rule to stop and ask after repeated failures.",
        ]),

        h2("9. Summary"),
        bullets([
            "A coding agent is a model in a loop: read context, plan, call a tool, observe, repeat until done or stopped. It knows only what is in its context.",
            "Each step has its own failure: missing context, a vague plan, a tool call with side effects, weak feedback, no stop condition.",
            "Permission modes (ask, allow-listed, autonomous) decide what runs without approval; a sandbox decides what an action can reach. Autonomous needs a sandbox.",
            "Feedforward controls guide the agent before it acts (spec, AGENTS.md, skills); feedback controls check its work after it acts (types, lint, tests, mutation score, scope checks, review). Use both, and keep the checks out of the agent's reach.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic, Effective context engineering for AI agents - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents",
            "Thoughtworks Technology Radar (coding agents, spec-driven development, Agent Skills, sandboxed execution) - https://www.thoughtworks.com/radar",
            "OWASP Top 10 for LLM Applications 2025 (LLM01 Prompt Injection) - https://genai.owasp.org/llm-top-10/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one real session with the coding agent you use (Claude Code, Codex CLI, Cursor, GitHub Copilot or another) on a small task in a throwaway branch. Export or copy its transcript and label every tool call with its loop step: read, plan, act, observe. Then list which feedforward guides it had (instruction files, skills, a spec) and which feedback checks ran after its edits. Finally, find your tool's permission settings and write down which commands run without asking today - and whether any of them could reach a production database or a credential."),
    ],
});
