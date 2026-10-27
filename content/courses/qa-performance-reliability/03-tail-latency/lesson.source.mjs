// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-1-3",
    title: "Why the tail matters: one slow call per page",
    slug: { _type: "slug", current: "why-the-tail-matters-one-slow-call-per-page" },
    description:
        "Every service behind the course overview page met its targets, and its p99 was only one call in a hundred, yet one page load in four took close to a second. Learn why a page that waits for 30 backend calls feels the p99 of each call on about 26% of its loads (1 - 0.99^30), how fan-out grows with the data, how to check the estimate with a simulation and with traces, and which fixes come first: fewer calls, a shorter tail, deadlines and, with care, hedged requests.",
    estimatedTime: 20,

    scenario: {
        role: "QA engineer investigating a slow page, CodeDev learning platform",
        problem:
            "Learners say the course overview page on https://app.codedev.test \"sometimes takes a second to show my progress\". Real user timings agree: the request behind it, GET /api/courses/:id/overview, has a p50 of 60 ms but a p75 of 820 ms. The progress-service team points at their dashboard: their median call takes 40 ms, and only the slowest 1% of calls take 0.8 to 1.2 s, during cache refreshes. They are right about their service, and the page is still slow on one load in four. You are asked to explain how both can be true, and what to fix first.",
    },

    content: [
        h2("1. The incident: every service is fine, the page is not"),
        p("Two dashboards, read on the same afternoon, seem to contradict each other:"),
        code("text", `
progress-service - GET /progress/:lessonId        (last 24 h, 2.4M calls, nearest-rank)
  p50  40 ms     p75  50 ms     p95  58 ms     p99  812 ms

API - GET /api/courses/:id/overview               (last 24 h, real user timings)
  p50  60 ms     p75  820 ms    p95  1.13 s    p99  1.19 s`, "two latency panels"),
        p("For one progress call, 812 ms is the 1-in-100 case. For the overview request, 820 ms is already the p75: a 1-in-4 case. Nothing is broken in either service. The overview request simply makes many progress calls, and it cannot answer before the last one returns."),

        h2("2. Read the trace"),
        p("One trace of a slow overview request shows the shape. The course has 24 lessons; the API asks progress-service about each lesson separately, all at once, and also calls six other things:"),
        code("text", `
GET /api/courses/:id/overview                                902 ms
  catalog.getCourse                                           31 ms
  enrollment.get                                              22 ms
  progress.get  lesson 1                                      38 ms
  progress.get  lesson 2                                      44 ms
  ...                                                     (20 more, 25-55 ms)
  progress.get  lesson 17                                    874 ms   <- one slow call
  ...
  progress.get  lesson 24                                     41 ms
  leaderboard.rankFor                                         47 ms
  recommendations.next                                        52 ms
  badges.list, streaks.get                                 29, 26 ms
-> 30 child calls, all started within 3 ms, the parent ends 4 ms after the slowest one`, "trace of one overview request"),
        p("Twenty-nine calls finished in about 50 ms, and the learner still waited 902 ms, because one call landed in progress-service's slowest 1%. When calls run in parallel, the request takes as long as its **slowest** call, not its typical one. When they run one after another, it takes the **sum**, which is worse for the typical request and no better for the tail."),

        h2("3. The arithmetic of fan-out"),
        p("Call a request \"fast\" when it is not in the slowest 1%, the region above the p99. One call is fast with probability 0.99. If the calls are independent, all n calls of a page are fast with probability 0.99^n, so:"),
        code("text", `
P(page waits for at least one slow call)  =  1 - 0.99^n

 n calls    0.99^n    at least one slow
     1      0.990          1.0%
     5      0.951          4.9%
    10      0.904          9.6%
    24      0.786         21.4%
    30      0.740         26.0%     <- the overview page
   100      0.366         63.4%`, "one slow call per page"),
        p("With 30 calls, 26% of page loads wait for a slow call: that is the 1-in-4 from the incident, and why the page's p75 sits in the 800 ms range while every individual call has a p75 of 50 ms. The per-call p99 has become the page's p74."),
        p("The same arithmetic runs at every level above. A learner who opens 10 such pages during a study session makes 300 progress calls; the chance that their session includes at least one slow page is 1 - 0.99^300 = 95%. **For the learner, the p99 of a backend call is not a rare event; it is part of nearly every session.**"),
        h3("Working backwards: what each call must achieve"),
        p("If the overview request should stay fast in 99% of cases, every one of its 30 calls must be fast together with probability 0.99. Each call then needs to be fast with probability 0.99^(1/30) = 0.99967. In other words, the page's p99 is set by roughly the **p99.97** of each call. That is why teams that run large fan-outs look at p99.9 and beyond: at their scale, those are the numbers users feel."),
        callout("info", "Independence is an assumption",
            "1 - 0.99^n assumes slow calls are independent. Real slowness often clusters: a garbage collection pause or a sick instance slows several calls of the same page at once. Then fewer pages are affected than the formula predicts, but those pages are hit harder. Other causes, like a shared database at its limit, slow everything together. Use the formula to estimate and to explain, then measure the parent request to know."),
        h3("When the tail does not matter much"),
        bullets([
            "**A request that makes one call.** Then the call's p99 is the request's p99, and fan-out arithmetic adds nothing.",
            "**Work nobody waits for.** A nightly report or a background job cares about total throughput and completion time, not the latency of each internal call.",
            "**Calls off the critical path.** If the page renders without the recommendations and fills them in later, a slow recommendations call does not delay what the learner came for.",
        ]),

        h2("4. Check the arithmetic with a simulation"),
        p("Before you trust a formula, check it against something you can run. This simulation draws calls from a distribution like progress-service's (99% between 20 and 60 ms, the slowest 1% between 800 and 1,200 ms), builds pages from 30 calls each, and compares the percentiles. It uses the nearest-rank definition from lesson 1.2 and a fixed seed, so it prints the same numbers every time:"),
        code("python", `
import math
import random


def nearest_rank(sorted_ms, p):
    return sorted_ms[math.ceil(p / 100 * len(sorted_ms)) - 1]


rng = random.Random(7)


def call_ms():
    # one progress-service call: usually 20-60 ms, the slowest 1% take 800-1200 ms
    if rng.random() < 0.01:
        return rng.uniform(800, 1200)
    return rng.uniform(20, 60)


FAN_OUT = 30
calls = sorted(call_ms() for _ in range(100_000))
pages = sorted(max(call_ms() for _ in range(FAN_OUT)) for _ in range(20_000))

print("        one call    page (slowest of 30)")
for p in (50, 75, 95, 99):
    print(f"p{p:<4} {nearest_rank(calls, p):8.1f} ms  {nearest_rank(pages, p):8.1f} ms")
print(f"pages that waited >= 800 ms: {sum(ms >= 800 for ms in pages) / len(pages):.1%}")
print(f"predicted 1 - 0.99**30:      {1 - 0.99 ** FAN_OUT:.1%}")`, "fan_out.py"),
        code("text", `
        one call    page (slowest of 30)
p50       40.2 ms      59.5 ms
p75       50.3 ms     824.1 ms
p95       58.4 ms    1132.1 ms
p99      812.4 ms    1185.3 ms
pages that waited >= 800 ms: 26.3%
predicted 1 - 0.99**30:      26.0%`, "output"),
        p("The simulation reproduces the incident: the page's p50 moves only a little (the slowest of 30 typical calls), but its p75 jumps from 50 ms to 824 ms, and 26.3% of pages wait for a slow call, within sampling noise of the predicted 26.0%. Notice the call's p99 of 812 ms: with exactly 1% slow calls, the p99 sits right at the edge of the slow group, which is one more reason to look at p99.9 for services that are called many times per page."),

        challenge("chal_quiz_qpr_131"),

        h2("5. What to fix first"),
        p("Each fix below is cheaper and safer than the one after it. Start at the top and measure after each step."),
        numbered([
            "**Make fewer calls.** The overview request asks progress-service 24 times about one learner and one course. One batched call (`GET /progress?courseId=...`) or one query does the same work. Seven calls instead of 30 cut the share of pages that hit a slow call from 26.0% to 1 - 0.99^7 = 6.8%, and remove 23 network round trips. It also stops the fan-out from growing with the data: a 60-lesson course would otherwise make 66 calls and hit a slow one on 48.5% of loads.",
            "**Shorten the tail at its cause.** The slow 1% of progress calls come from cache refreshes. If refreshing in the background brings the slow share from 1% to 0.1%, a 30-call page is affected on 1 - 0.999^30 = 3.0% of loads. The tail of a call usually has a specific cause: a cold cache, a lock, a garbage collection pause, one bad instance. Find it in the slow traces before you design around it.",
            "**Give optional parts a deadline.** If recommendations are not back after, say, 150 ms, render the page without them and fill them in later. This only works for parts the page can live without; the learner's progress is not one of them.",
            "**Hedge, carefully.** A hedged request sends a second copy of a call to another replica when the first has not answered after about the call's p95, and uses whichever answer comes first. It cuts the tail when slowness is random and local to one replica, at the cost of a few percent extra load. Only hedge idempotent reads, cap the extra load, and remember that when the whole system is slow because it is overloaded, extra copies make it worse.",
        ]),
        callout("tip", "Simplest first",
            "Batching the per-lesson calls is the boring fix and usually the best one. Hedging is the clever fix that needs the most care. Do not reach for it while a single query could replace 24 calls."),

        h2("6. How to verify"),
        bullets([
            "**Measure the request the user waits for.** Report percentiles of the parent request (the overview span, or real user timings), not only of each backend call. A page-level target is the only one that tells you whether learners wait.",
            "**Count the fan-out from traces, not from code.** The number of child spans per request is data-dependent: it grows with the number of lessons, courses or friends. Look at its distribution (how many calls at p50 and at p99 of requests) in your traces.",
            "**Compare prediction and measurement.** Predict the share of slow pages with 1 - (1 - q)^n from the per-call slow share q, then measure it. A big gap means the slow calls are correlated, and the cause is probably shared.",
            "**Re-run the same load profile after each fix.** Compare page p75, p95 and p99 before and after under the same load, with enough samples (lesson 1.2), and check that the fix did not move load somewhere else.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Only per-service targets.** Every service is green and the page is slow. Spot it: no dashboard or SLO is defined on the request the user actually waits for.",
            "**Believing parallel calls remove the tail.** Parallelism replaces the sum by the maximum; the maximum of many calls is dominated by their tail. Spot it: in slow traces, a single child span is almost as long as the parent.",
            "**Fan-out that grows with data.** A loop that calls a service once per lesson or per item. Spot it: request latency percentiles get worse for larger courses while every call stays the same.",
            "**Hedging writes or hedging at saturation.** A duplicated `POST` can apply twice (see the HTTP course's lesson on retries), and extra copies add load exactly when the system has none to spare. Spot it: hedges enabled on non-idempotent calls, or no cap on the extra request rate.",
            "**Reading p99 as \"1% of users\".** It is 1% of calls. Spot it: a sentence like \"only 1% of learners see this\" about a service that every page calls many times.",
        ]),

        h2("8. Summary"),
        bullets([
            "A request that waits for n calls hits at least one call from the slowest 1% with probability 1 - 0.99^n: 9.6% for 10 calls, 26% for 30, 63% for 100. The per-call tail becomes the page's typical case.",
            "Targets belong on the request the user waits for. To keep a 30-call page's p99, each call needs about its p99.97, which is why large fan-outs watch p99.9 and beyond.",
            "Fix in order: fewer calls (batch), a shorter tail at its cause, deadlines for optional parts, and only then hedged requests for idempotent reads. Verify with page-level percentiles under the same load.",
        ]),

        h2("Sources"),
        bullets([
            "Jeffrey Dean and Luiz Andre Barroso, \"The Tail at Scale\", Communications of the ACM 56(2), 2013 (fan-out, hedged requests)",
            "Grafana k6 documentation: measuring page-level and request-level durations - grafana.com/docs/k6/latest/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Change fan_out.py: model the batched version (7 calls), then a slow share of 0.1% instead of 1%, and compare the page p75 and p95 for each. Then pick one page of an application you know, count its backend calls in a trace, and estimate how often it waits for a slow one."),
    ],
});
