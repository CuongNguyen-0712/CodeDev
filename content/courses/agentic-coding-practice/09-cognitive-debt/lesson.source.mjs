// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-3-3",
    title: "Cognitive debt: owning code you didn't write",
    slug: { _type: "slug", current: "cognitive-debt-owning-agent-code" },
    description:
        "Learning streaks broke for learners in Vietnam, and nobody on the team could explain the streak code an agent had written over three months - so the fix took two days of re-prompting. Learn what cognitive debt is, how to spot it before an incident does, the habits that keep it down (explain-back before merge, small diffs, design notes, rotating reviewers, core logic people understand) and a few cheap numbers that show whether it is growing.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "On Monday 12 October support received 140 tickets in four hours: learners in Vietnam had lost their learning streak although they studied every day. The streak code in src/progress/streak/ was written almost entirely by a coding agent over three months, every PR had passed review and the module had 92% test coverage. The on-call developer could not explain what normalizeDay() did, neither could the two developers who had merged its PRs. They asked the agent to fix it four times; each fix turned a different test red. A developer finally read the module end to end, found a sign error in the time-zone offset and fixed it in six lines - two days after the first ticket.",
    },

    content: [
        h2("1. The incident: green tests, nobody home"),
        p("The bug itself was small. Learners store their time-zone offset in minutes east of UTC (`420` for Vietnam, UTC+7), and the streak code turns each session's timestamp into a local calendar day before it counts consecutive days. This is the function the on-call developer found:"),
        code("typescript", `
// src/progress/streak/normalizeDay.ts (written by the agent in July)
export function normalizeDay(ts: string, tzOffsetMin: number): string {
    const d = new Date(ts);
    d.setUTCMinutes(d.getUTCMinutes() - tzOffsetMin); // align to the learner's day
    return d.toISOString().slice(0, 10);
}`, "normalizeDay.ts"),
        p("The comment sounds right, and the tests were green: they only used offset `0`, where the sign does not matter. With `420`, the function moves the time seven hours the wrong way, so a session at 08:00 on 12 October in Hanoi (01:00 UTC) is counted on 11 October. Any learner who studied in the morning one day and in the evening the day before had two sessions on the same \"day\" and a gap elsewhere, and the streak reset."),
        p("The bug is not the story. Bugs like this happen in code written by people too. The story is the two days: **nobody on the team had a mental model of this module**, so the only tool left was to ask the agent again, and the agent did not have one either."),

        h2("2. Read the evidence: what the history says"),
        p("The post-incident review looked at how the module was built, not only at the bug. Three commands and the review data of the Git host were enough:"),
        code("bash", `
$ git log --since="2026-07-01" --format="%an" -- src/progress/streak | sort | uniq -c
     38 codedev-agent[bot]
      3 dev-a
      2 dev-b

$ git log --since="2026-07-01" --shortstat --format="" -- src/progress/streak | awk '{f+=$1; i+=$4} END {print f" file changes, "i" insertions"}'
212 file changes, 5934 insertions

$ grep -rn "tzOffsetMin" tests/progress | grep -v ", 0)" | wc -l
0`, "terminal"),
        bullets([
            "38 of 43 commits came from the agent; the 5 human commits were renames and config. Nobody had written or rewritten any logic in the module.",
            "The Git host's review data showed 11 PRs into the module with a median of 540 changed lines and a median review time of 6 minutes, and no review comment longer than one sentence.",
            "No test used an offset other than 0. Coverage counted the lines as covered; nobody had asked what the function should return for Hanoi.",
            "The on-call notes: \"asked agent to fix streak reset\" four times, each followed by \"test X now red, reverted\".",
        ]),

        h2("3. Cognitive debt: the gap between the code and the team"),
        p("**Technical debt** is code that is harder to change than it should be. **Cognitive debt** is code that the people responsible for it do not understand: the gap between what the system does and what the team can explain about it. The two often travel together, but cognitive debt can sit in clean, well-tested code - as it did here - and it is paid back the same way, with interest, at the worst moment: during an incident, a security review or a change nobody can estimate."),
        p("Coding agents did not invent this. Code copied from a forum, a departed colleague's module or a big vendor SDK all create it. Agents make it cheaper to create at scale: they produce plausible, working code faster than a team can absorb it, and approving a green PR feels like understanding it. Thoughtworks' Technology Radar (Vol. 34) is one of the places that has drawn attention to this risk of AI-assisted development; the term is young, so expect definitions to vary."),
        h3("When it is fine not to understand everything"),
        p("Owning code does not mean every developer understands every line. Some code may stay a black box at low risk: generated clients built from an API schema you control, boilerplate with a clear contract and tests at its boundary, a one-off script, a prototype you will delete. Spend the understanding where an incident would hurt: money and prices, permissions, grading and progress, anything that touches personal data. The streak module was core logic - it decides what learners see as their achievement - and it was treated like boilerplate."),

        h2("4. Signs you are accumulating it"),
        bullets([
            "**Nobody can explain the diff.** Ask the author of a merged PR how one branch of the code behaves. \"The agent did it, the tests pass\" is the sign. Spot it: in review, ask one \"what happens if...\" question per PR and see if it gets an answer without running anything.",
            "**Every bug goes back to the agent.** Incidents in a module are fixed by re-prompting, not by reading. Spot it: on-call notes or PR descriptions that say \"asked the agent to fix\" repeatedly for the same area.",
            "**Reviews are fast and silent.** Large diffs approved in minutes with no comments. Spot it: median review time against median diff size, per module, from your Git host.",
            "**The only authors are the agent and the merger.** No human has written or rewritten logic in the module for months. Spot it: `git log --format=\"%an\"` for the folder.",
            "**Tests that encode what the code does, not what it should do.** Generated alongside the code, they pass by construction and miss the cases nobody thought about (here: any offset except 0). Spot it: grep the tests for the inputs that matter in production.",
        ]),

        h2("5. Habits that keep it down"),
        numbered([
            "**Explain-back before merge.** The author explains the change in their own words, and the reviewer asks them to predict the result of one or two inputs before running anything. A wrong prediction is not a failure of the author; it is a gap found before production found it.",
            "**Small diffs.** Lesson 8's scope limits are also an understanding limit: nobody absorbs 540 lines of logic in one review. Split by behaviour, and keep mechanical changes in their own PR.",
            "**Design notes.** Three to ten lines per non-trivial change: what problem, which approach, what was rejected, which invariant must hold (\"a session counts on the learner's local calendar day\"). Written by the person, not generated: writing it is how they find out whether they understood.",
            "**Rotate reviewers.** If the same person reviews a module every time, their understanding is the team's single point of failure. Rotating spreads the model of the code to more heads.",
            "**Keep core logic human-understood.** For the risky parts, a person writes or rewrites the core and lets the agent help with tests, edge cases and the surrounding plumbing - or rewrites agent code until they can explain every line. Slower on the day, much faster on the incident day.",
        ]),
        h3("Worked example: an explain-back that would have caught the bug"),
        p("The reviewer of the July PR picks one realistic input and asks the author to predict it, in writing, before anyone runs it:"),
        code("text", `
Reviewer: A learner in Hanoi (tzOffsetMin = 420) submits at 2026-10-12T01:00:00Z.
          Which day does normalizeDay return?
Author:   01:00 UTC is 08:00 in Hanoi, so "2026-10-12".
Reviewer: Let's run it.
          > normalizeDay("2026-10-12T01:00:00Z", 420)
          '2026-10-11'
Author:   Then the subtraction goes the wrong way: the offset is minutes EAST of UTC,
          so local time is UTC + offset.`, "PR review thread"),
        p("Five minutes, and the review ends with a test that pins the behaviour for a non-zero offset and a fix the author can explain:"),
        code("typescript", `
// src/progress/streak/normalizeDay.ts
// Local calendar day of a session. tzOffsetMin = minutes EAST of UTC (Hanoi = 420).
export function normalizeDay(ts: string, tzOffsetMin: number): string {
    return new Date(Date.parse(ts) + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

// tests/progress/normalizeDay.test.ts
import { expect, it } from "vitest";
import { normalizeDay } from "../../src/progress/streak/normalizeDay";

it.each([
    ["2026-10-12T01:00:00Z", 420, "2026-10-12"],   // 08:00 Hanoi
    ["2026-10-11T17:30:00Z", 420, "2026-10-12"],   // 00:30 Hanoi, just after midnight
    ["2026-10-12T03:00:00Z", -300, "2026-10-11"],  // 22:00 the day before in UTC-5
])("normalizeDay(%s, %i) is %s", (ts, offset, day) => {
    expect(normalizeDay(ts, offset)).toBe(day);
});`, "normalizeDay.ts"),
        p("Make the habit cheap to keep with a section in the pull request template, so it is part of every agent PR rather than a rule people remember on good days:"),
        code("text", `
## Explain-back (agent-assisted PRs)
- In my own words, this change ...
- The invariant it must keep: ...
- Reviewer's question and my prediction (written before running): ...
- What I would check first if this breaks in production: ...`, ".github/pull_request_template.md"),

        h2("6. Measure it a little"),
        p("You cannot measure understanding directly, and a dashboard of twenty metrics becomes its own debt. A few cheap numbers, looked at once a month per core module, are enough to see the trend:"),
        bullets([
            "**Explain-back hit rate.** Of the PRs where the reviewer asked for a prediction, how often was it right? Low is fine at first - it means the habit is finding gaps - but it should rise.",
            "**Human authors and reviewers in 90 days.** From `git log` and the Git host: how many different people wrote or reviewed logic in the module. One or zero is a bus factor, whatever the coverage says.",
            "**Read-and-fix vs re-prompt.** For incidents in the module, was the fix found by reading the code or by asking the agent until a test went green? On-call notes give this in a minute.",
            "**Big, fast reviews.** PRs above your diff limit approved in under ten minutes. A count, not a target - each one is worth a second look.",
        ]),
        callout("warning", "Do not turn the numbers into targets",
            "Volume metrics are the easiest to collect and the least useful here. \"Agent-written lines per week\" goes down when people stop using the agent, not when they understand more; coverage goes up when tests are generated along with the code. Measure whether people can explain and fix the code, not how much of it there is."),

        challenge("chal_quiz_acp_331"),

        h2("7. Common mistakes"),
        bullets([
            "**Treating coverage as understanding.** 92% coverage and nobody could explain the module. Spot it: ask what the tests assert for the inputs that matter in production; covered is not the same as checked.",
            "**Banning the agent after the incident.** The debt came from how the code was accepted, not from who typed it. Spot it: the same pattern - big diffs, silent reviews - comes back with code from other sources.",
            "**Explain-back as theatre.** The author pastes the agent's own summary of the change. Spot it: ask for a prediction on a new input before running anything; a summary cannot answer that.",
            "**Only one person ever reviews the module.** Understanding exists, but in one head. Spot it: list reviewers per folder for the last 90 days.",
            "**Fixing by re-prompting until green.** Each attempt changes code nobody understands to satisfy tests that do not describe the requirement. Spot it: a fix PR whose author cannot say which line was wrong and why.",
        ]),

        h2("8. Summary"),
        bullets([
            "Cognitive debt is code the team responsible for it cannot explain. Agents make it cheap to accumulate, green tests hide it, and incidents collect it with interest.",
            "Watch for the signs: diffs nobody can explain, bugs that only the agent fixes, large PRs reviewed in minutes, modules with no human author.",
            "Keep it down with explain-back before merge, small diffs, short design notes, rotating reviewers and human-understood core logic - and track a few numbers about explaining and fixing, not about volume.",
        ]),

        h2("Sources"),
        bullets([
            "Thoughtworks Technology Radar, Vol. 34 - thoughtworks.com/radar (search the edition for cognitive debt and AI-assisted development)",
            "Anthropic, Claude Code documentation: overview and best practices - docs.anthropic.com/en/docs/claude-code/overview",
            "Peter Naur, \"Programming as Theory Building\" (1985): a program's design lives in the heads of the people who built it",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one core module of a project you work on that an agent helped build. Without opening the code, write down how it handles two edge cases you consider important; then read the code and run it on those inputs. Where you were wrong, write a test and a three-line design note. Then run git log --format=\"%an\" on the folder and count the human authors of its logic."),
    ],
});
