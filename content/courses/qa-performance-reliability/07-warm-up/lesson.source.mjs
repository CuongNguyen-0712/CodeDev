// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-3-1",
    title: "Exclude the warm-up before you compare",
    slug: { _type: "slug", current: "exclude-the-warm-up-before-you-compare" },
    description:
        "A pull request claims that POST /api/submissions got 40% faster at p95, but its baseline ran on pods deployed 90 seconds earlier and its candidate on pods that were already warm. Learn where warm-up comes from (connection pools, JIT, caches, autoscaling), when cold-start latency is exactly what you should measure, how to find the end of the warm-up with a rule anyone can re-run (windows, a reference, a band that the run must stay in), and how to design load tests whose warm-up is separate from the measurement.",
    estimatedTime: 25,

    scenario: {
        role: "QA / performance engineer reviewing a performance pull request, CodeDev learning platform",
        problem:
            "PR #1047 \"submissions: batch the judge enqueue\" says: \"p95 of POST /api/submissions 410 ms -> 246 ms (-40%), see k6 runs base-0412 and cand-0413.\" Two reviewers approved. You notice that base-0412 started 90 seconds after a deploy that replaced every API pod, and that cand-0413 ran on the same pods five minutes after base-0412 finished. Before exam day, the team wants to know whether the change really made submissions faster.",
    },

    content: [
        h2("1. The incident: a 40% improvement nobody can reproduce"),
        p("The CodeDev judge team changed how POST /api/submissions puts a new submission on the judge queue: instead of one enqueue call per submission, the API now batches enqueues every 5 ms. The pull request came with numbers, which is good practice, and the numbers looked convincing:"),
        code("text", `
PR #1047 submissions: batch the judge enqueue

Load test: k6, constant-arrival-rate 150 req/s, 5 minutes, POST /api/submissions,
staging (https://api.codedev.test, 4 API pods)

run          build              http_req_duration p(95)
base-0412    main@8c1e2f0       410 ms
cand-0413    pr-1047@51d9a77    246 ms      (-40%)`, "PR description"),
        p("A week later the change is in production, and the dashboards show no change in the p95 of submissions at all. Someone reruns the candidate on fresh pods and gets 405 ms. Was the change useless, did production behave differently, or was the comparison broken from the start? The run timestamps in the CI log answer most of it:"),
        code("text", `
10:02:11  deploy main@8c1e2f0 to staging: 4/4 pods replaced
10:03:41  k6 run base-0412   (5 min)
10:08:44  base-0412 finished
10:09:30  deploy pr-1047@51d9a77: rolling config reload, pods NOT restarted (feature flag)
10:13:40  k6 run cand-0413   (5 min)`, "CI log, staging"),
        p("The baseline started 90 seconds after every pod was replaced. The candidate started on the same pods after they had served 45,000 requests. Whatever the change did, the two runs did not start from the same state."),

        h2("2. Read the evidence: the run is not one number"),
        p("A whole-run percentile hides **when** the slow requests happened. Split each run into fixed windows of 30 seconds and compute the p95 of each window from the raw samples (nearest-rank, as everywhere in this course):"),
        code("text", `
window (s)   0-30  30-60  60-90  90-120  120-150  150-180  180-210  210-240  240-270  270-300
base-0412    2140    880    412     251      236      244      231      240      238      235
cand-0413     262    241    236     229      238      232      230      235      231      233
                                                                                  p95 in ms`, "per-window p95, 150 req/s, about 4,500 requests per window"),
        p("Read it line by line:"),
        bullets([
            "**base-0412** starts at 2.1 s and falls for three windows. From 90 s on it moves between 231 and 251 ms and stays there.",
            "**cand-0413** has almost no slope: 262 ms in the first window, then 229-241 ms.",
            "**From 90 s on, the two runs overlap.** Base moves between 231 and 251 ms, candidate between 229 and 241 ms. A difference of a few percent may be real or may be noise (lesson 4.1 is about telling those apart), but it is nowhere near 40%.",
        ]),
        p("So the -40% in the pull request is mostly the cost of the first 90 seconds after a deploy, assigned to a code change that happened to be measured on warm pods. The batching may still help; this evidence cannot say so."),

        h2("3. Where warm-up comes from, and when it is the thing to measure"),
        p("Right after a start, a service is slower for reasons that have nothing to do with the code under test. On the CodeDev API the usual suspects are:"),
        bullets([
            "**Connection pools fill lazily.** The PostgreSQL pool starts with a few connections and opens the rest under load; each new connection costs a TCP and TLS handshake plus authentication, tens of milliseconds while requests wait.",
            "**The runtime compiles hot code.** Node.js (V8) and the JVM start by interpreting and optimise the functions that run often. The first thousands of requests run slower code.",
            "**Caches start empty.** In-process caches (course metadata, judge test definitions), the database buffer cache and the OS page cache all fill from the first requests.",
            "**The platform reacts.** An autoscaler that adds pods in the first minute, a load balancer that slowly ramps traffic to new pods, DNS and service discovery settling.",
            "**The load generator warms up too.** Its own connections, TLS sessions and virtual users start during the first seconds.",
        ]),
        p("None of these is noise in the statistical sense: they push latency up in a systematic way, for a period that depends on the state the run started from. That is why the start state must be the same for every run you compare, or the warm-up must be cut from both."),
        callout("info", "When not to exclude the warm-up",
            "Cold-start latency is real latency for someone. On exam day, every deploy, every pod that the autoscaler adds and every restart after a crash serves its first minute cold, to real learners. If the question is \"what do learners see right after a deploy?\" or \"how fast can a new pod take traffic?\", the warm-up is the measurement: keep it, report it separately with its own target, and test it on purpose. What you must not do is mix it into a steady-state number, or let it decide a comparison between two builds by accident."),
        p("There is a second reason to be strict: once you start cutting data from runs, it is tempting to cut whatever makes the result look better. The defence is a rule written **before** you look at the comparison and applied the same way to both runs."),

        challenge("chal_quiz_qpr_311"),

        h2("4. A warm-up rule anyone can re-run"),
        p("\"Skip the first two minutes\" is a rule, but a fragile one: base-0412 needed 90 seconds, a run after a database failover may need five minutes, and a run on warm pods needs none. A better rule looks at the data and says where the run settles. Build it from four decisions, each with a reason:"),
        numbered([
            "**Windows, not single requests.** Cut the run into fixed windows (for example 10 or 30 seconds) by the time each request was sent, and compute one p95 per window. A window needs enough samples for its p95 to mean something: at 150 req/s, a 30 s window has about 4,500. Windows without samples are skipped, not treated as zero.",
            "**A reference from the end of the run.** The run settles, if it settles at all, towards its end. Take the median of the window p95s of the second half of the run as the steady-state reference: the median, so that one slow window late in the run does not move it.",
            "**A band, and the run must stay in it.** The warm-up ends at the first window after which **every** window stays within, say, 20% of the reference. \"First window inside the band\" is not enough: warm-up is not monotonic. A cache can fill, get evicted, and fill again; the pool can grow in steps; a JIT can deoptimise a function and recompile it.",
            "**A minimum steady length, otherwise no verdict.** If only the last two windows are in the band, the run never really reached a steady state. A run whose latency keeps growing (a leak, a table that grows, a queue that never drains) never gets there either. Then the honest answer is \"this run cannot be compared\", not a number.",
        ]),
        p("The rule has parameters (window size, band, minimum length), and they are a judgement call. That is acceptable as long as they are written down, the same for both runs, and chosen before the comparison. In the challenge of this lesson you implement exactly such a rule; the description gives every parameter."),
        h3("Worked example: the per-window table from raw samples"),
        p("Every rule above starts from per-window percentiles of raw samples, not from the summary of the load tool. Here is a script that builds the table from section 2 out of a k6 CSV export (k6 run --out csv=base-0412.csv). The CSV columns shown are the ones recent k6 versions write; check the output of your version before you rely on them."),
        code("python", `
import csv
import math
import sys

def percentile(values, p):
    """Nearest-rank percentile on sorted samples; None for an empty list."""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(math.ceil(p * len(ordered) / 100), 1) - 1]

def window_p95s(path, window_s=30):
    rows = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            if row["metric_name"] == "http_req_duration":
                rows.append((float(row["timestamp"]), float(row["metric_value"])))
    start = min(t for t, _ in rows)
    windows = {}
    for t, ms in rows:
        windows.setdefault(int((t - start) // window_s), []).append(ms)
    return [(w * window_s, len(windows[w]), percentile(windows[w], 95)) for w in sorted(windows)]

for start_s, count, p95 in window_p95s(sys.argv[1]):
    print(f"{start_s:>5}s  n={count:>5}  p95={p95:8.1f} ms")`, "window_p95.py"),
        p("Run it on both CSV files and put the two tables next to each other before you read any summary line. By default the CSV timestamps are Unix time in whole seconds, which is fine for 30 s windows; for finer windows, look up the time format options of your k6 version or use the JSON output."),

        h2("5. Better: design the warm-up into the test"),
        p("Detecting the warm-up after the fact rescues an old run. For new runs, give the warm-up its own phase so that it never enters the measured metrics. In k6, two scenarios do this, and the threshold applies only to the steady one:"),
        code("javascript", `
// submit-steady.js - k6 (check the scenarios and thresholds docs of your k6 version)
export const options = {
  scenarios: {
    warmup: {
      executor: "constant-arrival-rate",
      rate: 150, timeUnit: "1s", duration: "3m",
      preAllocatedVUs: 300, exec: "submit",
    },
    steady: {
      executor: "constant-arrival-rate",
      rate: 150, timeUnit: "1s", duration: "10m", startTime: "3m",
      preAllocatedVUs: 300, exec: "submit",
    },
  },
  thresholds: {
    // k6 tags every sample with the scenario that sent it
    "http_req_duration{scenario:steady}": ["p(95)<2000"],
  },
};`, "submit-steady.js"),
        p("Locust has a flag for the same idea, --reset-stats, which resets the statistics once all users have been spawned. It only removes the spawn phase, not a warm-up that lasts longer than the ramp-up, so still look at the per-window table."),
        p("Two habits make the warm-up phase trustworthy:"),
        bullets([
            "**Same start state for every run.** Either restart the pods before every run (both runs cold, then measure warm-up separately) or run the same warm-up phase before every run (both warm). Never one of each.",
            "**Warm-up at the same rate and request mix as the measurement.** Warming up with GET requests does not warm the code paths, caches and connections of POST /api/submissions.",
        ]),

        h2("6. How to verify a comparison"),
        bullets([
            "**Look at both per-window tables before any summary.** If one run has a slope at the start and the other does not, the whole-run numbers are not comparable. This takes one minute and would have stopped PR #1047.",
            "**Run an A/A test.** Run the **same** build twice under the comparison procedure. If the procedure reports a large difference between identical builds (cold vs warm, for example), it will report the same fake difference between different builds.",
            "**Check that the steady part is large enough.** Count the windows and samples left after the cut. A few hundred samples give a shaky p95, and a p99 even more so.",
            "**Re-run the rule, do not re-pick the cut.** Anyone with the samples and the written parameters should get the same warm-up end. If the cut was chosen by eye, it was chosen after seeing the result.",
            "**Report what you excluded.** \"Warm-up: first 90 s (13,520 requests) excluded from both runs by rule X\" lets a reviewer check the decision instead of trusting it.",
        ]),

        h2("7. The challenge: exclude the warm-up, then compare"),
        p("The code runner has no load generator, so the challenge works on two recorded runs, as a list of [time, latency] samples each. Your function finds where each run's warm-up ends with the exact rule in the description, reports the steady part of each run, and compares the two p95 values. It also reports the naive comparison of the whole runs, so that you can see how far apart the two answers are on the test data."),
        p("Expect the same traps as in real data: samples out of order, samples that are not valid measurements, windows with no samples, a run that leaves the band again after entering it, and a run that never settles at all."),
        challenge("chal_coding_qpr_312"),

        h2("8. Common mistakes"),
        bullets([
            "**Comparing a cold run with a warm run.** The difference you measure is the warm-up. Spot it: the run timestamps against deploy and restart times, and a slope at the start of one per-window table only.",
            "**A fixed cut that fits one run.** \"Drop the first minute\" worked for last month's run; today the database restarted and warm-up took four. Spot it: the first windows after the cut are still above the rest of the run.",
            "**Ending the warm-up at the first good window.** One window inside the band, then two above it. Spot it: the windows right after your cut are not inside the band.",
            "**Comparing a run that never settled.** A latency that keeps rising has no steady state; any cut gives a different number. Spot it: the last windows still trend up, and the reference moves when you add more of the run.",
            "**Hiding cold-start latency that users do feel.** Excluding the warm-up from a comparison is right; dropping it from the report is not. Spot it: no number anywhere in the report for the first minutes after a deploy.",
        ]),

        h2("9. Summary"),
        numbered([
            "Warm-up (pools, JIT, caches, autoscaling) raises latency for a period that depends on the start state, so two runs are only comparable from the same start state or with the warm-up cut from both.",
            "Find the end of the warm-up with a written rule on per-window percentiles: a reference from the end of the run, a band that every later window must stay in, a minimum steady length, and no verdict for a run that never settles.",
            "Better than detecting the warm-up is designing it in: a separate warm-up phase at the same rate and mix, thresholds on the steady phase only, and a separate test and target for cold-start latency.",
        ]),

        h2("Sources"),
        bullets([
            "Grafana k6 documentation: scenarios (startTime, constant-arrival-rate), thresholds on tagged sub-metrics, CSV output - grafana.com/docs/k6/latest/",
            "Locust documentation: configuration options, --reset-stats - docs.locust.io",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take two runs of the same build from your own project's load tests, one started right after a deploy and one started on warm instances. Build the per-window p95 table for both with the script in section 4, write down your warm-up rule and its parameters before you compute anything else, and apply it to both runs. Then write the three lines you would want in PR #1047: the steady p95 of each run, what was excluded and why, and whether the difference is larger than the window-to-window spread of a single run."),
    ],
});
