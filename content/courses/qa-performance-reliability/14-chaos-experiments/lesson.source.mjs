// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-5-2",
    title: "Chaos experiments with a hypothesis",
    slug: { _type: "slug", current: "chaos-experiments-with-hypothesis" },
    description:
        "An engineer stopped one of two connection poolers in production to \"check failover\", watched the surviving pooler's CPU and posted \"failover OK\" while 7% of submissions failed for 14 minutes. Learn what turns breaking things into an experiment: a steady-state metric that learners feel, a falsifiable hypothesis with numbers, a blast radius that starts small, abort conditions a runner checks automatically, and the arithmetic that tells you when an experiment is not needed because the answer is already known.",
    estimatedTime: 20,

    scenario: {
        role: "QA engineer owning performance tests, CodeDev learning platform",
        problem:
            "Thursday 2026-10-15, 19:40, during the weekly practice contest (about 210 submissions per second). To check failover before exam day, an engineer stopped pooler-b, one of the two connection poolers between the API and PostgreSQL. The plan in the team chat was one line: \"kill pooler-b, watch pooler-a take over\". pooler-a did take over: its CPU rose from 35% to 61%, and at 19:43 the engineer posted \"failover OK\". Support escalated at 19:54 with 212 tickets saying \"Submit hangs, then Something went wrong\". pooler-b was restarted at 19:54 and the errors stopped. Nobody had decided what to watch or when to stop.",
    },

    content: [
        h2("1. The incident: \"failover OK\" while learners failed"),
        p("Here is what the engineer watched and what learners got, minute by minute. Both columns are real; only one of them was on the engineer's screen:"),
        code("text", `
minute   pooler-a CPU   submit good ratio   submit p95   note
19:39        35%            99.8%              0.41 s
19:40        52%            94.6%              5.0 s     pooler-b stopped
19:41        60%            93.1%              5.0 s
19:43        61%            93.0%              5.0 s     "failover OK" posted
19:50        61%            93.2%              5.0 s
19:54        48%            97.9%              0.62 s    pooler-b restarted
19:55        36%            99.7%              0.43 s

good = 202 Accepted within 2 s, valid requests only (lesson 5.1)`, "pooler-incident-timeline.txt"),
        p("pooler-a carried the load, so the failover the engineer cared about worked. What did not work was the API: each instance kept its already-open connections to pooler-b in its connection pool. A request that borrowed one of those dead connections waited until the 5 s statement timeout and failed. About 7% of submissions, for 14 minutes, at contest time."),
        p("The fault itself was useful to find: it would have hit exam day the first time a pooler crashed. The way it was found was not. There was no statement of what should happen, no metric learners feel, no limit on who was exposed, and no rule for stopping. That is the difference between breaking something and running a **chaos experiment**."),

        h2("2. Read the evidence: why CPU said yes"),
        p("CPU on the surviving pooler is a **resource** metric: it says how busy one component is. It rose, which is what a component taking over more work should do, so it confirmed the engineer's mental model. It cannot show a failure that happens somewhere else, here in the API's pool, and it cannot tell you whether a learner's request succeeded."),
        p("The submit good ratio is an **output** metric: it counts what the system delivered to learners, with the same definition as the SLO in lesson 5.1. It dropped at 19:40 and recovered at 19:54, exactly with the fault. Lesson 3.2 made the same point about load tests: a resource at 40% says nothing about whether the first bottleneck is somewhere else."),
        callout("info", "Why the p95 sat at exactly 5.0 s",
            "A percentile that stops moving at a round number is usually a timeout, not a measurement. 5.0 s was the statement timeout: every request that borrowed a dead connection ended there. When you see a flat line at a configured limit, look for the component that owns that limit."),

        h2("3. The core idea: an experiment tests a belief"),
        p("Chaos engineering, as described in the Principles of Chaos Engineering, is experimenting on a system to build confidence that it withstands turbulent conditions. Every word of that matters: it is an **experiment**, so it starts with a prediction that could turn out wrong, and its output is **confidence** or a **finding**, not an outage. Five parts make one:"),
        h3("Steady state: a metric learners feel"),
        p("Pick the output metric that says the system is doing its job, and measure its normal range before you inject anything. For CodeDev's exam day that is the submit SLI per minute from lesson 5.1, plus accepted submissions per second (a system that rejects most requests quickly can keep a decent latency). Resource metrics such as CPU, queue depth or pool usage are useful as **diagnostics** and as hard guards, not as the definition of \"fine\"."),
        h3("Hypothesis: a prediction with numbers"),
        p("Write what you expect, in terms of the steady-state metric, so that the result can prove you wrong:"),
        code("text", `
Hypothesis H-17 (pooler failover)
When one of the two poolers is stopped while the API serves 200 submissions/s,
  - the submit good ratio per minute stays >= 99.5% (normal: 99.7 - 99.9%)
  - accepted submissions/s stay within 5% of the offered rate
  - the API stops using connections to the stopped pooler within 30 s`, "hypothesis.txt"),
        p("\"The system stays resilient\" is not a hypothesis: no result can contradict it. \"Failover works\" is not either, unless it says for whom and how you will measure it."),
        h3("The event: one real-world fault at a time"),
        p("Inject faults that happen in real life: an instance stops, a dependency gets 300 ms slower, a pooler restarts, a disk fills, a dependency answers 503. One at a time, so that a change in the steady state has one cause. Tools such as Chaos Toolkit, LitmusChaos, AWS Fault Injection Service or Toxiproxy can inject them on a schedule; their configuration formats differ and change, so check current docs."),
        h3("Blast radius: start small, grow with evidence"),
        p("The blast radius is who and what can be hurt if the hypothesis is wrong. Grow it only after the smaller step confirmed the hypothesis:"),
        numbered([
            "**Staging under load.** Run the exam-day load test from lesson 5.1 at 200/s and inject the fault there. No learner can be hurt, and the open-model generator makes the effect measurable.",
            "**Production, small and short.** One pooler serving a small share of traffic, outside contests and exams, for minutes, with the abort conditions armed and the on-call engineer told in advance.",
            "**Production at the scope you rely on.** Only when both earlier steps held, and never during an exam, while the error budget is low, or during another incident.",
        ]),
        h3("Abort conditions: decided before, checked by a machine"),
        p("Abort conditions say when the experiment stops and the fault is rolled back, whatever the hypothesis says. They are written before the run, they are checked automatically every minute, and anyone may also abort by hand. Typical conditions for the submit path:"),
        bullets([
            "**Steady-state floor:** the submit good ratio is below 99.0% for 2 consecutive minutes. One bad minute can be noise; two in a row is a trend.",
            "**Hard guard:** a diagnostic crosses a line that predicts harm, such as a grading queue above 5,000 jobs. Stop at once, without waiting for a second minute.",
            "**Budget guard:** the experiment may spend at most a fixed share of the error budget, for example 5% of the 28-day budget.",
            "**Rollback:** one command that removes the fault, tested in staging before the production run. An abort that needs someone to remember how to restart a pooler is not an abort.",
        ]),
        h3("When not to run a chaos experiment"),
        bullets([
            "**When the answer is already known.** If the API pool is known to keep dead connections, fix it first. An experiment is for beliefs you are not sure of.",
            "**When the arithmetic already predicts failure.** Losing one of four API instances at the exam-day design load of 408/s leaves 136/s per instance. The step test (lesson 3.3) held the SLI only up to 130/s per instance, so the experiment will fail; add capacity first (lesson 5.3).",
            "**When you cannot see the steady state.** Without a per-minute output metric you cannot tell a confirmed hypothesis from a broken one.",
            "**On exam day, during an incident, or with the error budget nearly spent.** The budget policy decides when risk is affordable, not the experiment schedule.",
        ]),

        h2("4. Worked example: the experiment and its abort check"),
        p("CodeDev keeps experiments as small files next to the load tests. The format below belongs to the team's own runner; other tools describe the same parts with different keys:"),
        code("yaml", `
# experiments/h17-pooler-failover.yaml
id: H-17
hypothesis: >
  With one of two poolers stopped at 200 submissions/s, the submit good ratio
  per minute stays >= 99.5% and the API drops connections to it within 30 s.
environment: staging            # step 1 of the blast radius
load: loadtests/exam-day.k6.js --env RATE=200
steady_state:
  metric: submit_good_ratio_per_minute
  baseline_minutes: 10          # measured before the fault: 99.7 - 99.9%
fault:
  action: stop-container pooler-b
  start_after_minutes: 10
  duration_minutes: 10
abort:
  floor: 0.990                  # good ratio below this ...
  consecutive_minutes: 2        # ... for this many minutes in a row
  max_grading_queue: 5000       # hard guard: abort at once
rollback: start-container pooler-b`, "h17-pooler-failover.yaml"),
        p("The abort check is the part that must be right, so it is plain code with a test. It reads one row per minute and returns the minute the runner must stop, or `None`:"),
        code("python", `
def first_abort_minute(minutes, floor, consecutive, max_queue):
    """Return the minute at which the runner must stop the injection, or None."""
    below = 0
    for m in minutes:
        if m["queue_depth"] > max_queue:
            return m["minute"]                      # hard guard: abort at once
        below = below + 1 if m["good_ratio"] < floor else 0
        if below >= consecutive:
            return m["minute"]
    return None


run = [
    {"minute": "14:00", "good_ratio": 0.9991, "queue_depth": 40},
    {"minute": "14:01", "good_ratio": 0.9962, "queue_depth": 310},   # injection starts
    {"minute": "14:02", "good_ratio": 0.9978, "queue_depth": 520},
    {"minute": "14:03", "good_ratio": 0.9931, "queue_depth": 900},
    {"minute": "14:04", "good_ratio": 0.9902, "queue_depth": 1_450},
]
assert first_abort_minute(run, floor=0.995, consecutive=2, max_queue=5_000) == "14:04"
assert first_abort_minute(run, floor=0.995, consecutive=2, max_queue=800) == "14:03"
assert first_abort_minute(run, floor=0.990, consecutive=2, max_queue=5_000) is None`, "abort_check.py"),
        p("Read the three asserts as a specification. With a floor of 99.5%, minute 14:03 is the first bad minute and 14:04 the second in a row, so the runner stops at 14:04. With a tighter queue guard, 14:03 already breaks it. With a floor of 99.0%, no minute is below the floor and the run continues. The counter resets on every good minute: two bad minutes with a good one between them are not two consecutive minutes."),
        p("The staging run of H-17 failed its hypothesis in the first minute, as the production incident predicted: the good ratio fell to 94% and the runner aborted at the second minute. The finding went to the API team, who made the pool validate a connection before lending it and set a 1 s connect timeout, so a dead connection is replaced instead of waited on (option names differ per pool library; check its docs). The rerun held at 99.7% with the API dropping pooler-b's connections in 8 s. Only then was H-17 scheduled in production, outside contest hours, with the same abort file."),

        challenge("chal_quiz_qpr_521"),

        h2("5. How to verify an experiment"),
        bullets([
            "**Test the brakes first.** In staging, force the abort condition (for example, make the grader return 503 for two minutes) and check that the runner stops the fault and runs the rollback without anyone touching it.",
            "**Compare with a baseline or a control.** Measure the steady state for 10 minutes before the fault, or keep a control group (instances without the fault) running at the same time. A change you cannot compare with anything is not a result.",
            "**Record the result against the hypothesis.** Each line of the hypothesis is confirmed or refuted with the measured number, the abort time if any, and the finding that follows. \"Looked fine\" is not a result.",
            "**Rerun after the fix.** A refuted hypothesis becomes a regression experiment: the same file, rerun after the fix and again before each exam.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**A resource metric as the steady state.** CPU, memory or pool usage within bounds while learners fail. Spot it: the experiment record never mentions a user-facing ratio; replace it with the SLI per minute and keep resources as guards.",
            "**A hypothesis that cannot fail.** \"The platform is resilient to pooler loss.\" Spot it: no number, no metric, no time limit; ask what result would prove it wrong.",
            "**Abort by gut feeling.** \"Stop if things look bad\" leaves the decision to someone who is busy watching the wrong panel. Spot it: the abort condition has no threshold and no runner; write it as code and test it.",
            "**Starting in production at full scope.** The incident in this lesson. Spot it: no staging run exists for the same hypothesis; follow the blast radius steps.",
            "**Experimenting on a known weakness.** Spot it: the team can predict the failure before the run, from a ticket or from capacity arithmetic; fix it, then experiment.",
        ]),

        h2("7. Summary"),
        numbered([
            "A chaos experiment tests a belief: a falsifiable hypothesis about a steady-state output metric (the submit SLI per minute), not a resource metric such as CPU.",
            "Limit the harm before you start: one real fault at a time, a blast radius that grows from staging under load to small production steps, and abort conditions decided in advance and checked by code, with a tested rollback.",
            "Skip the experiment when the answer is already known or the capacity arithmetic predicts failure, and never run it on exam day or with the error budget nearly spent; fix first, then confirm with an experiment and rerun it before each exam.",
        ]),

        h2("Sources"),
        bullets([
            "Principles of Chaos Engineering - principlesofchaos.org",
            "Grafana k6 documentation: scenarios and thresholds, for the load that keeps the steady state measurable - grafana.com/docs/k6/latest/",
            "Google SRE Workbook, chapter \"Implementing SLOs\": error budget policies - sre.google/workbook/implementing-slos/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the experiment file for H-18: one of the grader nodes stops while 200 submissions/s are graded. State the steady state (include time from acceptance to result, not only acceptance), a hypothesis with numbers, the blast radius steps, two abort conditions and the rollback. Before you schedule it, use Little's Law (lesson 4.2) with the measured grading time to check whether the remaining nodes can carry the load at all; if they cannot, write the capacity finding instead of the experiment."),
    ],
});
