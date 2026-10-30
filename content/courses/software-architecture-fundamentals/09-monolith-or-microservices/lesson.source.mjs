// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-saf-3-2",
    title: "Monolith or microservices? Decide from evidence",
    slug: { _type: "slug", current: "monolith-or-microservices-decide-from-evidence" },
    description:
        "After the code runner overloaded the CodeDev website on a deadline night, a developer proposed splitting the backend into six microservices. Learn what monolith, modular monolith and microservice mean, the six criteria that decide between them - team and ownership, independent deploys, scaling profile, failure isolation, data ownership and operational cost - and how to apply them to one evidence pack. The usual result: a modular monolith, one component extracted because its runtime profile really is different, and written signals that tell the team when to decide again.",
    estimatedTime: 30,

    scenario: {
        role: "Junior backend developer, CodeDev platform team",
        problem:
            "On 14 September at 21:00, 40 learners submitted their code at the same assignment deadline. The code runner, which then ran inside the main application, used all CPU for 12 minutes; the website's p95 response time went from 180 ms to 4.2 s and some checkouts timed out. The next morning a developer posted: \"This is why we need microservices. Let's split catalog, orders, payments, enrollment, notifications and progress into six services, each with its own database.\" The team lead asks you to prepare the decision from evidence, not opinions.",
    },

    content: [
        h2("1. The argument in the channel"),
        p("The proposal has energy behind it. The incident was real, people were paged, and microservices sound like the modern answer. Two more messages follow: \"Smaller services are simpler, so we will move faster\" and \"Our pipeline takes 25 minutes, with services each deploy would be quick.\" Nobody has yet asked which problem each change would solve, and what it would cost."),
        p("This lesson is a scenario. You will read one evidence pack about the CodeDev team, apply six criteria to it, and reach a recommendation you can defend. The quiz asks you to do the same steps on the same evidence."),

        h2("2. Three words to keep apart"),
        bullets([
            "**Monolith.** One application that is built, tested and deployed as **one unit**. It can be well organized or a mess; \"monolith\" says nothing about the inside.",
            "**Modular monolith.** A monolith with strict internal boundaries: modules with their own code and their own tables (lesson 8), dependencies that point one way (lessons 3 and 7), and other modules reached only through interfaces (lesson 4). Still one deploy, one process, one database.",
            "**Microservice.** A small service that is **deployed on its own**, owns its own data, and talks to other services over the network (HTTP calls or messages). A team can change, deploy and scale it without the others.",
            "**Distributed monolith.** Services that must still be changed and deployed together. You pay the network costs of microservices and keep the coupling of a monolith. It is the outcome to avoid.",
        ]),
        p("A module boundary and a service boundary are different things. A module boundary is a rule inside one program. A service boundary is a network between two programs. You can have the first without the second, and lessons 1 to 8 were all about the first."),

        h2("3. The evidence pack"),
        p("Before discussing, collect facts. This is what the team found in its repository, pipeline, monitoring and incident log:"),
        code("text", `
CodeDev backend - evidence pack, collected 2026-09-16

Team         6 developers, 1 team, 1 backlog, 1 weekly planning
             no on-call rotation: one senior developer handles production issues
Code         1 Node.js/TypeScript application, modules: catalog, orders, payments,
             enrollment, notifications, progress (+ the code runner, inside the same process)
Changes      last 90 days: 212 merged pull requests
             170 of them (80%) changed files in 2 or more modules
             most common pair: orders + payments + enrollment (checkout work)
Deploys      1 pipeline: tests 14 min, build 6 min, deploy 5 min = 25 min
             3-4 deploys per working day; deploy queue: median 0 waiting, max 1
Load (web)   steady, CPU 20-35% on the app servers, p95 180 ms
Load (runner) bursty: quiet most of the day, CPU 95-100% for 10-20 min around
             assignment deadlines; each run uses 0.5-3 s of CPU on one core
Incidents    2026-09-14 21:00: 40 submissions at one deadline, runner used all CPU,
             web p95 180 ms -> 4.2 s for 12 min, 23 checkout requests timed out
             no other incident in 6 months crossed module boundaries
Data         1 Postgres database; enrollments had 2 writers (fixed in lesson 8)
Operations   logs in one place, no distributed tracing, 1 deploy pipeline to maintain`, "evidence-pack.txt"),

        h2("4. Six criteria"),
        p("Each criterion is a question. For each one, the evidence answers \"split\" or \"keep together\". The decision is not a vote of opinions; it is the sum of these answers, component by component."),
        numbered([
            "**Team size and ownership.** Do several teams need to work without waiting for each other? A service boundary works best when **one team** owns the service end to end. Melvin Conway observed in 1968 that a system's structure tends to copy the communication structure of the organization that builds it. One team of six talks all day; it does not need network boundaries to stay out of each other's way.",
            "**Need for independent deploys.** Are teams blocked because one change must wait for another to ship? Look at the deploy queue and at how often modules change **together**. If most changes touch several modules, separate deploys make each change harder, not easier: three services to change, release in the right order, and keep compatible.",
            "**Scaling profile.** Does one part need very different resources, at different times, from the rest? Steady, light web traffic and short, CPU-heavy bursts do not fit well on the same machines.",
            "**Failure isolation.** Can one part's failure or overload take down the rest? If yes, and it has happened, that part is a candidate for its own process with its own limits.",
            "**Data ownership.** Does each candidate service own its data already? Splitting a module that shares tables with others turns one database transaction into a distributed problem (lesson 8, section 6). Fix ownership first; it is a precondition, not a result, of a split.",
            "**Operational cost.** Who runs it? Every service adds a pipeline, monitoring, alerts, versioned API contracts, network timeouts and retries, and someone who answers when it breaks at night. Without tracing, one slow request across five services is hard to debug.",
        ]),
        image("monolith-microservices-decision", {
            alt: "Decision table. Rows are the six criteria: team and ownership, independent deploys, scaling profile, failure isolation, data ownership, operational cost. Two columns: the six business modules, and the code runner. For the six modules every cell is green and says keep together: one team, 80 percent of pull requests touch 2 or more modules, steady load, no cross-module incidents, one database, no on-call rotation. For the code runner, scaling profile and failure isolation are red and say split: bursty CPU-heavy load and the 14 September incident; the other cells are neutral. The result row says: modular monolith for the six modules, the code runner as a separate service. A bottom strip lists signals to revisit: a third team, a deploy queue, a module with a new load profile.",
            caption: "Decide per component, not for the whole system at once.",
        }),

        h2("5. Apply the criteria to the evidence"),
        code("text", `
Criterion            Six business modules                     Code runner
Team and ownership   1 team of 6 owns all          -> keep    same team                        -> neutral
Independent deploys  80% of PRs touch 2+ modules,  -> keep    rarely changes with the rest     -> neutral
                     deploy queue max 1
Scaling profile      steady, CPU 20-35%            -> keep    95-100% CPU bursts at deadlines  -> SPLIT
Failure isolation    no cross-module incident      -> keep    slowed the website on 09-14      -> SPLIT
Data ownership       1 database, ownership fixed   -> keep    needs only code and tests        -> easy to split
Operational cost     no on-call, no tracing        -> keep    one extra service is affordable  -> acceptable`, "decision table"),
        p("Read the two columns separately. For the six business modules, every row says the same thing. One team owns them, most changes cross module boundaries, the load is steady and light, and their failures have stayed inside one module. Splitting them would give each checkout change three repositories, three pipelines and three releases to coordinate, with network calls where function calls used to be, and no on-call rotation to run them."),
        p("The code runner is different on exactly the two rows that caused the incident: its load profile and the damage its overload did to everything else. It also has two traits that make extraction easy: it changes rarely together with the business modules, and it needs almost no shared data - it receives code and tests and returns results."),

        h3("The recommendation"),
        bullets([
            "**Keep the six business modules in one modular monolith.** Keep enforcing the boundaries: layer checks (lesson 3), ports (lesson 4), no cycles (lesson 7), one owner per table (lesson 8). Good boundaries are what would make a later split cheap.",
            "**Run the code runner as a separate service** with its own CPU limits, a queue in front of it, and a timeout on every call from the website. This is in fact how CodeDev runs it today: the code runner is a separate service that the web application calls over HTTP.",
            "**Write the decision down** with the evidence and the signals to revisit it (lesson 10).",
        ]),
        callout("info", "Why \"modular monolith first\" is the usual answer",
            "Martin Fowler's \"MonolithFirst\" note describes the pattern many teams report: systems that started as microservices often ran into trouble, while successful microservice systems often started as a monolith that was split later, once the boundaries were well understood. It is a heuristic, not a law; the evidence pack is what decides for your team."),

        h2("6. What to do now"),
        p("A decision is only useful if it turns into work for the next sprint. For each complaint in the channel, pick the cheapest change that solves it:"),
        code("text", `
Complaint                           Change now                                        Not now
Runner overload slowed the website  runner as a service: CPU limits, queue, timeout   split all six modules
25-minute pipeline                  parallel tests (14 min today), build cache        one pipeline per service
"Modules step on each other"        layer and ownership checks in CI (lessons 3, 8)   network boundaries`, "plan"),
        p("On the website side, the runner is reached through a port, exactly like the payment gateway in lesson 4. The website does not know whether the runner is a function call or a separate service; it only knows it may be slow or unavailable:"),
        code("typescript", `
// progress/application/CodeRunner.ts - the port
export interface CodeRunner {
    run(submission: { language: string; code: string; tests: string[] }): Promise<RunResult>;
}
export type RunResult =
    | { kind: "finished"; passed: number; failed: number }
    | { kind: "busy" }          // the runner's queue is full: ask the learner to retry
    | { kind: "timeout" };      // no answer in time: the website stays fast anyway

// infrastructure/HttpCodeRunner.ts - the adapter for the separate service
export class HttpCodeRunner implements CodeRunner {
    constructor(private readonly baseUrl: string, private readonly timeoutMs: number) {}

    async run(submission: { language: string; code: string; tests: string[] }): Promise<RunResult> {
        try {
            const res = await fetch(this.baseUrl + "/run", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(submission),
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (res.status === 429 || res.status === 503) return { kind: "busy" };
            return (await res.json()) as RunResult;
        } catch {
            return { kind: "timeout" };
        }
    }
}`, "the website's side of the split"),
        p("The overload now has a limit on both sides. The runner refuses work it cannot take (429 or 503) instead of slowing everything down, and the website waits at most `timeoutMs` before showing \"the runner is busy, try again\". Checkout never waits for a code run."),

        h2("7. Signals to revisit the decision"),
        p("\"Not now\" is not \"never\". Write down, with the decision, the observations that would make the team look again. Good signals are measurable:"),
        bullets([
            "**More teams.** The company grows to three or more teams, and each team owns modules that rarely change together (for example, under 20% of pull requests cross team-owned modules).",
            "**A deploy queue.** Deploys wait for each other regularly: the queue has a median above 1, or a team cannot release because another team's change is not ready.",
            "**A new load profile.** A module starts to need different resources or scaling from the rest - for example, `notifications` sends a burst of 200000 emails each Monday morning and slows the web servers.",
            "**A new isolation need.** A module must be isolated for security or compliance reasons, for example card data handled under stricter rules.",
        ]),
        p("A good signal is something you can observe without an argument: a number in the pipeline, a count of pull requests, a graph in monitoring. \"We feel slow\" is not a signal; \"the deploy queue median was 3 for four weeks\" is."),

        h2("8. How to check the decision worked"),
        bullets([
            "**At the next deadline burst**, the website's p95 stays near 180 ms while the runner's CPU is at its limit. Compare with the 4.2 s of 14 September.",
            "**The runner's queue length and its 429/503 count** are on the dashboard. A rising busy count means the runner needs more capacity - and now it can get more without touching the website.",
            "**The pipeline time** after parallel tests and build caching, measured over two weeks.",
            "**The share of pull requests that cross modules**, measured each quarter. It is the first number to watch for the \"more teams\" signal.",
        ]),
        p("Now walk the evidence pack yourself. Each statement is one step of the decision:"),
        challenge("chal_quiz_saf_321"),

        h2("9. Common mistakes"),
        bullets([
            "**Deciding for the whole system at once.** \"Monolith or microservices?\" is usually the wrong question; \"which component, if any, should be separate?\" is the right one. Detect it: a proposal that splits every module in the same way.",
            "**Splitting to fix code quality.** Tangled modules become tangled services, with network calls in between. Detect it: the modules being split still share tables or import each other in cycles.",
            "**Counting lines, not changes.** Small services feel simple one at a time, but the work moves to the calls between them: timeouts, retries, versioned contracts, partial failures. Detect it: the plan has no answer for \"what happens when service B is down while A calls it?\"",
            "**Splitting to shorten the pipeline.** A slow pipeline is fixed in the pipeline: parallel tests, caching, smaller test sets per change. Detect it: nobody measured where the 25 minutes go.",
            "**No exit signals.** A decision without \"revisit when\" is either argued again every month or never questioned at all. Detect it: the decision record has no measurable trigger.",
        ]),

        h2("10. Checklist"),
        bullets([
            "The evidence is collected first: team, change coupling, deploy times and queue, load profiles, incidents, data, operations.",
            "Each of the six criteria is answered from the evidence, per component.",
            "Components with a clearly different runtime profile or failure impact are considered for extraction on their own.",
            "Module boundaries and data ownership are in place before any split.",
            "Each complaint is matched with the cheapest change that solves it.",
            "The decision lists measurable signals to revisit it, and is written down.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Write the decision as an architecture decision record, using the format from lesson 10: the context (the evidence pack in your own words), the options you considered with one reason for and against each, the decision, its consequences - including the costs - and the signals to revisit it. Then collect the same evidence for a project you know: count how many of the last 50 merged pull requests touched two or more modules, and note the deploy time and the load profile of each part."),

        h2("Sources"),
        bullets([
            "Martin Fowler, \"MonolithFirst\" (bliki, 2015).",
            "James Lewis and Martin Fowler, \"Microservices\" (martinfowler.com, 2014): the characteristics of a microservice architecture, including independent deployment and decentralized data management.",
            "Melvin E. Conway, \"How Do Committees Invent?\" (Datamation, 1968), the origin of Conway's law.",
        ]),
    ],
});
