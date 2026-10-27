// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-1-2",
    title: "Back-of-the-envelope capacity estimates",
    slug: { _type: "slug", current: "back-of-the-envelope-capacity-estimates" },
    description:
        "The grader fleet was sized from a daily average and the last exam's results arrived 37 minutes after the deadline. Learn to turn CodeDev's assumptions into requests per second, peak rates, storage per year and queue depth with Little's Law, to size a fleet for a goal instead of for the average, to find the number nobody estimated (result polling), and to check every estimate against metrics once the system runs.",
    estimatedTime: 20,

    scenario: {
        role: "Lead engineer writing the capacity section of the CodeDev design doc",
        problem:
            "The infrastructure ticket for the next exam asks one question: how many grader slots do we need? Last time the answer was \"the 40 we always have; the dashboard says they are 13% busy\". At the 10:00 deadline the submission queue reached 19,870 jobs and the last results arrived at 10:38. Finance will only pay for extra capacity during exam windows if the number comes with a calculation they can follow, and the team wants to know what else will break at that load before it does.",
    },

    content: [
        h2("1. The incident: sized for the average day"),
        p("This was the capacity reasoning in the old design doc, and it was not wrong arithmetic:"),
        code("text", `
daily active learners             20,000
submissions per active learner    5 per day          (planning number)
submissions per day               100,000  ->  1.2 per second on average
grader slots                      40, mean job 4.5 s ->  40 / 4.5 = 8.9 jobs per second
utilization                       1.2 / 8.9 = 13%    ->  "plenty of headroom"`, "docs/design/capacity-v1.md"),
        p("And this was the grader dashboard on exam day:"),
        code("text", `
time      POST /submissions/s   queue depth   grader slots busy   jobs done/s
09:58:00          12                    0          11 / 40              2.6
09:59:30         340                9,930          40 / 40              8.9
10:00:00         340               19,867          40 / 40              8.9     <- deadline
10:01:00           0               19,333          40 / 40              8.9
10:20:00           0                9,200          40 / 40              8.9
10:37:15           0                    0          12 / 40              2.7`, "grader dashboard, exam day"),
        p("The average was right and useless. Exam deadlines do not arrive as 1.2 submissions per second spread over a day; they arrive as 20,400 submissions in one minute. A capacity estimate has to ask **how fast the work arrives at its worst, for how long, and what we promised about it**, not how much arrives per day."),

        h2("2. Read the evidence: three numbers in the dashboard"),
        p("Before estimating anything, see what the dashboard already tells you. Each column is one of the three quantities in Little's Law:"),
        bullets([
            "**Arrival rate (λ):** 340 submissions per second during the last minute, then almost nothing.",
            "**Time per job (W):** about 4.5 seconds on average (graders take 1 to 8 s, depending on the challenge and the code).",
            "**Jobs in progress (L):** 40 busy slots, the maximum. When L hits the fleet size, the fleet finishes L / W = 40 / 4.5 = 8.9 jobs per second, whatever the arrival rate. Everything above that rate goes into the queue.",
        ]),
        p("During the peak minute the queue grows by 340 - 8.9 = 331 jobs per second, which is how it reaches about 19,870. After the deadline it shrinks at 8.9 jobs per second, so it needs 19,867 / 8.9 = 2,233 seconds, about 37 minutes. The dashboard confirms the arithmetic to the minute: that agreement is what makes the model worth using for the next decision."),

        h2("3. Core idea: estimate the peak, then size for a goal"),
        h3("Little's Law"),
        p("For any stable system, averaged over a long enough period: **L = λ × W**. Items in the system equal the arrival rate times the time each item spends in it. It holds for grader slots (jobs in progress = jobs per second × seconds per job), for API instances (requests in flight = requests per second × latency), for database connections (busy connections = queries per second × query time) and for queues (waiting jobs = arrival rate × waiting time). It needs no assumption about distributions, which is why it is the first tool of every estimate. It does describe averages: for the peak, apply it to the peak rate over the peak window, and leave margin for the variance (a fleet at 100% busy has a growing queue, not a short one)."),
        h3("The estimate, line by line"),
        p("Write the estimate as a table where each line has its inputs, the arithmetic and the source of each input. Round aggressively: you need the order of magnitude and the dominant term, not three significant digits."),
        code("text", `
INPUTS (assumptions, each with a source)
  registered learners          200,000     (users table, Oct 2026)
  daily active learners         20,000     (product analytics, 30-day average)
  submissions per active day         5     (planning number; measured 4.4 last month)
  exam peak                    340 /s for 60 s before a deadline   (last exam, API metrics)
  grader time per job          1-8 s, mean 4.5 s                   (grader histogram)

TRAFFIC
  submissions                  100,000 / day = 1.2 /s average; 340 /s at exam peak (x280)
  API reads                    20,000 x 200 / day = 4,000,000 / day = 46 /s average, ~200 /s busy hour
  progress writes              20,000 x 30 / day = 600,000 / day = 7 /s average

GRADERS (Little's Law: slots = rate x time per job)
  keep up with the peak        340 /s x 4.5 s = 1,530 slots
  meet R2c (results <= 5 min)  20,400 jobs x 4.5 s / 360 s = 255 slots   -> plan 300 for exam windows
  normal days                  busy hour ~4 /s x 4.5 s = 18 slots        -> 40 always-on is enough

STORAGE (per year, before replication and backups)
  submissions                  100,000 / day x ~5 KB (code, results, row, index) = 500 MB / day = ~180 GB / year
  progress                     200,000 learners x ~4 courses x ~0.6 KB = ~0.5 GB (grows with learners, not time)
  outbox / events              ~650,000 / day x 0.5 KB, kept 7 days = ~2.3 GB steady
  leaderboard (Redis)          200,000 members all-time + ~20,000 per weekly board: tens of MB`, "docs/design/capacity-v2.md"),
        p("Three conclusions jump out, and each one changes the design. First, submissions storage is the only thing that grows quickly: 180 GB a year is easy for PostgreSQL, but it calls for a retention decision (keep code for a year, keep pass/fail forever) and for partitioning the `submission` table by month before it gets large, not after. Second, the grader fleet needs two sizes: 40 always-on slots for normal days and scheduled scaling to about 300 slots for exam windows; 1,530 slots to grade instantly would cost five times as much to save four minutes nobody asked for. Third, everything else is small. Progress, events and the leaderboard fit on one PostgreSQL primary and one Redis with room to spare, which is a strong argument against splitting them into separate services for scale (lesson 3)."),
        callout("info", "Size for the requirement, not for zero queue",
            "A queue is not a failure; an unbounded or unexpected queue is. R2c (lesson 1) promises results within 5 minutes on exam day. That turns \"how many graders?\" from a guess into arithmetic: enough to process the peak's work within the peak plus 5 minutes. Without that requirement, \"enough\" has no answer."),
        h3("The number nobody estimated"),
        p("Follow the learner, not just the submission. After submitting, the web app polls `GET /submissions/:id` every 2 seconds until the result appears. During the drain after a deadline, about 10,000 learners are waiting at the same time:"),
        code("text", `
waiting learners after the deadline     ~10,000
poll interval                           2 s
GET /submissions/:id                    10,000 / 2 s = 5,000 requests /s   (for up to 37 minutes)
compared with                           340 submissions /s at the peak, ~200 reads /s on a busy normal hour`, "the polling estimate"),
        p("The largest load on exam day is not the submissions; it is learners asking whether their submission is done, 15 times the submit peak and 25 times a normal busy hour. Each poll is cheap (an indexed lookup by primary key), but 5,000 per second through the API and its connection pool is a capacity problem of its own. Two cheap fixes follow from the estimate: poll with backoff (2 s, then 5 s, then 10 s) and with `Retry-After` from the server, or push the result over the realtime channel the web app already uses and keep polling only as a fallback. A shorter drain (300 graders) also shortens the polling window from 37 minutes to 4."),

        challenge("chal_quiz_sdc_121"),

        h2("4. Worked example: an estimate you can rerun"),
        p("Put the estimate in a script, so that when an assumption changes (a new exam with twice the cohort, a slower grader image) the numbers update and the reasoning stays visible. This one runs with plain `node estimate.ts` on Node 23.6+ and models the queue second by second for three fleet sizes:"),
        code("typescript", `
// estimate.ts - back-of-the-envelope numbers for CodeDev (inputs are assumptions, see the design doc)
const daily = { active: 20_000, submissionsPerLearner: 5, readsPerLearner: 200 };
const grader = { meanJobSeconds: 4.5 };
const exam = { peakPerSecond: 340, peakSeconds: 60, resultTargetSeconds: 300 };

const perDay = daily.active * daily.submissionsPerLearner;
console.log(\`submissions/day      \${perDay.toLocaleString("en-US")}  (avg \${(perDay / 86_400).toFixed(1)}/s)\`);
console.log(\`reads/s average      \${((daily.active * daily.readsPerLearner) / 86_400).toFixed(0)}\`);

// Little's Law: jobs in progress = arrival rate x time per job
const slotsToKeepUp = exam.peakPerSecond * grader.meanJobSeconds;
console.log(\`slots to keep up     \${slotsToKeepUp} (340/s x 4.5 s)\`);

// Smaller fleet + drain: all peak jobs must finish within the result target after the deadline
const peakJobs = exam.peakPerSecond * exam.peakSeconds;
const slotsForTarget = Math.ceil((peakJobs * grader.meanJobSeconds) / (exam.peakSeconds + exam.resultTargetSeconds));
console.log(\`peak jobs            \${peakJobs.toLocaleString("en-US")}\`);
console.log(\`slots for 5-min goal \${slotsForTarget}\`);

// Fluid model of the queue, one step per second
function simulate(slots: number): string {
  const rate = slots / grader.meanJobSeconds;          // jobs finished per second
  let queue = 0, maxQueue = 0, t = 0, done = 0;
  while (done < peakJobs) {
    if (t < exam.peakSeconds) queue += exam.peakPerSecond;
    const served = Math.min(queue, rate);
    queue -= served; done += served; t++;
    maxQueue = Math.max(maxQueue, queue);
  }
  const afterDeadline = t - exam.peakSeconds;
  return \`slots \${String(slots).padStart(4)}: \${rate.toFixed(1)} jobs/s, max queue \${Math.round(maxQueue).toLocaleString("en-US")}, \` +
    \`last result \${Math.floor(afterDeadline / 60)} min \${afterDeadline % 60} s after the deadline\`;
}
for (const slots of [40, 300, 1530]) console.log(simulate(slots));`, "estimate.ts"),
        code("text", `
submissions/day      100,000  (avg 1.2/s)
reads/s average      46
slots to keep up     1530 (340/s x 4.5 s)
peak jobs            20,400
slots for 5-min goal 255
slots   40: 8.9 jobs/s, max queue 19,867, last result 37 min 15 s after the deadline
slots  300: 66.7 jobs/s, max queue 16,400, last result 4 min 6 s after the deadline
slots 1530: 340.0 jobs/s, max queue 0, last result 0 min 0 s after the deadline`, "output"),
        p("The 40-slot line reproduces the incident (19,867 queued, 37 minutes), which is the check that the model is good enough to plan with. The 300-slot line meets the 5-minute goal with a queue of 16,400 at the deadline: a big queue that is completely fine, because the requirement is about results, and the deadline rule (R6a) judges submissions by acceptance time. This is a fluid model: it ignores the 1-8 s spread and treats jobs as divisible, so keep a margin, which is why the plan says 300 rather than 255."),
        callout("warning", "Estimates that skip the cost of waiting",
            "The queue must hold 16,400 jobs at 300 slots, and 19,900 at 40. Check that the queue itself can: a Redis list or a PostgreSQL jobs table holds that easily, but a queue with a 10,000-message limit or a 5-minute visibility timeout shorter than the wait would fail in a new way. Background Jobs & Messaging covers queue limits and visibility timeouts in depth."),

        h2("5. How to verify: check every estimate against metrics"),
        p("An estimate is a hypothesis. Once the system runs, each input and each output has a measurement, and the design doc should record both side by side:"),
        code("sql", `
-- submissions per active learner, last 30 days (the planning number was 5)
SELECT round(count(*)::numeric / count(DISTINCT user_id) / 30, 1) AS per_learner_per_day
FROM submission
WHERE accepted_at >= now() - interval '30 days';

-- storage growth of the submission table, one row per day from a nightly job
SELECT day, pg_size_pretty(bytes), pg_size_pretty(bytes - lag(bytes) OVER (ORDER BY day)) AS growth
FROM table_size_history WHERE table_name = 'submission' ORDER BY day DESC LIMIT 7;`, "checking inputs"),
        code("text", `
# arrival rate at the peak (1-minute window), from the API histogram counter
sum(rate(http_server_request_duration_seconds_count{http_route="/submissions", http_request_method="POST"}[1m]))

# Little's Law check on the graders: busy slots should equal throughput x mean job time
avg_over_time(grader_slots_busy[10m])
  vs
sum(rate(grader_job_duration_seconds_count[10m])) * (sum(rate(grader_job_duration_seconds_sum[10m])) / sum(rate(grader_job_duration_seconds_count[10m])))`, "PromQL"),
        p("The Little's Law check is the most useful one. If the dashboard shows 40 busy slots but throughput × mean job time comes to 30, then slots spend a quarter of their time busy without running a measured job: pulling a container image, starting a sandbox, waiting on a lock. That hidden time is invisible in the job histogram and is exactly what makes a fleet smaller than its estimate. The reverse (fewer busy slots than the formula) usually means the metric is sampled wrong."),
        p("Record the comparison and update the estimate when they disagree by more than about 30%:"),
        code("text", `
                              estimated     measured (Oct 2026)    action
submissions / active / day        5             4.4                keep 5 (margin)
grader mean job time            4.5 s           5.1 s              update: 300 slots -> 340 for exam windows
exam peak                     340 /s          312 /s               keep
polls during drain           5,000 /s         4,700 /s             ship backoff before next exam`, "estimate vs metrics"),

        h2("6. Common mistakes"),
        bullets([
            "**Sizing from the daily average.** Spot it: a capacity line that divides by 86,400 and stops there, with no peak rate and no peak duration.",
            "**Estimating only the obvious request.** Submissions were estimated; result polling, retries after errors and reconnecting clients were not. Spot it: follow one user through the whole flow and count every request they cause, including the automatic ones.",
            "**False precision.** \"We need 1,527.3 slots.\" Spot it: more digits than the least certain input (a mean job time known to about 10%) can support. Round, and say which input the answer is most sensitive to.",
            "**Sizing to zero queue.** 1,530 slots to grade instantly when the requirement allows 5 minutes. Spot it: no requirement is cited next to the fleet size.",
            "**Never checking the estimate.** Spot it: the design doc has the estimate but no \"measured\" column six weeks after launch, and the planning numbers in it are still the original guesses.",
        ]),

        h2("7. Summary"),
        numbered([
            "Estimate the peak, not the average: rate at its worst, how long it lasts, and the promise that applies (result within 5 minutes). CodeDev's exam peak is 280 times its daily average.",
            "Little's Law (L = λ × W) sizes fleets, pools and queues: 340/s × 4.5 s = 1,530 slots to keep up, 255 to meet the 5-minute goal; plan about 300 for exam windows and 40 always-on, and follow the user to find loads like result polling.",
            "Write the estimate as a rerunnable script with sourced inputs, reproduce a known incident with it, and keep a measured column next to every estimate so the plan improves after launch.",
        ]),

        h2("Sources"),
        bullets([
            "Google SRE book, Addressing Cascading Failures (capacity planning and load testing) - sre.google/sre-book/addressing-cascading-failures/",
            "AWS Builders' Library, Using load shedding to avoid overload - aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the capacity table for a system you know: inputs with sources, peak rate and duration, Little's Law for each pool (instances, connections, workers), storage per year. Then find one number you did not estimate by following a single user through a busy minute. After a week in production, fill in the measured column and note which input was furthest off."),
    ],
});
