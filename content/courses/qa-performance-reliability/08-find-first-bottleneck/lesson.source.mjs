// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-3-2",
    title: "Find the first bottleneck: a report that said 120 ms",
    slug: { _type: "slug", current: "find-the-first-bottleneck-report-said-120-ms" },
    description:
        "The weekly report said POST /api/submissions averages 120 ms. In the exam rehearsal, learners who submitted at the deadline waited up to 6 seconds, while API CPU sat at 40%. This is the course scenario: work through one evidence pack like an on-call engineer - the k6 summary, the traces, the pool and host metrics, the judge queue - form a hypothesis, check it with Little's Law, rule out the CPU, the database and the judge queue, reproduce it with a step test, choose a fix and prove it.",
    estimatedTime: 30,

    scenario: {
        role: "Performance engineer on the exam-readiness review, CodeDev learning platform",
        problem:
            "Two weeks before the national exam, CodeDev ran a rehearsal on staging: 160 submissions per second for two hours and a deadline spike of 340 per second for 80 seconds, the exam-day forecast. The weekly report summed it up as \"POST /api/submissions: average 120 ms, 0 errors\". The test learners who took part disagree: at the deadline, the Submit button spun for up to 6 seconds. The infrastructure dashboard shows API CPU at 40% during the spike. The exam-readiness review wants to know what limits submissions, at which rate, and what to change before exam day.",
    },

    content: [
        h2("1. The incident: two true statements that disagree"),
        p("This is the course scenario. Both sides of the disagreement are telling the truth, and that is what makes it hard. The weekly report quotes a real number from the rehearsal run. The learners' complaint is backed by the support channel and by the browser timings of the test accounts:"),
        code("text", `
#exam-rehearsal  11:56  linh.tran (test learner group B)
  submitted at 11:55:31, spinner until 11:55:37, then "Submission received"
#exam-rehearsal  11:56  an.nguyen
  same here, ~5 s, two people in my group clicked Submit twice

Weekly performance report, week 43
  POST /api/submissions   average 120 ms   errors 0.00%   status: OK`, "support channel and weekly report"),
        p("A 120 ms average with nothing failing sounds healthy, and API CPU at 40% suggests headroom. Before anyone proposes more pods or a bigger database, the job is to find the **first bottleneck**: the first resource where work starts to wait when the load grows. Fix anything else first and the submissions still wait in the same place."),

        h2("2. The evidence pack"),
        p("Four pieces of evidence were collected from the rehearsal. The quiz in this lesson refers to them by letter."),
        h3("A. The k6 end-of-test summary"),
        code("text", `
scenarios: exam  160 iterations/s for 2h, spike to 340 iterations/s for 80s at 1h55m

http_req_duration..: avg=120.4ms min=6.2ms med=41.3ms max=6.14s p(90)=58.9ms p(95)=74.0ms p(99)=3.64s
http_req_failed....: 0.00%  0 out of 1,166,412
http_reqs..........: 1,166,412  161.8/s
dropped_iterations.: 0`, "k6 run exam-rehearsal.js, staging, 2 API instances (summary format of recent k6 versions)"),
        h3("B. Traces of POST /api/submissions"),
        code("text", `
span                              at 160/s          deadline spike
                                  p50 / p95         p50 / p95
POST /api/submissions             41 ms / 68 ms     3.05 s / 5.83 s
  auth + validate                  2 ms /  4 ms      2 ms /  4 ms
  db.pool.acquire                  0 ms /  1 ms     3.01 s / 5.79 s
  tx: INSERT submissions           4 ms /  9 ms      5 ms / 11 ms
  tx: PUT source to storage       27 ms / 44 ms     28 ms / 46 ms
  tx: enqueue judge job            1 ms /  2 ms      1 ms /  3 ms
  tx: COMMIT                       2 ms /  4 ms      2 ms /  5 ms`, "OpenTelemetry traces, server side, grouped by span name"),
        h3("C. Metrics"),
        code("text", `
                                  at 160/s          deadline spike
submissions accepted per second   160               316
API CPU (2 instances, average)    21%               40%
DB pool per instance (max 6)      3.0 in use        6 in use all the time
requests waiting for the pool     0                 grows to 1,920
mean connection hold time         38 ms             38 ms
PostgreSQL CPU                    15%               31%`, "Grafana, staging"),
        h3("D. The judge queue"),
        code("text", `
judge queue depth      < 100 at 160/s; grows to 11,600 during the spike; < 100 again at 12:04
judge workers busy     85% at 160/s; 100% from 11:55 to 12:04
grading time           1.6 s per submission (asynchronous: the learner gets "Submission received" first)`, "judge service dashboard"),

        h2("3. Reading the evidence"),
        p("Read each piece for what it **shows**, and write one line per piece before you connect them:"),
        bullets([
            "**A** is a summary of 1.17 million requests, of which the spike and its aftermath are a small fraction. The average and p95 look healthy; the p99 of 3.64 s and the max of 6.14 s say that a few percent of the requests had a very different experience. Nothing failed, because nothing timed out: the requests waited and then succeeded.",
            "**B** shows that in the spike one span changes: db.pool.acquire, from about 0 to 5.79 s at p95. The work done once a connection is held (INSERT, PUT, enqueue, COMMIT) takes about the same time as at 160/s.",
            "**C** shows the pool full during the whole spike, a waiting line that grows to 1,920 requests, and throughput stuck at 316 per second while 340 arrive. CPU on the API and the database is moderate. The mean connection hold time is 38 ms whatever the load.",
            "**D** shows the judge falling behind too, but the judge runs after the learner has been told \"Submission received\". It delays verdicts, not acceptance.",
        ]),
        p("Already one thing is clear: the summary in A is not wrong, it is just answering a different question (\"what was the typical request over two hours?\") from the one that matters (\"what happened to the learners at the deadline?\"). Percentiles of the whole run cannot answer it either; split the run by time and compute the spike on its own."),

        h2("4. Hypothesis: a pool that is held too long"),
        p("A useful way to look at every resource in turn is the USE method: for each resource, check its **U**tilization (how busy it is), its **S**aturation (how much work is waiting for it) and its **E**rrors. Saturation is the signal that matters here, because waiting is what the learner feels. Applied to the evidence:"),
        bullets([
            "**API CPU:** utilization 40%, no run queue to speak of. Not saturated.",
            "**DB connection pool:** utilization 100% (6 of 6 per instance), saturation 1,920 waiting requests, acquire wait 5.79 s at p95. Saturated.",
            "**PostgreSQL:** CPU 31%, 12 active connections, INSERT 11 ms at p95. Not saturated.",
            "**Object storage:** the PUT takes the same time at both loads. Not saturated.",
            "**Judge workers:** utilization 100%, saturation 11,600 queued jobs, but no submit request waits for them.",
        ]),
        p("The pool is the only resource on the request path where requests wait. Little's Law (lesson 4.2) says why it filled up: the number of connections in use equals the rate of requests times the time each one holds a connection. With 2 instances x 6 = 12 connections and a hold time of 38 ms, the pool can serve at most 12 / 0.038 s = about 316 submissions per second. That is exactly the throughput in C. At 340 per second, 24 more requests arrive every second than leave; over 80 seconds that is the 1,920 waiting requests, and the last of them waits behind all the others: 1,920 / 316 = about 6 seconds."),
        p("And why is the hold time 38 ms when the INSERT takes 4 ms? Look at B again: the PUT of the source code to object storage runs **inside** the transaction, so the connection is held while the API waits for another service over the network. The database is idle for most of the time the connection is reserved for it."),
        h3("Rule out the tempting wrong explanations"),
        bullets([
            "**\"CPU is only at 40%, so the API has headroom.\"** A request waiting for a connection uses almost no CPU. CPU tells you about one resource; it cannot show waiting for another one.",
            "**\"The database is slow.\"** The INSERT is as fast in the spike as at 160/s, and PostgreSQL CPU is 31%. A bigger database instance would change nothing.",
            "**\"The judge is the bottleneck, look at the queue.\"** The judge queue is real and needs its own objective (time to verdict), but enqueueing takes 1-3 ms and acceptance does not wait for grading.",
            "**\"The load generator could not keep up.\"** dropped_iterations is 0 and the arrival-rate executor kept sending 340 per second; the waiting happened on the server, as B shows.",
        ]),

        h2("5. Reproduce it with a step test"),
        p("A hypothesis that predicts a number can be tested. If the pool is the first bottleneck, a step test should show the pool wait rising before anything else, near 316 per second in total, which is about 158 per second per instance. The team ran one: 2 minutes per step, the same request mix, warm-up excluded as in lesson 3.1."),
        code("text", `
offered/s  achieved/s  submit p95  pool wait p95  pool in use  API CPU  judge busy
   100        100.0       66 ms        0 ms          1.9/6       16%       53%
   160        160.0       68 ms        1 ms          3.0/6       21%       85%
   220        219.9       79 ms        9 ms          4.2/6       28%      100%
   280        279.3      208 ms      140 ms          5.3/6       35%      100%
   340        315.8      5.52 s      5.40 s          6.0/6       40%      100%`, "step test, staging, 2 API instances"),
        p("At 280 per second (140 per instance) the pool wait p95 is already 140 ms: requests queue for connections before the pool reaches 100% on average, because arrivals come in bursts. CPU is at 35% and still rising slowly. The judge workers look \"worse\" (85% busy at 160 per second, 100% from 220), which is exactly why ranking resources by utilization picks the wrong one."),
        callout("info", "What \"first\" means",
            "The first bottleneck is the resource that saturates at the lowest load, not the one with the highest utilization or the biggest number at the top step. At the last step of a test, everything downstream of the first bottleneck may look saturated too, or may look idle because the first bottleneck limits how much work reaches it. Read the step table from the bottom up: the lowest step where requests start to wait on a resource names it."),

        h2("6. Choose the fix"),
        p("Write down what the fix has to achieve before comparing options: accept 340 submissions per second (408 with the forecast error margin) with p95 acceptance under 2 s, without moving the problem to the database. Then test each candidate against it:"),
        bullets([
            "**Raise the acquire timeout.** Requests wait longer instead of failing; the line still grows without limit while arrivals exceed 316 per second. It changes the symptom, not the capacity.",
            "**A bigger pool (6 to 12 per instance).** Capacity doubles to about 630 per second, and PostgreSQL has room for 24 connections. A valid quick mitigation, but every connection is still reserved for 38 ms of mostly network waiting, and the next increase in load needs more connections again.",
            "**More API instances.** Each instance brings its own pool, so capacity grows too; same trade-off as a bigger pool, and more instances cost more for a resource that is not the problem.",
            "**Move the PUT out of the transaction.** Upload the source first, then open the transaction, insert the row with the object key and commit. The hold time drops from 38 ms to about 10 ms and the same 12 connections serve about 1,200 per second. This removes the cause. It needs care with failures: an upload whose transaction then fails leaves an orphan object, so a cleanup job deletes objects without a row after a day.",
        ]),
        p("The team chose the last one, with the bigger pool as the fallback if the change could not be finished in time. Now verify, starting with the evidence that would have shown the problem."),

        challenge("chal_quiz_qpr_321"),

        h2("7. The challenge: fix the bottleneck finder"),
        p("To make this analysis repeatable before every exam, the team has a script, tools/perf/bottleneck.py, that reads a step test (per step and per resource: average utilization and the wait samples of the requests) and names the first bottleneck. On the step test above it gave the wrong answer: it reported db_pool at 340 per second, the last step, and listed judge_workers as saturated. Fix it so that it follows the rule in the description: saturation is a p95 wait above the limit, never a utilization, and a resource is saturated from the lowest rate where that happens."),
        challenge("chal_coding_qpr_322"),

        h2("8. How to verify the fix"),
        bullets([
            "**The mechanism first.** In the traces, the PUT span now sits before BEGIN, and the pool metric for hold time reads about 10 ms. If the hold time did not change, the fix did not land, whatever the latency says.",
            "**The step test again.** Run the same steps, and add steps above 340 (400, 480, 560). The pool wait should stay near 0 through 408 per second; the first bottleneck has moved, and the step table tells you where.",
            "**The spike, measured on its own.** Rerun the rehearsal and compute the percentiles of the spike window alone (or tag the spike as its own k6 scenario with its own threshold, for example p(95)<2000 on the spike). The average of the whole run is not evidence: it hid the incident the first time.",
            "**Failure handling.** Kill the database connection between the upload and the INSERT in a test, and check that the cleanup job removes the orphan object.",
        ]),
        code("javascript", `
// exam-rehearsal.js (excerpt): the spike is its own scenario with its own threshold
export const options = {
  scenarios: {
    exam:  { executor: "constant-arrival-rate", rate: 160, timeUnit: "1s", duration: "2h",
             preAllocatedVUs: 400, exec: "submit" },
    spike: { executor: "constant-arrival-rate", rate: 180, timeUnit: "1s", duration: "80s",
             startTime: "1h55m", preAllocatedVUs: 2000, exec: "submit" }, // 160 + 180 = 340/s
  },
  thresholds: {
    "http_req_duration{scenario:spike}": ["p(95)<2000", "max<3000"],
    "http_req_duration{scenario:exam}":  ["p(95)<2000"],
  },
};`, "exam-rehearsal.js (check the scenarios docs of your k6 version)"),

        h2("9. Common mistakes when hunting a bottleneck"),
        bullets([
            "**Trusting the average of a long run.** A short severe incident disappears into hours of calm traffic. Spot it: a p99 or max far above the average; then split the run by time.",
            "**Ranking resources by utilization.** A judge pool built to stay busy, or a cache at 95%, can be fully utilized without making anyone wait. Spot it: ask \"who waits for this resource, and for how long?\" and look at wait time or queue length.",
            "**Reading the top step.** At the highest load, everything looks bad. Spot it: find the lowest step where a resource's wait crosses the limit.",
            "**Fixing a downstream resource.** A bigger database with the same pool and the same hold time gives the same 316 per second. Spot it: the proposed fix does not change the number Little's Law gives for the first bottleneck.",
            "**Raising timeouts or retries.** They turn waits into longer waits and retries into more arrivals. Spot it: throughput at the top step does not change after the \"fix\".",
        ]),

        h2("10. Summary"),
        numbered([
            "The first bottleneck is the resource where requests start to wait at the lowest load. Find it from saturation (waits, queue lengths) per resource, not from averages, utilization or CPU.",
            "Check the hypothesis with numbers: Little's Law turns pool size and hold time into a maximum throughput, and a step test should show the wait rising near that rate.",
            "A fix must change the limiting number (here the hold time), and the proof is the mechanism metric plus the user-visible percentile of the period that hurt, never the whole-run average.",
        ]),

        h2("Sources"),
        bullets([
            "Brendan Gregg, \"The USE Method\" - brendangregg.com/usemethod.html",
            "Marc Brooker, \"Little's Law\" - brooker.co.za/blog/2018/06/20/littles-law.html",
            "Grafana k6 documentation: scenarios, arrival-rate executors, thresholds on tagged sub-metrics - grafana.com/docs/k6/latest/",
        ]),
        callout("tip", "Self-practice (not graded): write the incident report",
            "Write the report for the exam-readiness review in at most fifteen lines: what learners saw (with the times from the support channel), why the weekly report said 120 ms, the impact (how many submissions waited more than 2 s, from the spike window), the first bottleneck and the rate where it appears, the root cause in one sentence, the evidence that rules out CPU, the database and the judge, the fix with its trade-off (orphan objects), how it will be verified, and two follow-ups - for example a spike-only threshold in the rehearsal and an objective for time to verdict. Point every claim at one piece of evidence, A to D, or at the step test."),
    ],
});
