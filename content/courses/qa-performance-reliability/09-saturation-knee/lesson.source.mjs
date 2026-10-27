// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-3-3",
    title: "Find the saturation knee",
    slug: { _type: "slug", current: "find-the-saturation-knee" },
    description:
        "A capacity draft for exam day divides 340 submissions per second by the 158 per second that one API instance managed in a step test, and asks for three instances. But at 158 per second learners already wait seconds. Learn why throughput flattens and latency bends upward as a resource fills, why the knee comes well before the ceiling, how to run a step test that can show a knee (open model, step length, warm-up per step), and how to read the knee from throughput, latency and errors with a rule that everyone applies the same way.",
    estimatedTime: 25,

    scenario: {
        role: "QA / performance engineer preparing the exam-day capacity plan, CodeDev learning platform",
        problem:
            "The capacity draft for the national exam says: \"One API instance handles 158 submissions/s (step test, max achieved throughput). Forecast 340/s -> 340 / 158 = 2.2 -> 3 instances.\" The step test it cites is attached. You are asked to sign off on the number of instances, and the step table shows p95 above 3 seconds at the rate the draft calls the capacity.",
    },

    content: [
        h2("1. The incident: capacity read from the wrong column"),
        p("After the deadline incident of lesson 3.2, the team ran a step load test on a single API instance, so that capacity could be planned per instance. The instance has a pool of 6 database connections, and each submission holds a connection for 38 ms on average. Here is the result table and the line from the capacity draft that used it:"),
        code("text", `
offered/s  achieved/s  p95       errors
   100       100.0      66 ms    0.00%
   110       110.0      70 ms    0.00%
   120       119.9      79 ms    0.00%
   130       129.9     104 ms    0.00%
   140       139.8     205 ms    0.00%
   150       149.1     820 ms    0.00%
   160       157.2     3.9 s     0.00%
   170       157.9     8.4 s     0.20%
   180       158.1    12.1 s     2.60%

Capacity draft: "1 instance = 158 submissions/s (max achieved). 340 / 158 -> 3 instances."`, "step test, POST /api/submissions, 1 API instance, 2 minutes per step, warm-up excluded"),
        p("158 per second is a true number: it is the most this instance ever completed. It is also the rate at which every learner waits several seconds. Three instances could complete 474 per second in total, but at 340 per second each of them would be at 113 per second, and at the forecast plus 20% (408 per second, 136 per instance) they would sit right where latency starts to climb. The draft confused the **ceiling** with the **knee**."),

        h2("2. Read the table: three signals, three different moments"),
        p("Read each column from the top and note the first row where it changes its behaviour:"),
        bullets([
            "**Latency** moves first. p95 is flat around 66-79 ms up to 120/s, rises to 104 ms at 130/s, doubles to 205 ms at 140/s, and from there grows by multiples per step.",
            "**Throughput** moves later. Achieved follows offered up to 150/s (149.1), then flattens at about 158/s and stays there whatever is offered.",
            "**Errors** move last. They appear only at 170/s, when waits are long enough for client timeouts to fire.",
        ]),
        p("So the same table gives three different \"capacities\" depending on the column you read: about 130 by latency, about 158 by throughput, about 160-170 by errors. Only the first describes a rate at which learners get the service they got at low load."),

        h2("3. Why there is a knee"),
        p("Every resource on the request path has a maximum rate it can serve. For the pool, Little's Law (lesson 4.2) gives it: 6 connections / 0.038 s = about 158 submissions per second. That is the ceiling in the table. The knee comes earlier because of **queueing**:"),
        bullets([
            "**Arrivals are not evenly spaced.** At 130 per second, submissions do not come exactly every 7.7 ms; some milliseconds bring three at once. When all 6 connections are busy for a moment, the next request waits, even though the average utilization is only about 130 / 158 = 82%.",
            "**Waiting grows faster than load.** In the simplest queueing models, the mean wait grows with utilization u roughly as u / (1 - u): at 50% it is 1 service time, at 80% 4, at 90% 9, at 95% 19. The step from 120 to 130 per second costs little; the step from 140 to 150 costs a lot.",
            "**Above the ceiling, the queue has no steady state.** At 160 per second, about 2 more requests arrive per second than leave. For the whole 2-minute step the line grows, and so does every wait. The p95 of such a step depends on how long the step lasted, not on the system.",
        ]),
        p("Some systems do worse than flatten. When more concurrent work causes contention and coordination (locks, cache-line sharing, retries, garbage collection under memory pressure), throughput can **fall** past its peak. The Universal Scalability Law models this. If your step table shows achieved throughput dropping at the highest steps, the system is spending capacity on overhead, and running near the ceiling is even more dangerous."),
        callout("info", "When a step test cannot show a knee",
            "A knee only shows up when the load generator keeps offering the planned rate whatever the response times: an open model, such as k6's constant-arrival-rate or ramping-arrival-rate executors, or wrk2 with a fixed rate (-R). A closed model - a fixed number of virtual users that each wait for a response before sending the next request - slows its own arrivals when the server slows down. Its achieved rate then always looks like its offered rate, and latency rises only modestly. That is coordinated omission again (lesson 2.3): the test hides the queue that real learners, who do not wait for each other, would form."),

        challenge("chal_quiz_qpr_331"),

        h2("4. Run a step test that can show the knee"),
        p("The table is only as good as the test behind it. A step test for a knee needs:"),
        numbered([
            "**An open-model executor with fixed rates per step**, and enough pre-allocated virtual users that the generator never runs out (in k6, watch dropped_iterations; any non-zero value means the generator, not the server, capped the rate).",
            "**Steps long enough to reach a steady state**, typically 2 to 5 minutes, and finer steps around the expected knee. A 20-second step at 150 per second might end before its queue becomes visible.",
            "**Warm-up excluded per step.** The queue of a saturated step spills into the next one. Drop the first window of each step from its statistics (lesson 3.1), or pause between steps.",
            "**One resource configuration, written down.** Instances, pool sizes, database size and data volume decide where the knee is. A knee measured with a pool of 6 does not hold for a pool of 10.",
            "**A generator that is not the bottleneck.** Check its CPU and network; a generator at 100% CPU adds its own latency to every sample.",
        ]),
        code("javascript", `
// step-submit.js - k6 step test, 2-minute steps from 100 to 180 submissions/s
// (check the ramping-arrival-rate docs of your k6 version: a 0s stage jumps to the new rate)
const rates = [100, 110, 120, 130, 140, 150, 160, 170, 180];

export const options = {
  scenarios: {
    steps: {
      executor: "ramping-arrival-rate",
      startRate: rates[0], timeUnit: "1s",
      preAllocatedVUs: 500, maxVUs: 3000,
      stages: rates.flatMap((rate) => [
        { target: rate, duration: "0s" },
        { target: rate, duration: "2m" },
      ]),
      exec: "submit",
    },
  },
};`, "step-submit.js"),
        h3("Worked example: from raw samples to the step table"),
        p("Build the table yourself from the raw samples instead of reading k6's whole-run summary, so that each step has its own achieved rate, its own p95 (nearest-rank) and its own error rate, with the first 30 seconds of each step dropped:"),
        code("python", `
import math

STEP_S = 120      # seconds per step
SKIP_S = 30       # dropped at the start of every step (warm-up of the step)

def percentile(values, p):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(math.ceil(p * len(ordered) / 100), 1) - 1]

def step_table(samples, rates):
    """samples: (sent_at_s, latency_ms, ok) per request, sent_at_s from the start of the test."""
    rows = []
    for i, rate in enumerate(rates):
        start, end = i * STEP_S + SKIP_S, (i + 1) * STEP_S
        step = [s for s in samples if start <= s[0] < end]
        rows.append({
            "offered_rps": rate,
            "achieved_rps": round(len(step) / (end - start), 1),
            "p95_ms": percentile([ms for _, ms, _ in step], 95),
            "requests": len(step),
            "errors": sum(1 for _, _, ok in step if not ok),
        })
    return rows`, "step_table.py"),
        p("The achieved rate here counts requests by the time they were **sent**, which is right for an open model where sending does not wait for responses. If you count by completion time instead, a step past the ceiling shows the server's completion rate, which is the flat 158 per second in the table above. Decide which one you report and say so in the table header."),

        h2("5. A rule for the knee"),
        p("\"Where the curve bends\" is a matter of taste unless it is written down. A rule that teams can apply the same way:"),
        bullets([
            "**Baseline:** the p95 of the lowest step, where nothing queues.",
            "**A step is past the knee** when it breaks any of three limits: achieved below 95% of offered (it no longer keeps up), p95 above twice the baseline (latency left the low-load level), or errors above 1%.",
            "**The knee** is the step just before the first step that breaks a limit. A later step that happens to look better does not move it back: noise at one step does not undo saturation at a lower one.",
            "**No step broke a limit?** Then the knee was not reached: the honest result is \"above 180 per second, not measured\", and the next test needs higher steps.",
        ]),
        p("Applied to the table: the baseline is 66 ms, the latency limit 132 ms. 130 per second (104 ms) passes, 140 per second (205 ms) breaks it, so the knee is 130 per second per instance. That matches what the step test of lesson 3.2 showed for two instances at 280 per second: the pool wait was already over its limit at 140 per instance."),
        p("The thresholds are a choice. Twice the baseline suits a submit endpoint whose objective is far above its low-load latency; an endpoint with a tight objective may need 1.5 times. Use the same thresholds for every run you compare, and keep the knee separate from the objective: the objective (p95 of acceptance under 2 s) says what learners need, the knee says where the system stops behaving like an idle one. Capacity is planned so that the expected peak stays below the knee, with headroom for the forecast error - which is what module 5 does with these numbers."),

        h2("6. The challenge: find the knee in a step table"),
        p("The challenge gives you step tables like the one above, as JSON rows with the offered rate, achieved rate, p95, requests and errors. Implement the rule exactly as the description states it, including the cases real tables contain: rows out of order, rows that are not valid measurements, a step that recovers after a bad one, a table whose lowest step already fails, and a table that never reaches its knee."),
        challenge("chal_coding_qpr_332"),

        h2("7. How to verify a knee"),
        bullets([
            "**Repeat the step test.** The knee should land on the same step, or one step apart. If two runs disagree by several steps, the steps are too short or the environment is noisy.",
            "**Refine around it.** Run steps of 5 per second between the last healthy and the first saturated step (130 to 140 here) to narrow it down before it goes into a plan.",
            "**Soak at the knee.** Run 30 minutes at the knee rate. p95 should stay flat. If it creeps up, the knee is lower than the step test showed: something accumulates (a queue, memory, a growing table).",
            "**Name the resource.** At the first saturated step, one resource should show the wait (lesson 3.2). If none does, suspect the load generator, the network or the measurement.",
            "**Check the generator.** dropped_iterations at 0, generator CPU well below 100%, and the offered rate actually reached in each step.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Capacity = maximum achieved throughput.** That is the ceiling, where waits are already seconds. Spot it: look up the p95 at the rate the plan calls capacity.",
            "**A closed-model step test.** Virtual users that wait for responses hide the queue. Spot it: achieved equals offered at every step while latency rises only a little, or the test is configured in users instead of a rate.",
            "**Reading only one signal.** Throughput moves last, errors may never move if timeouts are long, and latency alone misses a server that sheds load with fast errors. Spot it: the rule uses one column of the table.",
            "**Steps too short or with no warm-up exclusion.** The queue of one step spills into the next and the knee moves around between runs. Spot it: p95 rising within a single step, or knees that differ between repeats.",
            "**Taking the knee from another configuration.** More connections, another instance size or ten times the data moves it. Spot it: the step test report does not state pool size, instance size and data volume.",
        ]),

        h2("9. Summary"),
        numbered([
            "Throughput flattens at the ceiling of the first bottleneck, but latency bends up well before it, because bursts queue long before average utilization reaches 100%: the knee is below the ceiling.",
            "Only an open-model step test with long enough steps, warm-up excluded per step and a generator that keeps up can show the knee; a closed model hides it.",
            "Read the knee with a written rule on all three signals - throughput ratio, p95 against the low-load baseline, error rate - and plan capacity below the knee, not at the maximum throughput.",
        ]),

        h2("Sources"),
        bullets([
            "Grafana k6 documentation: open and closed models, ramping-arrival-rate executor, dropped_iterations - grafana.com/docs/k6/latest/",
            "wrk2: a constant-throughput HTTP load generator and coordinated omission - github.com/giltene/wrk2",
            "Marc Brooker, \"Little's Law\" - brooker.co.za/blog/2018/06/20/littles-law.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Rewrite the capacity draft from section 1 in five lines: the knee per instance and how it was found, the ceiling and why it is not the capacity, the configuration the numbers hold for (pool size, hold time, instance size), what changes the knee (for example the hold time fix from lesson 3.2), and the follow-up tests you would run before signing off (repeat, finer steps, soak at the knee)."),
    ],
});
