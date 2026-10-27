// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-4-1",
    title: "Is it really faster? Comparing runs with noise",
    slug: { _type: "slug", current: "is-it-really-faster-comparing-runs-with-noise" },
    description:
        "The perf bot said a pull request made GET /api/leaderboard 11% faster, from one run of each build; a week later a pull request that only changed a README was \"9% faster\" too. Learn why the run, not the request, is the unit of a comparison, how to measure the noise with an A/A check, how to interleave runs, and how to decide with a rule you fix in advance: no overlap between runs, or a bootstrap interval for the difference of p95s.",
    estimatedTime: 25,

    scenario: {
        role: "QA / performance engineer who owns the perf bot, CodeDev learning platform",
        problem:
            "Every pull request on the CodeDev API gets a comment from the perf bot: one k6 run of main, one run of the branch, GET /api/leaderboard at 150 req/s for 60 s on staging, and a verdict. PR #1042 \"leaderboard: cache rank lookups\" got \"p95 212 ms -> 188 ms, -11.3%, FASTER\" and was merged. The nightly run after the merge showed a p95 of 219 ms. Then PR #1051, which only fixed a typo in the README, got \"-9.1%, FASTER\". The team asks you whether the bot can be trusted before it is used to judge the exam-day performance work.",
    },

    content: [
        h2("1. The incident: a bot that finds speed-ups in a README"),
        p("The perf bot is a good idea: every change gets a number before it is merged. The problem is what the number is compared with. Here are three of its comments from the same week:"),
        code("text", `
PR #1042 leaderboard: cache rank lookups
  main     http_req_duration p(95)=212ms
  branch   http_req_duration p(95)=188ms   -11.3%  FASTER

PR #1049 submissions: log the judge queue depth
  main     http_req_duration p(95)=193ms
  branch   http_req_duration p(95)=226ms   +17.1%  SLOWER   (the PR was blocked)

PR #1051 docs: fix typo in README
  main     http_req_duration p(95)=231ms
  branch   http_req_duration p(95)=210ms    -9.1%  FASTER`, "perf bot comments, GET /api/leaderboard"),
        p("A typo fix in a Markdown file cannot change the latency of the leaderboard. So the bot has just shown you, for free, how large a difference it reports when **nothing** changed: about 10% in either direction. Any claim smaller than that is not evidence yet, and PR #1049 may have been blocked for nothing."),
        p("The question of this lesson is not \"which statistics test is best\". It is simpler and more useful: **how much do two runs of the same code differ, and is the change bigger than that?**"),

        h2("2. Measure the noise first: the A/A check"),
        p("An A/A check runs the same build several times under the same conditions and looks at the spread. It costs a few minutes and tells you the size of the smallest difference you can hope to see. The bot's own script, five times in a row against main at commit 8c41d2e:"),
        code("text", `
A/A check: main@8c41d2e, k6, GET /api/leaderboard, 150 req/s, 60 s, staging, 9,000 requests per run

run   p(95)    med    avg
1     196ms    82ms   96.1ms
2     231ms    84ms   101.7ms
3     188ms    80ms   94.0ms
4     214ms    81ms   98.3ms
5     205ms    83ms   97.2ms

p95 across runs: min 188, max 231, spread 43 ms; mean 206.8 ms`, "A/A check"),
        p("Read it slowly. The median barely moves (80 to 84 ms) but the p95 moves by 43 ms, about 20% of its value. That is typical: a tail percentile depends on the few slowest requests of the run, and those depend on whatever else happened during that minute - a garbage collection, a vacuum on the leaderboard table, another team's job on the same staging host, a cold page in the database cache."),
        callout("info", "Why 9,000 requests do not make a run precise",
            "Every request in a run shares that run's conditions. If the staging host is busier during run 2, all 9,000 requests feel it. More requests per run make the p95 a precise description of that run, but they do not shrink the variation between runs. Only more runs do. This is the most common mistake in comparing benchmarks: treating samples as independent when they are grouped."),

        h2("3. The core idea: compare runs, not requests"),
        p("Once you accept that the run is the unit, three rules follow."),
        numbered([
            "**Several runs per side.** One run per build is an anecdote. Three is the minimum to see a spread; five per side is a common choice for a CI bot.",
            "**Interleave the runs.** Run A, B, A, B, ... instead of all A then all B. Staging drifts: caches warm up, a nightly job starts, the database grows. If all A runs come first, drift looks exactly like an effect of the change. Interleaving spreads drift over both sides.",
            "**Decide the rule before you look.** Fix the number of runs, the warm-up you exclude (lesson 3.1) and the decision rule in advance. Re-running until the bot says FASTER, or stopping as soon as it does, will find a speed-up in any change, including a README.",
        ]),
        h3("Two decision rules you can defend"),
        p("**Rule 1: no overlap.** Run five times each, interleaved. Call B faster only if the slowest B run is faster than the fastest A run, that is max(p95 of B) < min(p95 of A). If the change does nothing, the ten runs are exchangeable, and the chance that all five B runs happen to land below all five A runs is 1 in C(10, 5) = 1 in 252, about 0.4%. The rule is crude, it needs no statistics library, and anyone in a code review can check it by eye."),
        p("**Rule 2: an interval for the difference.** The difference you care about is mean(p95 of A runs) - mean(p95 of B runs). A **bootstrap** estimates how much that number would move if you repeated the whole experiment: draw, with replacement, as many runs from A's list as it has, and as many from B's list, compute the difference again, and repeat that a thousand times. The middle 95% of those differences is an interval. If the whole interval is above zero, B is faster; if it is below zero, B is slower; if it contains zero, the data cannot tell. Two details matter:"),
        bullets([
            "**Resample runs, never individual requests.** Resampling the 9,000 requests of a run hides the run-to-run spread you measured in the A/A check and gives a narrow, overconfident interval.",
            "**Make it reproducible.** A bootstrap uses random numbers. Seed the generator and record the seed with the result, so that the bot gives the same verdict when someone re-runs the analysis on the same files.",
        ]),
        h3("Statistically clear is not the same as worth it"),
        p("With enough runs you can show that a change saves 2 ms at p95. That may be real and still irrelevant: the leaderboard's objective is 300 ms. Decide with the team, in advance, the smallest difference that matters for a decision (for example 5% of the p95), and report both: \"B is faster, interval 12 to 31 ms\" tells the reviewer how much, not only whether."),
        h3("When not to bother"),
        bullets([
            "**The effect is huge.** A change that takes the p95 from 2.4 s to 180 ms does not need a bootstrap: one interleaved pair and a look at the A/A spread settle it.",
            "**The noise is the problem.** If the A/A spread is 40% of the value, statistics will only tell you that you cannot see anything. Fix the environment first: a dedicated load generator and staging host, a fixed data set, warm-up excluded (lessons 3.1 and 4.3).",
            "**You need production truth.** A comparison on staging tells you whether B is faster than A on staging. A canary with production traffic answers a different question and has its own noise.",
        ]),

        challenge("chal_quiz_qpr_411"),

        h2("4. Worked example: the no-overlap rule and a noise budget"),
        p("The team re-runs PR #1042 properly: five runs of main and five of the branch, interleaved, warm-up of 30 s excluded, same staging host. The bot computes the p95 of each run from the raw k6 samples (nearest rank, as everywhere in this course) and applies rule 1. This script reads the per-run p95s that the bot wrote to a JSON file:"),
        code("python", `
import json
import math
import sys
from statistics import mean


def noise_budget(aa_p95s):
    """Spread of an A/A check: the smallest difference worth looking at."""
    return max(aa_p95s) - min(aa_p95s)


def no_overlap_verdict(p95_a, p95_b):
    if max(p95_b) < min(p95_a):
        return "B is faster"
    if min(p95_b) > max(p95_a):
        return "B is slower"
    return "no clear difference"


def chance_of_no_overlap(n_a, n_b):
    # probability that, with no real effect, all B runs land below all A runs
    return 1 / math.comb(n_a + n_b, n_b)


runs = json.load(sys.stdin)            # {"aa": [...], "a": [...], "b": [...]}
print("noise budget (A/A spread):", noise_budget(runs["aa"]), "ms")
print("mean A", round(mean(runs["a"]), 1), "mean B", round(mean(runs["b"]), 1))
print("verdict:", no_overlap_verdict(runs["a"], runs["b"]))
print("false alarm chance:", round(chance_of_no_overlap(len(runs["a"]), len(runs["b"])), 4))`, "compare_runs.py"),
        code("bash", `
$ echo '{"aa": [196, 231, 188, 214, 205],
         "a":  [204, 226, 197, 219, 209],
         "b":  [191, 214, 199, 205, 186]}' | python3 compare_runs.py
noise budget (A/A spread): 43 ms
mean A 211 mean B 199
verdict: no clear difference
false alarm chance: 0.004`, "terminal"),
        p("The branch is 12 ms faster on average, and four of its five runs are below the matching main run. But its slowest run (214 ms) is slower than main's fastest (197 ms), and 12 ms is well inside the 43 ms the A/A check showed. The honest summary for PR #1042 is: \"no difference we can see at this noise level\". That is a useful result: the cache did not hurt, and if the team wants to know whether it helps, they need either a quieter environment or more runs - not a better adjective."),
        callout("tip", "Write the verdict with the evidence",
            "A good bot comment shows the runs, not only the conclusion: \"main 204/226/197/219/209, branch 191/214/199/205/186 (interleaved, 30 s warm-up excluded), A/A spread 43 ms: no clear difference.\" A reviewer can check that in ten seconds, and a later reader can see why the PR was merged."),
        p("Rule 1 throws information away: it only looks at the extremes. When the team wants a number for \"how much faster\", rule 2 gives an interval. The exercise below builds rule 2 into the bot, with a pseudo-random generator that is fully specified so that every run of the analysis gives the same verdict."),

        challenge("chal_coding_qpr_412"),

        h2("5. How to verify the comparison itself"),
        bullets([
            "**Run an A/A check on every bot change.** Give the bot main against main. It must say \"no clear difference\" almost every time; if it says FASTER or SLOWER more than about once in twenty A/A checks with a 95% interval, the rule or the environment is broken.",
            "**Plant a known difference.** Add a fixed 30 ms sleep to the branch on purpose. The bot must call it slower every time, and the interval must contain 30 ms. This checks that the comparison can see an effect of the size you care about.",
            "**Check the run conditions.** Every run records the build, the host, the start time, the warm-up excluded and the load generator's CPU. A run whose generator was above about 80% CPU measured the generator (lesson 2.3) and is dropped before the comparison, by a rule written in advance.",
            "**Reproduce the verdict.** Re-run the analysis on the stored samples with the stored seed. The same input must give the same interval to the last digit.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**One run per side.** Spot it: the report has one number per build and no A/A spread next to it. Fix: several interleaved runs per side and the noise budget in the report.",
            "**Treating requests as independent samples.** Spot it: a tiny interval or a \"p < 0.001\" computed over 9,000 requests per run, while the A/A runs differ by 20%. Fix: the run is the unit; resample runs.",
            "**Running all A, then all B.** Spot it: the run timestamps show the two sides in two blocks, and B is always the later block. Fix: interleave A, B, A, B, or randomise the order and record it.",
            "**Re-running until it is green.** Spot it: the CI history shows the perf job retried three times on a PR, and the last result was kept. Fix: the number of runs is fixed before the first one starts; a retry replaces the whole set.",
            "**Comparing averages to judge a tail.** Spot it: avg improved by 3%, the p95 of the same runs did not move, and the PR says \"faster\". Fix: compare the statistic users feel - here the p95 - and say which one you compared.",
        ]),

        h2("7. Summary"),
        bullets([
            "Two runs of the same code differ. Measure that difference with an A/A check before you believe any comparison; it is the noise every change must beat.",
            "The run is the unit: several interleaved runs per side, warm-up excluded, a decision rule fixed in advance. More requests per run do not replace more runs.",
            "Decide with a rule anyone can re-run - no overlap between runs, or a seeded bootstrap interval of the difference of p95s - and report the size of the difference, not only its sign.",
        ]),

        h2("Sources"),
        bullets([
            "Grafana k6 documentation: end-of-test summary and per-request JSON/CSV output (check the docs for your k6 version) - grafana.com/docs/k6/latest/",
            "Bradley Efron and Robert Tibshirani, An Introduction to the Bootstrap (1993): resampling to estimate the variability of a statistic.",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run an A/A check on an endpoint you own: the same build, five runs, same script. Write down the spread of the p95. Then write the rule your team will use to call a change faster - number of runs, interleaving, warm-up, decision rule and the smallest difference that matters - and put it next to the load test script, before the next performance pull request."),
    ],
});
