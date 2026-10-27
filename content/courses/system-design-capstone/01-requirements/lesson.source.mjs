// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-1-1",
    title: "Functional & non-functional requirements for CodeDev",
    slug: { _type: "slug", current: "functional-non-functional-requirements-codedev" },
    description:
        "The CodeDev design doc said the platform must be \"fast, reliable and fair\". On exam day the health check stayed green while submissions took 31 seconds to be accepted and some learners lost progress, and nobody could say whether the requirements were met. Learn to separate functional from non-functional requirements, turn vague asks into measurable ones (latency, availability, durability of progress, fairness on exam day), write down constraints and assumptions, and attach a verification to every line.",
    estimatedTime: 20,

    scenario: {
        role: "Lead engineer writing the CodeDev design doc",
        problem:
            "Exam day for the SQL Data Modeling cohort went badly: learners waited up to 40 minutes for results, 4.1% of submissions failed with 503, and 41 learners found a finished lesson back at 60%. The status page showed 100% uptime all morning. The post-incident review stalled on one question nobody could answer: did the platform meet its requirements? The design doc only said \"fast, reliable, scalable and fair\". Before anyone draws an architecture for the next version, you have to write requirements that a test or a dashboard can check.",
    },

    content: [
        h2("1. The incident: requirements without numbers"),
        p("This course designs one system from end to end: the CodeDev learning platform at https://app.codedev.test, with its API at https://api.codedev.test. It starts where most real designs start, with an incident and a document that could not answer for it. This is the requirements section of the design doc that was in force on exam day:"),
        code("text", `
CodeDev platform - requirements (v1)

  R1. Learners can enroll in courses, study lessons and submit code to challenges.
  R2. The platform must be fast.
  R3. The submission API shall be highly available (99.9%).
  R4. The platform must scale to many users.
  R5. Progress must be saved reliably.
  R6. Exams must be fair.`, "docs/design/requirements-v1.md"),
        p("And this is what exam day looked like, from three different sources:"),
        code("text", `
Status page (uptime monitor, GET /health every 30 s)    09:00-12:00   100.0% up

API metrics, POST /submissions                          09:00-12:00
  requests 412,870   5xx 16,930 (4.1%)   p95 time to 202: 31.4 s (10:00-10:15)
Grader queue                                            peak depth 19,870 at 10:00:00
  last result for a 10:00 submission delivered at 10:38

Support tickets
  #8812 "I submitted at 9:59, the deadline was 10:00, it says my answer was late"
  #8830 "Lesson 7 was 100% yesterday, now it shows 60%"            (41 similar)
  #8841 "The leaderboard shows Minh first with twice the points he has"`, "exam day, SQL Data Modeling cohort"),
        p("Every line of v1 sounds reasonable, and every line was useless in the review. Was 31 seconds \"fast\"? The status page says R3 held. Is a deadline judged by the time the API received the code or the time a grader got to it? Is a lesson that drops from 100% to 60% \"saved reliably\" because the row still exists? A requirement that cannot fail a check cannot guide a design either."),

        h2("2. Read the evidence: four complaints, four kinds of requirement"),
        p("Before writing anything new, sort the evidence. Each complaint points at a different property of the system, and each property will pull the architecture in a different direction:"),
        bullets([
            "**Latency.** \"It took 31 seconds to accept my code.\" The learner does not care how long grading takes as much as how long they stare at a spinner before the platform confirms it has the submission. Two different timings hide in \"fast\": accepting the submission and returning the result.",
            "**Availability.** 4.1% of submissions failed while the health check was green. Availability measured on `/health` measures whether a process answers; learners experience availability per request to the operations they use.",
            "**Durability and correctness of progress.** A finished lesson went back to 60%. Nothing was lost on disk; a later write with an older value replaced a newer one. \"Saved reliably\" has to cover both: the write survives failures, and a stored value never goes backwards.",
            "**Fairness.** A 9:59 submission marked late, and a leaderboard with double points. Fairness on exam day means the rules are the same for everyone whatever the load: what timestamp counts, who gets graded first, how points are counted.",
        ]),
        p("Notice what is missing: nobody complained that a feature did not exist. Learners could enroll, study, submit and see results. The platform failed on how well it did those things, under one particular load."),

        h2("3. Core idea: what the system does, and how well"),
        p("A **functional requirement** says what the system does: an input, an output, a rule. \"A learner can submit code to a challenge and see whether it passed.\" A **non-functional requirement** (also called a quality attribute) says how well it must do it, under which conditions: speed, availability, durability, consistency, security, cost. Both are needed, and they do different jobs in a design:"),
        bullets([
            "Functional requirements shape the **API and the data model**: which resources exist (courses, enrollments, submissions, progress), which operations, which business rules (a lesson is complete only when its required challenges pass).",
            "Non-functional requirements shape the **architecture**: whether grading is synchronous or queued, whether progress lives in PostgreSQL or a cache, whether you need rate limits. Two systems with identical features can need completely different designs because one must accept 340 submissions per second and the other 3.",
        ]),
        h3("The functional core of CodeDev"),
        p("Keep the list short and testable. These are the functions the rest of the course builds on:"),
        numbered([
            "**Catalog and enrollment.** Browse courses; enroll (free or paid); only enrolled learners open lessons and submit.",
            "**Study and progress.** Each lesson has a percent from 0 to 100 per learner; the course percent is derived from the lessons; a lesson reaches 100 only when its required challenges are passed.",
            "**Submissions and grading.** Submit code to a challenge; the platform accepts it, runs it against hidden tests in a sandbox (1 to 8 seconds per job) and records pass or fail.",
            "**Leaderboard.** Weekly and all-time ranks from points earned for passed challenges and completed lessons.",
            "**Certificates.** Issued once when a course is completed.",
        ]),
        h3("Making vague asks measurable"),
        p("A measurable requirement names five things: **the operation**, **the metric**, **the target**, **the conditions** (load, failures) and **where and over what window it is measured**. Rewrite each v1 line with that template. The numbers below are CodeDev's planning assumptions for this course: 200,000 registered learners, 20,000 active per day, a peak of 340 submissions per second in the minute before an exam deadline, and graders that take 1 to 8 seconds per job."),
        code("text", `
R2a  Reads      95% of GET requests to the API (catalog, lesson, progress, leaderboard) complete
                within 300 ms, measured server-side per 5-minute window, at exam-day peak load.
R2b  Submit     95% of POST /submissions return 202 Accepted within 2 s, at 340 submissions/s.
R2c  Result     95% of submissions get a graded result within 5 min of acceptance on exam day,
                within 30 s on other days.
R3   Avail.     99.9% of POST /submissions per 30 days return a non-5xx response within 2 s
                (slower than 2 s counts as failed), measured at the API, not by /health.
R5   Progress   Once PATCH /progress returns 200, the value is committed in PostgreSQL and survives
                an API restart and a Redis flush. A lesson's stored percent never decreases.
R6a  Deadline   A submission is on time if the API accepted it (202) before the deadline,
                however long grading takes.
R6b  Fair load  Each learner may have at most 1 accepted submission per 5 s (burst of 3) during an
                exam; excess requests get 429 with Retry-After. Grading is first-in first-out.
R7   Ranks      The leaderboard reflects a passed challenge within 10 s (p95). Ranks may lag;
                points may never be counted twice.`, "docs/design/requirements-v2.md (non-functional)"),
        p("Look at how much design is already hidden in these lines. R2b with R2c says acceptance and grading are separate steps with separate targets: the API must not hold a request open for a grader that takes up to 8 seconds. R5 says progress lives in PostgreSQL, not only in Redis. R6a moves the deadline decision to the moment of acceptance, which makes a slow queue unfair to nobody. R7 says out loud that the leaderboard is eventually consistent, and that double counting is a bug while a delay is not."),
        callout("info", "Percentiles, not averages",
            "Latency targets use a percentile (p95, p99) over a window because averages hide the tail: one learner in twenty waiting 30 seconds disappears inside a 400 ms average. How to compute percentiles from histograms correctly is covered in Observability with OpenTelemetry; here, just make sure every latency requirement says which percentile and which window."),
        h3("Constraints and assumptions are requirements too"),
        p("A **constraint** is a decision already made that the design must respect. An **assumption** is a number or fact you are betting on, which must be checked later. Write both down, because they are what reviewers will challenge first:"),
        bullets([
            "**Constraints:** a team of four backend engineers; TypeScript with NestJS for the API; PostgreSQL as the system of record and Redis already in production; learner code is untrusted and must run in a sandbox, never in the API process; personal data stays in one region.",
            "**Assumptions:** 200,000 registered and 20,000 daily active learners; about 5 submissions per active learner per day; exam peak 340 submissions/s for about a minute; grading 1-8 s per job (mean about 4.5 s). Lesson 2 turns these into capacity numbers; lesson 14 into costs.",
        ]),
        h3("When not to write a non-functional requirement"),
        p("Not every page needs an SLO, and over-specifying costs real money. A course catalog that is 600 ms slow for a minute bothers nobody; a submission lost at a deadline ends up with the dean. Write targets for the operations learners depend on (submit, progress, results, exam deadlines) and leave the rest to sensible defaults. Never write a target you will not measure: an unmeasured \"99.99%\" is just a wish that makes the design more expensive."),

        challenge("chal_quiz_sdc_111"),

        h2("4. Worked example: requirements that check themselves"),
        p("The fastest way to find out whether a requirement is measurable is to write the check. This small script holds the non-functional requirements as data and evaluates them against the exam-day samples exported from the metrics store. It runs with `node --experimental-strip-types check-requirements.ts` (or plain `node` on Node 23.6+), with no dependencies:"),
        code("typescript", `
// check-requirements.ts - evaluate requirements against exported request samples
type Sample = { route: string; status: number; ms: number };
type Requirement = {
  id: string;
  route: string;
  check: (samples: Sample[]) => { value: string; ok: boolean };
};

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];   // nearest-rank
};

const requirements: Requirement[] = [
  {
    id: "R2b p95 POST /submissions <= 2000 ms",
    route: "POST /submissions",
    check: (s) => {
      const p95 = percentile(s.map((x) => x.ms), 95);
      return { value: \`\${p95} ms\`, ok: p95 <= 2000 };
    },
  },
  {
    id: "R3 good POST /submissions (non-5xx within 2 s) >= 99.9%",
    route: "POST /submissions",
    check: (s) => {
      const good = s.filter((x) => x.status < 500 && x.ms <= 2000).length;
      const ratio = (100 * good) / s.length;
      return { value: \`\${ratio.toFixed(2)}%\`, ok: ratio >= 99.9 };
    },
  },
];

export function evaluate(samples: Sample[]): string[] {
  return requirements.map((r) => {
    const mine = samples.filter((x) => x.route === r.route);
    if (mine.length === 0) return \`\${r.id}: NO DATA\`;          // a requirement nobody measures fails loudly
    const { value, ok } = r.check(mine);
    return \`\${r.id}: \${value} \${ok ? "OK" : "MISSED"}\`;
  });
}

// Ten samples from 10:00-10:01 on exam day (the real export has 412,870):
const examDay: Sample[] = [
  { route: "POST /submissions", status: 202, ms: 840 },   { route: "POST /submissions", status: 202, ms: 1210 },
  { route: "POST /submissions", status: 202, ms: 9800 },  { route: "POST /submissions", status: 503, ms: 30000 },
  { route: "POST /submissions", status: 202, ms: 31400 }, { route: "POST /submissions", status: 202, ms: 2600 },
  { route: "POST /submissions", status: 202, ms: 1900 },  { route: "POST /submissions", status: 202, ms: 700 },
  { route: "POST /submissions", status: 429, ms: 12 },    { route: "POST /submissions", status: 202, ms: 15500 },
];
console.log(evaluate(examDay).join("\\n"));`, "check-requirements.ts"),
        code("text", `
R2b p95 POST /submissions <= 2000 ms: 31400 ms MISSED
R3 good POST /submissions (non-5xx within 2 s) >= 99.9%: 50.00% MISSED`, "output"),
        p("Three details carry the lesson. The availability check counts a slow 202 as a failure, because R3 says so: a submission accepted after 31 seconds is not \"available\" to a learner watching a clock. The 429 counts as good: a rate-limited request is the system working as specified (R6b), not an outage. And a requirement with no samples prints `NO DATA` instead of passing silently: the most common way a requirement fails in production is that nobody records the metric it needs."),
        p("Durability and fairness requirements are checked by tests and queries rather than by latency samples. R5 becomes an integration test (write, restart, flush Redis, read back) plus an invariant query on the progress history; R6a becomes a query over submissions:"),
        code("sql", `
-- R6a: every submission accepted before the deadline is graded as on time
SELECT count(*) AS judged_late_but_accepted_on_time
FROM submission s
JOIN exam e ON e.id = s.exam_id
WHERE s.accepted_at <= e.deadline_at
  AND s.on_time = false;          -- must be 0

-- R5: no lesson percent ever went down (progress_history keeps every applied change)
SELECT user_id, lesson_id, changed_at, old_percent, new_percent
FROM progress_history
WHERE new_percent < old_percent;  -- must return no rows`, "invariant queries"),

        h2("5. How to verify the requirements themselves"),
        p("Review each requirement with three questions before it goes into the design doc. If one answer is \"we can't\", rewrite the line."),
        numbered([
            "**Which signal decides it?** Name the metric, test or query: an API histogram, a load test, the invariant query above. \"The uptime monitor\" is not an acceptable signal for a submission availability target.",
            "**Can it fail?** Run the check on a bad day you remember. R3 written with `/health` would have passed exam day; the rewritten R3 fails it at 50%. A requirement that would have passed the incident you are fixing is the wrong requirement.",
            "**Who acts when it fails?** Each line gets an owner and, for the important ones, an alert. Observability with OpenTelemetry covers SLOs and burn-rate alerts; the design doc only has to state the target the alert protects.",
        ]),
        p("Then test the requirements as a set. Before exam day, a load test replays the planned peak against a staging copy and the check script evaluates the result:"),
        code("bash", `
# 340 submissions/s for 60 s against staging, then evaluate the requirements on the samples
k6 run --env BASE_URL=https://api.staging.codedev.test load/exam-peak.js --out json=samples.json
node scripts/check-requirements.ts samples.json`, "terminal"),

        h2("6. Common mistakes"),
        bullets([
            "**Adjectives instead of numbers.** \"Fast\", \"scalable\", \"highly available\". Spot it: try to write the check from section 4; if you cannot choose a threshold, the requirement is not done.",
            "**Measuring the server instead of the user operation.** Uptime of `/health`, CPU below 70%. Spot it: the signal stays green during an incident that learners felt, as it did on exam day.",
            "**One latency for two operations.** \"Submissions within 2 s\" when grading takes up to 8 s forces a design that cannot exist. Spot it: the target is smaller than the work the operation needs; split acceptance from completion.",
            "**Unstated consistency.** Nobody wrote down that the leaderboard may lag, so every delay looks like a bug, or that points must never double, so nobody tests it. Spot it: a requirements doc with no word on staleness or duplicates for derived data.",
            "**Assumptions hidden as facts.** \"20,000 daily active learners\" with no source and no date. Spot it: the number does not say where it came from or when it will be checked against metrics (lesson 2).",
        ]),

        h2("7. Summary"),
        numbered([
            "Functional requirements say what CodeDev does and shape the API and data model; non-functional requirements say how well, under which load, and shape the architecture.",
            "A measurable requirement names the operation, metric, target, conditions and measurement window. Latency and availability are measured on user operations (submit, progress, results), with percentiles and a definition of a good request.",
            "Write constraints and assumptions down, give each requirement a check (metric, test or invariant query) that would have failed on the bad day, and do not spend targets on operations nobody depends on.",
        ]),

        h2("Sources"),
        bullets([
            "Google SRE book, Addressing Cascading Failures - sre.google/sre-book/addressing-cascading-failures/",
            "Google SRE book, Service Level Objectives - sre.google/sre-book/service-level-objectives/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take a system you work on and write its five most important requirements with the template from section 3 (operation, metric, target, conditions, window). For each, name the signal that decides it and check it against your last bad day: would the requirement have failed? Keep the list; lessons 2 and 3 turn it into capacity numbers and an architecture."),
    ],
});
