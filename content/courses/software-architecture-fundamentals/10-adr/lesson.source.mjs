// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-3-4",
    title: "Write the decision down: architecture decision records",
    slug: { _type: "slug", current: "write-the-decision-down-architecture-decision-records" },
    description:
        "Six months after the platform team chose a modular monolith, a new engineer proposes microservices again and nobody can find why the team said no: the reasoning lived in a chat thread that has since expired. Learn to write an architecture decision record (context, options, decision, consequences, re-evaluation triggers), read a complete ADR for the Monolith or Microservices decision, keep ADRs in the repository next to the code, supersede instead of rewriting, and check them in CI.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev platform team",
        problem:
            "April 2027. A developer who joined in February opens RFC-044, \"Move CodeDev to microservices\", with good arguments. Two meetings later the team is still re-deriving why it said no in October: the decision was made in a call and summarised in a chat thread that the free plan no longer shows (90 days of history). Two of the six people in that call have left. Someone remembers \"it was about deploys\". You are asked to make sure the next decision, and this one, can be read in five minutes by someone who was not there.",
    },

    content: [
        h2("1. The incident: a decision nobody can find"),
        p("Nothing broke in production, and yet the cost is real: two meetings of six people, and a newcomer who feels the team is defending a belief instead of a decision. Worse, nobody can say whether the October reasons still hold, because nobody can say what they were. Here is everything the repository says about the October decision:"),
        code("text", `
$ git log --oneline --grep="monolith" -i
a41c9e2 revert: extract notifications (back in-process, see thread)
$ ls docs/
api.md  onboarding.md  runbook.md`, "terminal"),
        p("\"See thread\" points at a thread that no longer exists. The code shows **what** was done; it cannot show **why**, which options were rejected, or what would change the answer."),

        h2("2. Core idea: record the decision, not just the result"),
        p("An architecture decision record (ADR) is a short text file, usually one page, that captures one significant decision at the moment it is made. The format most teams use comes from Michael Nygard; the sections are few and each has a job:"),
        bullets([
            "**Title and status.** A number and a short statement of the decision (`0007 Keep a modular monolith`), and a status: Proposed, Accepted, Superseded by NNNN.",
            "**Context.** The facts and forces at the time, with numbers and where they came from. This is the part future readers need most, because it lets them check whether the facts still hold.",
            "**Options considered.** At least two real ones, including \"no change\", each with why it was or was not chosen. It shows the alternative was weighed, not ignored.",
            "**Decision.** One or two sentences in active voice: \"We will ...\".",
            "**Consequences.** What gets easier **and** what gets harder or riskier. An ADR whose consequences are all positive is marketing.",
            "**Re-evaluation triggers.** Measurable conditions that reopen the decision, each with a threshold and the place to read it.",
        ]),
        h3("What deserves an ADR, and what does not"),
        p("Write one when a decision is expensive to reverse, affects more than one module or team, or will be questioned later: the structure of the system, a database, an integration style, a public API convention. Do not write one for a choice you can undo in an afternoon, such as a utility library or a folder name. A team that writes an ADR for everything stops reading them; a dozen good ones a year is plenty for a small team."),
        h3("Where ADRs live"),
        p("In the repository, next to the code they describe, as Markdown files numbered in order: `docs/adr/0007-keep-a-modular-monolith.md`. That gives them the same review process as code (a pull request, comments, an approval), the same history, and a link from the pull request that implements them. A wiki page or a chat thread has none of those, and can disappear with a plan change, as it did here."),
        p("An accepted ADR is **not edited** to follow later changes. When the decision changes, write a new ADR, set the old one's status to \"Superseded by NNNN\", and leave its text as it was: it is the record of what was known and decided at that time."),

        h2("3. Worked example: ADR 0007"),
        p("This is the ADR the team should have written on 16 October, for the decision from lesson 3.1. Compare it with the one you wrote as self-practice:"),
        code("text", `
# 0007. Keep a modular monolith for now

Status: Accepted (2026-10-16). Deciders: platform team. Supersedes: none.

## Context
- One team of 6 developers owns all five modules (catalog, orders, payments,
  notifications, progress); one board, one on-call rotation (CODEOWNERS).
- Deploys: median 20 min over 19 runs; 12.5 min of it is the test step on 1 worker.
  2 failed deploys in September, both from migration 0412 on the orders table,
  which orders, payments and progress/report.ts read directly (CI dashboard).
- Traffic: catalog reads are about 50x writes; Monday 19:00-21:00 peak at 71% app CPU
  on 2 instances x 2 vCPU, Postgres 38% (APM, 4 weeks).
- RFC-031 proposed 7 services with their own databases. Its first step (notifications
  as a service) caused INC-77: 37 receipts for declined cards, 12 learners got access
  without paying; root cause was the order of side effects in placeOrder.

## Options considered
1. RFC-031 as written: 7 services, own repositories and databases.
   Rejected: one team gets no independent deploys from it; the slow step and the
   shared table are not fixed by it; adds network failures and 7 pipelines.
2. One deployable app with enforced module boundaries (modular monolith). Chosen.
3. No change. Rejected: leaves the shared table and the slow test step as they are.

## Decision
We will keep one deployable application and make module boundaries enforceable:
public API per module, one owner per table, dependencies pointing one way, all checked in CI.
Notifications returns in-process behind the EmailSender port.

## Consequences
+ Tests in parallel and table ownership address both causes of the failed deploys.
+ Extracting a module later is an adapter change behind an existing port.
- All modules still share one deploy and one runtime: a heavy job can affect checkout.
- Ownership checks add CI time and require reads through other modules' APIs.
- We keep one database; a later split must move data out first.

## Re-evaluation triggers (reviewed monthly)
1. A second team owns a module end to end (CODEOWNERS).
2. A module is blocked by other modules' changes more than twice a month,
   after tests run in parallel (CI dashboard).
3. One module needs more than 3x the instances of the rest at its peak (APM).
4. A failure in one module takes checkout down twice in a quarter (incident log).

## Verification
Median deploy under 10 min; 0 failed deploys caused by another module's table;
0 known table-ownership violations by 2027-01-31.`, "docs/adr/0007-keep-a-modular-monolith.md"),
        p("Notice what makes it useful in April 2027. The newcomer can check each line of the context against today's dashboards in five minutes. If the team still has one owner for everything and no trigger has fired, RFC-044 has to show which fact changed. If a trigger did fire (in lesson 3.3 trigger 4 did fire, and the team answered it with a worker process), the ADR tells them which part of the decision to revisit. The \"Verification\" section is optional in most templates; it is worth adding, because it lets the team find out whether the decision worked."),

        challenge("chal_quiz_saf_341"),

        h2("4. Keeping ADRs alive"),
        p("ADRs fail in two ways: nobody writes them, or nobody reads them. A few habits prevent both:"),
        numbered([
            "**Write the ADR in the pull request that starts the work**, with status Proposed. The discussion happens in review comments, and merging sets it to Accepted.",
            "**Link it** from the code it governs: a comment in `src/modules/README.md` or the module's `index.ts` (\"boundaries: see ADR 0007\").",
            "**Read the triggers at the monthly review.** The signals sheet from lesson 3.3 is where the numbers come from.",
            "**Supersede, do not rewrite.** A changed decision is a new ADR that names the trigger that fired; the old one gets one line changed, its status.",
        ]),
        h3("A CI check for the format"),
        p("A small script keeps every ADR complete. It does not judge quality; it makes sure nobody merges a decision without a context, consequences or triggers, and that a superseded record points at a file that exists:"),
        code("typescript", `
// scripts/check-adrs.ts - run in CI: node scripts/check-adrs.ts
import { readdirSync, readFileSync, existsSync } from "node:fs";

const REQUIRED = ["## Context", "## Options considered", "## Decision", "## Consequences", "## Re-evaluation triggers"];
let errors = 0;

for (const file of readdirSync("docs/adr").filter((f) => /^\\d{4}-[a-z0-9-]+\\.md$/.test(f))) {
  const text = readFileSync(\`docs/adr/\${file}\`, "utf8");
  for (const section of REQUIRED) {
    if (!text.includes(section)) { console.log(\`\${file}: missing "\${section}"\`); errors++; }
  }
  const status = /^Status: (Proposed|Accepted|Superseded by (\\d{4}))/m.exec(text);
  if (!status) { console.log(\`\${file}: no valid "Status:" line\`); errors++; }
  else if (status[2] && !readdirSync("docs/adr").some((f) => f.startsWith(status[2]))) {
    console.log(\`\${file}: superseded by \${status[2]}, which does not exist\`); errors++;
  }
}
process.exitCode = errors ? 1 : 0;`, "check-adrs.ts"),

        h2("5. How to verify an ADR"),
        p("The test of an ADR is whether someone who was not there can use it. Three checks, each quick:"),
        bullets([
            "**The newcomer test.** Give the ADR to someone who was not in the meeting and ask them to explain why the rejected option was rejected and what would change the decision. If they need to ask you, the context or the triggers are missing something.",
            "**The trigger test.** For each re-evaluation trigger, can two people read the same dashboard and agree whether it fired? If not, it needs a number and a source.",
            "**The history test.** `git log docs/adr/0007-keep-a-modular-monolith.md` shows the pull request that proposed it and, later, only a status change. Any other edit after acceptance means the record was rewritten.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Decision without context.** \"We use a modular monolith.\" Spot it: no numbers, no sources, nothing a reader could check today.",
            "**One option.** The ADR describes only the chosen design. Spot it: no \"Options considered\", or options that nobody would seriously pick.",
            "**Only good consequences.** Spot it: no line starting with what gets harder, slower or riskier.",
            "**Triggers without numbers.** \"Revisit when the monolith is too big.\" Spot it: the trigger names no threshold and no place to read it.",
            "**Rewriting history.** The accepted ADR is edited to describe the new design. Spot it: the file's history shows content changes after the status became Accepted.",
        ]),

        h2("7. Summary"),
        numbered([
            "An ADR records one significant decision when it is made: context with numbers, real options, the decision, consequences both ways, and measurable re-evaluation triggers.",
            "Keep ADRs in the repository as numbered Markdown files, reviewed in pull requests and linked from the code; supersede with a new ADR instead of rewriting an accepted one.",
            "Verify an ADR with a newcomer, with triggers two people would read the same way, and with a CI check that every record has the required sections and a valid status.",
        ]),

        h2("Sources"),
        bullets([
            "Architecture decision records: templates, tools and examples - https://adr.github.io/",
            "Michael Nygard, \"Documenting Architecture Decisions\" (2011), the original ADR format",
            "Martin Fowler, \"MonolithFirst\" - https://martinfowler.com/bliki/MonolithFirst.html",
        ]),
        callout("tip", "Self-practice (not graded): write ADR 0008",
            "Write the ADR for the decision in lesson 3.3: running the leaderboard recompute in a separate worker process from the same codebase instead of extracting a leaderboard service. Use the sections of ADR 0007, take the numbers from the signals sheet, include at least one consequence that gets worse, and give two re-evaluation triggers that would turn the worker into a service. Then run it past the newcomer test with a colleague."),
    ],
});
