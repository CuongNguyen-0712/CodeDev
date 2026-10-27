// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-qpr-5-3",
    title: "A capacity plan you can defend",
    slug: { _type: "slug", current: "capacity-plan-you-can-defend" },
    description:
        "The last capacity plan divided 340 requests per second by 40% CPU and promised 850; the submit endpoint fell over at 340. Write the exam-day plan again with evidence behind every number: a forecast of 340 submissions/s from the last exam, a margin for forecast error taken from past forecasts, per-instance capacity from the knee of a step test, Little's Law for connection pools and grader sandboxes, headroom with a stated reason for each margin, N+1, an admission limit, and a validation run at the design load with one unit removed.",
    estimatedTime: 25,

    scenario: {
        role: "QA engineer owning performance tests, CodeDev learning platform",
        problem:
            "Two weeks before the exam on 2026-11-12, the product lead asks the question this course started with: \"Will it hold on exam day, how many machines do we need, and how sure are you?\" The capacity plan from the spring exam is still on the wiki. It says \"load test at 340 req/s: API CPU 40%, so the current fleet handles 850 req/s (2.5x headroom)\". That plan was signed, and at 340 requests per second the submit endpoint fell over while CPU sat at 40% (lesson 3.2). The new plan has to answer the same question with numbers that each point to a measurement someone can rerun.",
    },

    content: [
        h2("1. The incident: 340 divided by 40%"),
        p("This is the core of the spring plan. It is short, it looks quantitative, and every line of it is an assumption:"),
        code("text", `
Capacity plan - spring exam (approved)
  load test:        340 req/s POST /api/submissions, 4 API instances
  API CPU:          40% average
  capacity:         340 / 0.40 = 850 req/s
  headroom:         850 / 340 = 2.5x  -> no changes needed
  grader:           "scales automatically"`, "capacity-plan-spring.txt"),
        p("The division assumes CPU is the resource that runs out first and that latency stays flat until CPU reaches 100%. Neither was true. The first bottleneck was a connection pool (lesson 3.2): requests queued for a connection while CPU waited with them. The capacity of a system is the highest load at which it still meets its objective, and that number comes from a load test that finds the knee (lesson 3.3), not from extrapolating one resource. The grader line has no number at all."),
        p("A plan you can defend has the opposite shape: few numbers, each with its evidence and a way to recheck it, and an explicit reason for every margin on top."),

        h2("2. Read the evidence you already have"),
        p("Most of the inputs exist already from earlier lessons and from the last exam. Collect them first, with their source, before computing anything:"),
        code("text", `
demand
  last exam (spring): peak 262 submissions/s with 3,700 learners sitting
  this exam: 4,800 learners enrolled                 -> 262 x 4,800 / 3,700 = 340/s
  past forecasts: actual peak beat the forecast by 9% and by 17%

API instance (step test, lesson 3.3, steady state per step, pool fixed)
  per instance  100/s  110/s  120/s  130/s  140/s  150/s
  SLI (>=99.5%) 99.9%  99.9%  99.8%  99.7%  99.1%  96.4%
  load balancer: busiest instance received up to 10% above the mean

traces at 340/s (steady state)
  submit holds a DB connection for 38 ms on average
  grading takes 1.6 s on average per submission (sandbox time)

grader node: 24 sandboxes; grading queue wait grows sharply above ~80% busy`, "evidence.txt"),
        p("Two things to notice. The SLI per instance still meets the 99.5% objective at 130/s and breaks between 140/s and 150/s: the measured capacity per instance is 130/s, with the knee just above. And the forecast is not a guess: it scales the last peak by the number of learners, and the history of past forecasts says how wrong such a forecast tends to be."),

        h2("3. The core idea: demand, capacity per unit, and margins with reasons"),
        h3("Demand: a forecast plus its own error"),
        p("The forecast peak is 340 submissions/s. The last two forecasts were beaten by 9% and 17%, so the plan adds 20% for forecast error: the **design load** is 340 x 1.2 = 408 submissions/s. That is a margin with a reason. \"Double it to be safe\" is a margin without one: it costs twice the machines and still cannot say whether it is enough."),
        h3("Capacity per unit: measured at the objective"),
        p("A unit is whatever you add more of: an API instance, a grader node, a pool connection. Its capacity is the highest load where the step test still met the objective, here 130/s per API instance. Plan below that, for stated reasons:"),
        bullets([
            "**Load balancing is uneven.** The busiest instance got up to 10% above the mean in the test.",
            "**Runs vary.** The same step measured on different days differs (lesson 4.1); a plan that needs the best run to hold is fragile.",
            "**Staging is not production.** The test is a ceiling for production (lesson 5.1).",
        ]),
        p("CodeDev plans at **100/s per API instance**: with the 10% skew the busiest instance sees 110/s, still 20/s under the measured 130/s."),
        h3("Little's Law for pools and workers"),
        p("For anything that holds a slot while it works, Little's Law (lesson 4.2) gives the average number of busy slots: **L = lambda x W**, arrival rate times time held."),
        bullets([
            "**Database connections.** 408/s x 0.038 s = 15.5 connections busy on average across the fleet. Spread over the instances that remain after one fails (5 of 6), about 3.1 per instance against a pool of 10. Little's Law gives the mean, not the bursts, so the evidence that the pool is big enough is the pool wait time in the validation run, not this division alone.",
            "**Grader sandboxes.** 408/s x 1.6 s = 652.8 sandboxes busy on average. At most 80% busy (above it the queue wait grows sharply) means 652.8 / 0.8 = 816 sandboxes, which is 34 nodes of 24.",
            "**The pools multiply.** 6 instances x 10 connections = 60 connections that the pooler and PostgreSQL must accept. Check that number against their limits; a plan that adds API instances can break the database it never mentions.",
        ]),
        h3("Why a utilisation cap and not 100%"),
        p("Near saturation, waiting time grows much faster than load. In the simplest queueing model (one server, random arrivals) the average wait in the queue is `rho / (1 - rho)` service times at utilisation `rho`: 4 service times at 80%, 9 at 90%, 19 at 95%. Real systems differ in the exact curve, which is why the cap comes from the knee you measured, but the shape is the reason no plan runs a queue near 100%."),
        h3("Failure tolerance and an admission limit"),
        bullets([
            "**N+1.** The fleet must hold the design load with one unit gone, because a node will fail or be redeployed during the busiest hour some day. 408/s needs 5 API instances at 100/s; the plan has **6**. One grader node lost leaves 33 x 24 = 792 sandboxes, 82% busy: inside the knee, so 34 nodes already cover it.",
            "**An admission limit above the plan, below the proven capacity.** Beyond the plan, the platform should refuse quickly (`503` with `Retry-After`) instead of collapsing for everyone. The limit is **480/s** with a short burst allowance: above the design load of 408/s, and below the 500/s that 5 surviving instances carry at the planning limit. Lesson 5.1 showed what a limit at 350/s did at a 340/s peak.",
        ]),
        callout("warning", "Do not stack margins blindly",
            "Every margin above covers a different risk: forecast error, uneven balancing, run-to-run noise, a failed unit, queueing near saturation. Multiplying five \"safety factors\" of 1.5 gives 7.6 times the machines and hides which risk each one covers. List each margin with the risk it covers and the evidence for its size; if two cover the same risk, keep one."),
        h3("When not to plan this precisely"),
        bullets([
            "**When the traffic is small.** A service at 5 requests/s on two instances needs N+1 and a sanity check, not Little's Law for every pool.",
            "**As a substitute for autoscaling evidence.** If the fleet scales automatically, the plan still needs the scale-up time (a grader node that takes 4 minutes to start cannot absorb a burst that lasts 2) and the limits that do not scale, such as database connections.",
            "**From a single run.** One step test is a starting point. A plan that will be signed needs the numbers reproduced, or at least the noise between runs known (lesson 4.1).",
        ]),

        h2("4. Worked example: the plan as code, with its evidence"),
        p("Keep the arithmetic in a script so the plan is recomputed, not retyped, when a measurement changes. Every input is a measured number with a comment saying where it came from:"),
        code("python", `
import math


def ceil_up(x):
    # round first: float results land a hair off whole numbers (408 * 1.6 is
    # 652.8000000000001), and ceil() of 34.000000001 would buy a 35th node
    return math.ceil(round(x, 6))


def capacity_plan(e):
    design_rps = round(e["forecast_peak_rps"] * (1 + e["forecast_error"]))
    api = ceil_up(design_rps / e["api_rps_per_instance"]) + 1          # N + 1
    per_instance_after_loss = design_rps / (api - 1) * (1 + e["lb_skew"])
    busy_conns = design_rps * e["db_hold_s"] / (api - 1)               # Little's Law, per instance
    busy_sandboxes = design_rps * e["grading_s"]                       # Little's Law, whole fleet
    nodes = ceil_up(busy_sandboxes / e["sandbox_util_max"] / e["sandboxes_per_node"])
    return {
        "design_rps": design_rps,
        "api_instances": api,
        "busiest_instance_rps_after_loss": round(per_instance_after_loss, 1),
        "busy_db_conns_per_instance": round(busy_conns, 1),
        "db_conns_total": api * e["pool_per_instance"],
        "busy_sandboxes": round(busy_sandboxes, 1),
        "grader_nodes": nodes,
        "sandbox_util_one_node_lost": round(busy_sandboxes / ((nodes - 1) * e["sandboxes_per_node"]), 3),
    }


evidence = {
    "forecast_peak_rps": 340,       # last exam 262/s with 3,700 learners; 4,800 enrolled now
    "forecast_error": 0.20,         # last two exams beat their forecast by 9% and 17%
    "api_rps_per_instance": 100,    # step test: SLI held to 130/s per instance, broke at 150/s
    "lb_skew": 0.10,                # busiest instance got 10% above the mean in the test
    "db_hold_s": 0.038,             # mean connection hold time of a submit, from traces
    "pool_per_instance": 10,
    "grading_s": 1.6,               # mean grading time in the steady state at 340/s
    "sandboxes_per_node": 24,
    "sandbox_util_max": 0.80,       # queue wait grows fast above this, see the knee test
}
plan = capacity_plan(evidence)
for k, v in plan.items():
    print(f"{k:34} {v}")
assert plan["api_instances"] == 6 and plan["grader_nodes"] == 34`, "capacity_plan.py"),
        code("text", `
design_rps                         408
api_instances                      6
busiest_instance_rps_after_loss    89.8
busy_db_conns_per_instance         3.1
db_conns_total                     60
busy_sandboxes                     652.8
grader_nodes                       34
sandbox_util_one_node_lost         0.824`, "output"),
        p("The plan that goes to the product lead is the same numbers as a table, one row per decision, each with its evidence and the way to check it again:"),
        code("text", `
number               value      evidence                                     recheck
design load          408/s      forecast 340/s (262/s x 4,800/3,700)         actual peak after the exam
                                + 20% (past forecasts off by 9%, 17%)
API instances        6          100/s per instance; step test held 130/s,    step test per instance
                                broke at 150/s; 10% balancing skew; N+1      before each exam
DB connections       10 x 6     15.5 busy on average (408 x 0.038 s);        pool wait p95 in the
                                pooler and PostgreSQL accept 60 + admin      validation run
grader nodes         34 x 24    652.8 busy (408 x 1.6 s) at <= 80%;          queue wait at design load
                                82% with one node lost                       with one node removed
admission limit      480/s      > 408 design, < 500 = 5 x 100 after a loss   rejected share in the run`, "capacity-plan-exam-2026-11-12.txt"),

        challenge("chal_quiz_qpr_531"),

        h2("5. How to verify the plan"),
        bullets([
            "**Run the design load on the planned topology, minus one.** A constant-arrival-rate test at 408/s (lesson 5.1's script with `RATE=408`) with one API instance and one grader node stopped, as a chaos experiment with abort conditions (lesson 5.2). Pass means the submit SLI meets the exam objective in the steady state, pool wait p95 stays small, and the grading queue drains within minutes after the peak.",
            "**Push past the plan once.** A short step to 480/s and then 520/s shows the admission limit working: above 480/s the extra requests get fast `503` responses with `Retry-After`, and the SLI of the admitted requests holds. A collapse instead of a clean rejection is a finding.",
            "**Watch leading indicators on the day.** Pool wait time, grading queue depth and the share of limiter rejections move minutes before the SLI does. Agree on the triggers in advance, for example: grading queue above 2,000 jobs for 2 minutes, add 4 grader nodes (they take about 4 minutes to start).",
            "**Close the loop after the exam.** Compare the real peak with the forecast and the real per-instance load with the plan. The next plan's forecast error margin comes from this comparison.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Capacity from one resource's utilisation.** \"CPU 40%, so 2.5x headroom\". Spot it: the plan contains a division by a utilisation; replace it with the knee of a step test at the objective.",
            "**A forecast without its error.** The plan sizes for exactly 340/s. Spot it: no margin is linked to how wrong past forecasts were.",
            "**Margins without reasons.** \"x2 to be safe\", sometimes several times. Spot it: a factor in the plan cannot be traced to a risk and a measurement.",
            "**Sizing only what you can see.** Six API instances that each open 50 connections to a database that accepts 200. Spot it: the plan never mentions the shared resources behind the units it adds.",
            "**No failure case.** The fleet fits the design load only when every unit is up. Spot it: the validation run used the full topology; rerun it with one unit removed.",
        ]),

        h2("7. Summary"),
        numbered([
            "Capacity is the highest load at which the objective still holds, measured with a step test, not one resource's utilisation divided into the load: CPU at 40% said nothing about the pool that failed first.",
            "Plan from evidence: design load = forecast plus its measured error (340 to 408/s), units at a planning limit below the measured knee (100 of 130/s per instance), Little's Law for pools and sandboxes, a utilisation cap, N+1 and an admission limit, each margin with the risk it covers.",
            "Verify the plan with a load test at the design load with one unit removed, watch leading indicators with agreed triggers on the day, and compare forecast with reality afterwards so the next plan's margins come from data.",
        ]),

        h2("Sources"),
        bullets([
            "Marc Brooker, \"Telling Stories About Little's Law\" - brooker.co.za/blog/2018/06/20/littles-law.html",
            "Grafana k6 documentation: constant-arrival-rate and ramping-arrival-rate executors - grafana.com/docs/k6/latest/",
            "wrk2 README: measuring latency at a constant throughput - github.com/giltene/wrk2",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the exam-day capacity plan for GET /api/leaderboard, whose objective is p95 300 ms. Estimate its peak from the submit forecast (each submit makes the result page refresh the leaderboard once, and learners also reload it), measure or assume a per-instance knee and a cache hit ratio, use Little's Law for the database connections the cache misses need, and add N+1. Put every number in a table with its evidence and its recheck, as in section 4. Then list which numbers are assumptions rather than measurements, and the load test that would replace each one."),
    ],
});
