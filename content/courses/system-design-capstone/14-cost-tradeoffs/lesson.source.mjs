// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-sdc-5-2",
    title: "Cost trade-offs: what each component costs",
    slug: { _type: "slug", current: "cost-tradeoffs-what-each-component-costs" },
    description:
        "The October cloud bill for CodeDev was $47,569 against a $5,000 budget, and 96% of it was grader workers sized for an exam peak that lasts minutes. Learn to build a monthly cost sheet from units and unit prices, see which line each kind of growth moves, compare managed and self-hosted on total cost instead of the invoice, price a nine of availability before you buy it, and recognise when a simpler design meets the requirements for a fraction of the cost.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer who owns the CodeDev infrastructure budget",
        problem:
            "After the October exam, grading results were 25 minutes late, and the fix that went out the same night was to set the grader deployment's minimum replicas to 1,530, the number of slots needed to grade the 340 submissions/s exam peak with no backlog at all. Nobody set it back. Finance now forwards the October bill: $47,569 for a platform budgeted at $5,000 a month. In the same week, an engineer proposes moving to an active-active second region \"to reach 99.99%\" for about $3,000 more per month. The team lead asks for one page: what each component costs, what is worth paying for, and what is not.",
    },

    content: [
        h2("1. The incident: a fix that cost $45,000 a month"),
        p("The bill, grouped by component (the platform's cloud account tags every resource with its component):"),
        code("text", `
CodeDev production, October 2026          USD
api (3 x 2 vCPU) + load balancer            205
postgresql (HA, 500 GB, backups)          1,000
redis (cache + leaderboard, 2 nodes)        220
submission queue (requests)                   9
grader workers (1,530 x 1 vCPU)          45,900
certificate worker                           15
logs + traces (400 GB ingested)             200
object storage + email                       20
-----------------------------------------------
total                                    47,569`, "billing export, by component tag"),
        p("Two things stand out. One line is 96% of the bill. And it is the line for a workload whose peak lasts minutes on a handful of days a month: the graders were sized for the worst minute and then paid for every minute. The October fix solved a real problem (late grades) with the most expensive possible tool. This lesson is about seeing that before the bill does."),
        callout("info", "About the prices in this lesson",
            "The unit prices below are round planning numbers chosen for the exercise, not a quote from any provider: 1 vCPU-month of container compute = $30, managed queue = $0.40 per million requests, log ingestion = $0.50 per GB, one engineer-hour = $50 fully loaded. Replace them with your provider's pricing calculator and your own salaries. The method does not change; the conclusions usually do not either, because they come from ratios of 10x to 100x, not from the third digit."),

        h2("2. Read the evidence: cost = units x unit price"),
        p("Every line of a cloud bill is a count of something times a price. Write the count down with its source, the same way lesson 2 wrote down capacity estimates, and the bill becomes predictable:"),
        code("text", `
line              units (how we got them)                                     price            monthly
api               6 vCPU: 3 instances x 2 vCPU, sized for p95 300 ms reads     $30/vCPU          $180
                  + 1 load balancer                                                              $25
postgresql        primary + standby, 4 vCPU / 16 GB each; 500 GB; backups       (managed plan)  $1,000
redis             primary + replica, 6 GB                                       (managed plan)    $220
queue             100k submissions/day x 3 requests x 30 days = 9M; + polling   $0.40 / 1M        $9
graders           slots x 1 vCPU each (see section 3)                           $30/vCPU          ???
certificates      0.5 vCPU                                                      $30/vCPU          $15
logs + traces     400 GB/month at 10% trace sampling                            $0.50/GB          $200
storage + email   ~1 GB of PDFs, ~150k emails                                   (plans)            $20`, "cost-sheet.txt"),
        p("The 100,000 submissions a day is an assumption for this sheet: 20,000 daily active learners making about 5 submissions each. The useful habit is that every number has a reason next to it, so when an input changes (more learners, more submissions per learner, a slower grader) you know which line moves and by how much."),

        h2("3. Size the expensive line for the real load shape"),
        p("Graders are the one component whose cost follows the peak. By Little's law, busy slots = arrival rate x time per job. With grading at 1 to 8 s (take 4.5 s on average):"),
        code("text", `
load                               arrivals     busy slots (x 4.5 s)
average day                        1.2 /s          ~5
busiest hour of a normal day       6 /s            ~27
exam peak (first minutes)          340 /s          ~1,530`, "grader-load.txt"),
        p("The exam peak is about 300 times the average. Paying for it all month is what the October fix did. Three alternatives, priced with the same unit price ($30 per slot-month, about $0.041 per slot-hour):"),
        numbered([
            "**Peak capacity always on**: 1,530 slots = **$45,900/month**. No backlog ever, and 99.7% of it idle on a normal day.",
            "**Baseline plus scheduled scaling for exam windows**: 40 slots always on ($1,200) and 400 slots during 4 exam windows of 3 hours a month (360 extra slots x 12 h = 4,320 slot-hours, about $180) = **about $1,380/month**. Exam times are known in advance, so the scale-up starts 15 minutes before the exam instead of reacting after the queue has grown.",
            "**The same, with 800 slots in the window**: about $200 more per month.",
        ]),
        p("What does option 2 cost the learners? 400 slots grade about 89 jobs/s. If the 340/s peak lasts 3 minutes, about 61,000 submissions arrive and 16,000 are graded, so a backlog of about 45,000 builds up. The last submission of the peak waits roughly 45,000 / 89 = 8.5 minutes for its grade. Acceptance still meets the 2 s target, because the bounded queue from lesson 8 takes the burst (it must have room for it). With 800 slots the worst wait drops below 3 minutes."),
        p("Now the decision is a product question with prices on it: \"exam grades within 10 minutes\" costs about $1,400 a month, \"within 3 minutes\" about $1,600, \"instantly, always\" $45,900. Before choosing, check the next bottleneck: 800 slots writing results means about 180 result writes per second to PostgreSQL, well within what the primary handles, but write the check down."),
        callout("warning", "Autoscaling is not free capacity",
            "Reactive autoscaling starts new grader pods after the queue has grown, and pods take time to schedule and start. For a peak that arrives in the first minute of an exam, scale on the schedule, keep reactive scaling as the backup for unplanned load, and set a maximum so a bug or an attack cannot scale the bill without limit. Lesson 7's per-user rate limits are a cost control too."),

        h2("4. What scaling each component costs"),
        p("Components do not get more expensive in the same way. Knowing the shape of each cost curve tells you where growth will hurt first:"),
        bullets([
            "**API (stateless)**: linear and cheap. Twice the traffic, roughly twice the instances; adding one takes minutes. Rarely the line to worry about.",
            "**PostgreSQL**: a step function. A bigger instance roughly doubles the price per step; a read replica adds a full instance; scaling writes beyond one primary (partitioning, sharding) costs engineering months, not dollars. That is why the design keeps hot reads in the cache and the leaderboard in Redis: they protect the most expensive thing to scale.",
            "**Redis**: priced by memory. The leaderboard for 200,000 learners is tens of megabytes; it will not drive the bill. Cache memory grows with what you choose to cache, so measure the hit rate before buying more.",
            "**Queue**: per request, and tiny at this scale: 9 million requests is about $4. It is never where the money is.",
            "**Graders**: linear in slots and driven by the peak. The line to engineer.",
            "**Observability**: grows with traffic times verbosity. Debug logs left on, or traces at 100% sampling, can rival the API line. Sample traces, keep error traces, and set retention per signal (Observability with OpenTelemetry covers sampling).",
            "**Third-party services**: payments are a percentage of each sale set by the provider contract, email is per message. They scale with revenue and users rather than load; put them in the sheet so the total is honest.",
        ]),

        h2("5. Managed or self-hosted: compare total cost, not the invoice"),
        p("The invoice is only one part of what a component costs. Someone patches it, upgrades it, sets up failover, tests restores and gets paged at night. Put that time in the sheet:"),
        code("text", `
                         invoice   engineer time / month          total     risk the sheet does not show
redis, managed            $220     ~1 h  (upgrades click-through)  $270      provider's failover, tested by them
redis, 2 VMs self-run     $120     ~6 h  (patching, Sentinel,      $420      our failover, tested when we test it
                                          monitoring, upgrades)
postgresql, managed     $1,000     ~2 h                          $1,100      PITR restore is a button; still drill it
postgresql, self-run      $340     ~12 h (HA, backups, PITR,     $940      a restore nobody has practised
                                          upgrades, on-call)`, "managed-vs-self-hosted.txt"),
        bullets([
            "**Managed usually wins at CodeDev's size.** The saving on Redis disappears once the team's hours are counted; on PostgreSQL the numbers are close and the risk of an untested restore decides it.",
            "**Self-hosted wins** when the managed premium has grown larger than the people needed to run it well (a much larger fleet), when you need something the managed offering does not support (an extension, a version, a configuration), or when data-residency rules require it.",
            "**Some components cannot be bought.** The grader sandbox is CodeDev's own product. Engineering time goes there first, which is another argument for buying the commodity parts.",
        ]),

        h2("6. The cost of a nine"),
        p("Availability targets are easy to write and expensive to reach. Start with what each number allows in a 30.4-day month:"),
        code("text", `
target     downtime allowed / month    what it usually takes
99.5 %     3 h 39 min                  one instance per component, backups, manual restore by a human
99.9 %     43.8 min                    multi-zone: managed HA database, 2+ API instances, automatic failover
99.95 %    21.9 min                    + no single point of failure on the critical path, failover drills,
                                         degrade instead of fail (lesson 9)
99.99 %    4.4 min                     + no human in the recovery loop: 4 minutes is less than the time to
                                         page someone and open a laptop; often multi-region`, "nines.txt"),
        p("Two facts change how you spend on availability:"),
        bullets([
            "**Dependencies in series multiply.** A request that needs the API (99.99%), PostgreSQL (99.95%) and Redis (99.9%) is available at most 0.9999 x 0.9995 x 0.999 = about 99.84%. Buying a better database cannot lift that above the weakest dependency still on the path.",
            "**The cheapest nine is removing a dependency from the path.** Lesson 9's degradation (progress works when the leaderboard and cache do not) takes Redis out of the product: the learning path then needs only the API and PostgreSQL. That costs code and a game day, not a second region.",
        ]),
        p("And the targets do not have to be the same for every journey. CodeDev's design doc can say: learning path 99.95% (higher on exam days, protected by the scheduled scaling above), leaderboard 99% and allowed to be stale, certificates measured as freshness (issued within 1 hour), checkout as good as the payment provider allows. Each target is then something you can afford and measure."),
        challenge("chal_quiz_sdc_521"),

        h2("7. When a simpler design wins"),
        p("A component earns its place by meeting a requirement the simpler design cannot meet, at a price the business accepts. Ask of every box in the architecture: **would the simpler option meet the numbers in the requirements?** If it would, the complex option has to name what it buys. Three CodeDev examples:"),
        bullets([
            "**Certificate service as its own deployed service, or as one more job type on the existing worker pool?** At a few hundred certificates a day the job type meets every requirement; a separate service adds a deploy pipeline, dashboards, an on-call rotation and network calls. Split it out when it needs a different runtime, scaling or security boundary, not before.",
            "**Second region, active-active?** It roughly doubles infrastructure (about $3,000 a month on the corrected sheet of about $3,050) and turns every write into a cross-region consistency question for progress and submissions. A single region across zones meets 99.9 to 99.95% if the critical path has no SPOF. Buy the region when a requirement (a contract, a regulator, a measured regional outage cost) asks for it.",
            "**Leaderboard in Redis, or a PostgreSQL table?** An indexed table would serve the top 100 for 200,000 learners. The design keeps the Redis sorted set because Redis is already there for the cache and rank lookups stay cheap as the board grows, but it is a judgment the doc must state with its alternative, not an industry default.",
        ]),
        callout("tip", "Reversible decisions can be cheap now",
            "Starting with the simpler option is safest when it is easy to change later. Moving the certificate job into its own service later is a few days of work. Undoing a multi-region data model is not. Spend design effort and money on the choices that are hard to reverse."),

        h2("8. How to verify a cost estimate"),
        bullets([
            "**Tag every resource with its component** and compare the billing export with the sheet every month. A line that drifts by more than about 20% gets an explanation in writing.",
            "**Set budget alerts per component** at the expected value, not only one alert on the total. October's grader line would have alerted on its first day.",
            "**Measure utilisation** of the expensive line: busy grader slots over time versus provisioned slots. Large idle capacity on normal days is money to recover.",
            "**Rehearse the peak** in staging with a load test at 340 submissions/s against the scheduled-scaling configuration, and record the backlog and the worst grading delay. That is the evidence for the \"grades within 10 minutes\" decision.",
            "**Price the requirement, not the component.** For each non-functional requirement in the design doc, write which lines of the sheet it drives. If no line would change when a requirement is dropped, the requirement is not what drives the cost.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**Sizing for the peak and paying for it all month.** Spot it: a component's average utilisation is in single digits while its peak utilisation is near 100%.",
            "**Comparing invoices instead of total cost.** Spot it: a self-hosting proposal with no line for patching, upgrades, failover tests and on-call.",
            "**Buying a nine for one component.** Spot it: the proposal improves the database's availability while another dependency with a lower number stays on the same request path.",
            "**Optimising the cheap line.** Spot it: a week spent replacing a $9 queue while the line that is 96% of the bill is unchanged.",
            "**Uncapped autoscaling.** Spot it: no maximum replica count, so a retry storm or a scripted abuse of the submit endpoint is also a billing incident.",
        ]),

        h2("10. Summary"),
        bullets([
            "Build the monthly sheet as units times unit price with a reason next to each number, find the line that dominates, and size it for the real load shape: baseline plus scheduled peaks, with the delay it causes priced as a product decision.",
            "Compare managed and self-hosted on invoice plus engineering time plus risk; at CodeDev's size managed usually wins, and engineering time goes to what cannot be bought.",
            "Price each nine before buying it: dependencies in series multiply, so removing a dependency from the critical path is often the cheapest nine, and a simpler design wins whenever it meets the written requirements.",
        ]),

        h2("Sources"),
        bullets([
            "Google SRE book: Embracing Risk (the cost of each additional nine, error budgets) - sre.google/sre-book",
            "AWS Builders' Library: Using load shedding to avoid overload - aws.amazon.com/builders-library",
            "Your cloud provider's pricing calculator for current unit prices; the prices in this lesson are planning numbers.",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Fill in the cost sheet for your CodeDev design with real prices from one provider's calculator: one line per component, units with their reason, unit price and monthly total. Then answer three questions in a short note: which line dominates, what one requirement change would cut the bill most, and what availability your critical path can reach from its dependencies' numbers."),
    ],
});
