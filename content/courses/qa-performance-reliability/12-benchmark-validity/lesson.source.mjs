// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-4-3",
    title: "Valid benchmarks: environment, data & think time",
    slug: { _type: "slug", current: "valid-benchmarks-environment-data-think-time" },
    description:
        "A staging benchmark said the new leaderboard had a p95 of 18 ms at 300 req/s; on exam day production showed 2.4 s. Nothing was wrong with the arithmetic - the benchmark measured a different system. Learn the five threats to a benchmark's validity (environment, data size and distribution, caches, think time and pacing, closed versus open load models), how to spot each one in a report, and how to write a load test whose numbers transfer to production.",
    estimatedTime: 25,

    scenario: {
        role: "QA / performance engineer reviewing a benchmark before exam day, CodeDev learning platform",
        problem:
            "Benchmark report BM-0907 for the new GET /api/leaderboard says \"1,000 concurrent learners, 300 req/s, p95 18 ms, 0 errors\" and recommends no further work. On the first exam after the release, the leaderboard's p95 in production was 2.4 s for the 40 minutes of the peak, while submissions arrived at about 260 per second. The team wants to know how a carefully run benchmark could be wrong by a factor of 130, and what the next benchmark must do differently.",
    },

    content: [
        h2("1. The incident: a benchmark of a different system"),
        p("BM-0907 was not careless. It ran for 10 minutes, excluded the warm-up, used the release build, and its numbers are internally consistent. Here is its setup section, next to what production looked like on exam day:"),
        code("text", `
                     BM-0907 (staging)                     production, exam day
build                release 2026.10.30                    release 2026.10.30
instances            1 API (4 vCPU), PostgreSQL 18         6 API (4 vCPU), PostgreSQL 18
data                 500 users, 3 courses,                 1.2M users, 340 courses,
                     4,200 submissions                     61M submissions
requests             GET /api/leaderboard?courseId=42      leaderboard of ~120 courses,
                     (same course every time)              biggest course 41,000 learners
other traffic        none                                  ~260 submissions/s writing to the
                                                           same tables
load generator       k6 on the API's VM                    -
load model           1,000 VUs, no sleep(), closed loop    learners arrive on their own
result               p95 18 ms at 300 req/s                p95 2.4 s`, "BM-0907 vs exam day"),
        p("Every row is a way for a benchmark to measure something other than the question it was asked. The question was \"will the leaderboard hold on exam day?\" The benchmark answered \"how fast is a leaderboard of one tiny course, served from memory, with no writes, by a machine that is also generating the load?\" - very fast, as it turns out."),

        h2("2. Read the evidence: what the database saw"),
        p("Two queries on each database tell most of the story. The first shows how much of the data was read from memory; the second shows the plan of the leaderboard query for the course with the most learners:"),
        code("sql", `
-- share of block reads served from shared buffers, per database
SELECT datname, blks_hit, blks_read,
       round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) AS hit_pct
FROM pg_stat_database WHERE datname = 'codedev';

-- staging, after BM-0907        hit_pct 100.00
-- production, exam-day peak     hit_pct  91.37`, "buffer hit ratio"),
        code("text", `
staging (course 42: 180 submissions)
  Sort (actual time=0.214..0.231 rows=180)  Sort Method: quicksort  Memory: 41kB
    ->  Index Scan using submissions_course_id_idx on submissions (actual rows=180)
  Execution Time: 0.402 ms

production (course 7: 2.3M submissions, 41,000 learners)
  Sort (actual time=1904.551..2011.207 rows=41000)  Sort Method: external merge  Disk: 61248kB
    ->  HashAggregate (actual rows=41000)
          ->  Bitmap Heap Scan on submissions (actual rows=2311842)
  Execution Time: 2140.882 ms`, "EXPLAIN ANALYZE, leaderboard query, trimmed"),
        p("On staging the whole data set fit in memory and every leaderboard had a few hundred rows. In production the biggest course aggregates 2.3 million submissions, the sort spills to disk, and the working set no longer fits in the cache - while 260 submissions per second keep writing to the same table. Same code, same hardware type, different system."),

        h2("3. The core idea: five threats to validity"),
        p("A benchmark is valid when its result transfers to the situation you care about. Check five things, in this order, before you read any latency number."),
        h3("Environment"),
        p("The machines, the topology and **everything else that runs at the same time**. A staging API with no write traffic, a database on its own disk, a load generator on the same VM as the service it measures (it competes for CPU and measures its own stalls, lesson 2.3) - each changes the result. The test does not need production's size, but it must have production's shape: the same kinds of instances, the same pooler, the same mix of traffic on the shared resources, or a stated reason why a difference does not matter."),
        h3("Data size and distribution"),
        p("Query plans, sort methods, index sizes and cache behaviour all change with volume. The average is not enough: production's **skew** matters. CodeDev's average course has 5,000 submissions; the biggest has 2.3 million, and exam day is when the biggest course is busiest. Seed staging from a scaled copy of production (with personal data removed) or from a generator that reproduces the distribution, not a fixed small fixture."),
        h3("Caches"),
        p("A cache turns a benchmark of the system into a benchmark of the cache. Requesting `courseId=42` 180,000 times measures one cache entry. Draw request parameters from a realistic distribution (many courses, weighted like production), make the cache start in the state it will be in on exam day - cold after a deploy, or warm - and report the hit ratio next to the latency, so the reader can see which system was measured."),
        h3("Think time and pacing"),
        p("A virtual user is not a learner. A VU without `sleep()` sends a new request the moment the last one returns; a learner reads the page for half a minute. By N = X x (R + Z) (lesson 4.2), 1,000 VUs at 200 ms send 5,000 req/s, while 1,000 learners who reload every 30 s send about 33 req/s. Either add realistic think time, with a spread so the VUs do not move in lockstep, or - better - stop counting users and specify the **request rate** you want."),
        h3("Closed versus open load models"),
        p("In a **closed** model a fixed number of VUs each wait for an answer before sending the next request: when the server slows down, the load slows down with it. In an **open** model requests arrive at a rate you choose, whatever the server does - like learners at the start of an exam. A closed test hides overload, because it never sends more than the system can answer; an open test shows the queue and the errors that real arrivals would cause. In k6, `constant-vus` and `ramping-vus` are closed and `constant-arrival-rate` and `ramping-arrival-rate` are open; wrk2 keeps a constant rate with `-R`; Locust users are closed by default (check the current docs of your tool)."),
        callout("info", "When a small or closed benchmark is fine",
            "Not every benchmark must look like exam day. A micro-benchmark that compares two implementations of the ranking function on a fixed data set is valid for that question: which implementation is faster, all else equal. A closed model is right for a system whose users do wait for each answer, such as a batch job with a fixed number of workers. Validity is about the question: write it at the top of the report, and the five checks follow from it."),

        challenge("chal_quiz_qpr_431"),

        h2("4. Worked example: a benchmark that answers the exam-day question"),
        p("The team writes the next benchmark from the question backwards. First, the load: on exam day the leaderboard is refreshed once after every submission (the result page shows it) and reloaded by learners about every 30 s. The design load is 408 submissions/s; the last exam had 3,700 learners at a peak of 262 submissions/s. A small script turns that into rates instead of VUs:"),
        code("python", `
import math

DESIGN_SUBMIT_RPS = 408
LAST_EXAM_LEARNERS, LAST_EXAM_PEAK_RPS = 3_700, 262
RELOAD_EVERY_S = 30

# learners scale with submissions; each submit refreshes the leaderboard once
learners = LAST_EXAM_LEARNERS * DESIGN_SUBMIT_RPS / LAST_EXAM_PEAK_RPS
leaderboard_rps = DESIGN_SUBMIT_RPS + learners / RELOAD_EVERY_S
print(f"learners at design load: {learners:,.0f}")
print(f"leaderboard arrival rate: {leaderboard_rps:.0f} req/s")

# what the old closed-loop script really sent: N / (R + Z)
vus, mean_latency_s, think_s = 1_000, 0.2, 0.0
print(f"BM-0907 closed loop: {vus / (mean_latency_s + think_s):,.0f} req/s from {vus:,} VUs")`, "exam_day_rates.py"),
        code("bash", `
$ python3 exam_day_rates.py
learners at design load: 5,762
leaderboard arrival rate: 600 req/s
BM-0907 closed loop: 5,000 req/s from 1,000 VUs`, "terminal"),
        p("Then the k6 script: two open-model scenarios that run together, so the leaderboard competes with submissions for the same database, and course ids drawn with production's weights instead of one fixed id:"),
        code("javascript", `
import http from "k6/http";
import { SharedArray } from "k6/data";

// [{ "courseId": 7, "weight": 0.181 }, ...] exported from production, cumulative weights added below
const courses = new SharedArray("courses", () => {
  let total = 0;
  return JSON.parse(open("./course_weights.json")).map((c) => ({ ...c, upTo: (total += c.weight) }));
});

function pickCourse() {
  const r = Math.random() * courses[courses.length - 1].upTo;
  return courses.find((c) => r < c.upTo).courseId;
}

export const options = {
  scenarios: {
    leaderboard: { executor: "constant-arrival-rate", rate: 600, timeUnit: "1s", duration: "20m",
                   preAllocatedVUs: 300, maxVUs: 2000, exec: "leaderboard" },
    submissions: { executor: "constant-arrival-rate", rate: 408, timeUnit: "1s", duration: "20m",
                   preAllocatedVUs: 400, maxVUs: 3000, exec: "submit" },
  },
};

export function leaderboard() {
  http.get(\`\${__ENV.BASE}/api/leaderboard?courseId=\${pickCourse()}\`, { tags: { name: "leaderboard" } });
}

export function submit() {
  // body built from recorded submissions of the biggest courses; omitted here
}`, "exam-day.js"),
        p("The rest of the setup is a list, written into the report before the run:"),
        bullets([
            "**Environment:** 6 API instances as in production, PgBouncer in front of PostgreSQL as in production, the load generator on its own machine in the same region, its CPU recorded.",
            "**Data:** a scaled copy of production (personal data replaced), 61M submissions, the same skew: the biggest course has 41,000 learners.",
            "**Caches:** the leaderboard cache is flushed and the database restarted 10 minutes before the run, as after the exam-day deploy; the first 5 minutes are reported separately as warm-up (lesson 3.1).",
            "**Load:** open model, 600 leaderboard reads/s and 408 submissions/s together, 20 minutes at the design load.",
            "**Question:** does the leaderboard meet p95 300 ms at the exam-day design load, with submissions running?",
        ]),

        h2("5. How to verify that a benchmark is valid"),
        bullets([
            "**Compare fingerprints with production.** Buffer hit ratio (pg_stat_database), application cache hit ratio, rows per course for the busiest course, the query plan of the hot query (EXPLAIN on the test data and on a production replica). If a fingerprint differs a lot, the benchmark measured another system.",
            "**Check that the load was delivered.** In an open model, k6 reports dropped_iterations when it had no free VU to start a request on time; it must be 0, or the test sent less than it says. Record the load generator's CPU: above about 80%, its timings are suspect.",
            "**Check the request rate, not the user count.** Throughput from the raw request count over the steady window (lesson 2.2) must match the rate you designed. A report that only says \"1,000 users\" has not told you the load.",
            "**Re-run and compare with the noise.** Two runs of the same setup must agree within the A/A spread (lesson 4.1); otherwise something in the environment is not under control.",
            "**Close the loop after the event.** After exam day, compare production's p95 and hit ratios with the benchmark's. A gap is a finding about the benchmark, and the next one should fix it.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**A fixture-sized database.** Spot it: the benchmark's data set fits in a few megabytes, or the busiest key has hundreds of rows instead of millions. Fix: production-like volume and skew.",
            "**One hot key.** Spot it: the script uses a constant id, or ids from a tiny list, and the cache hit ratio is near 100%. Fix: draw ids from production's distribution and report the hit ratio.",
            "**VUs called users.** Spot it: no sleep() in the script and a title in \"concurrent users\". Fix: realistic think time, or an arrival rate.",
            "**A closed model for open traffic.** Spot it: throughput falls exactly when latency rises, and the error rate stays at 0% during a slowdown. Fix: an arrival-rate executor, and watch dropped iterations and queues.",
            "**The generator on the system under test.** Spot it: k6 and the API share a host, or the generator's CPU is above 80%. Fix: a separate generator machine, its metrics in the report.",
        ]),

        h2("7. Summary"),
        bullets([
            "A benchmark is valid only for a question. Write the question first; the environment, data, caches, think time and load model follow from it.",
            "Most invalid benchmarks are small, warm and closed: tiny data, one cached key, VUs without think time that slow down with the server. Each makes the system look faster than it will be.",
            "Prove validity with fingerprints you can compare with production - hit ratios, plans, the busiest key, the delivered request rate - and check them again after the real event.",
        ]),

        h2("Sources"),
        bullets([
            "Grafana k6 documentation: scenarios and executors (constant-vus, constant-arrival-rate), dropped_iterations - grafana.com/docs/k6/latest/ (check your version)",
            "Gil Tene, wrk2: a constant-throughput HTTP load generator - github.com/giltene/wrk2",
            "Bianca Schroeder, Adam Wierman, Mor Harchol-Balter, \"Open Versus Closed: A Cautionary Tale\", NSDI 2006.",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last benchmark report your team relied on and fill in the table from section 1 for it: environment, data, request parameters, other traffic, load generator, load model - next to production. Mark every row where they differ and write, for each, whether it makes the result optimistic or pessimistic. Then rewrite the report's title as the question it really answered."),
    ],
});
