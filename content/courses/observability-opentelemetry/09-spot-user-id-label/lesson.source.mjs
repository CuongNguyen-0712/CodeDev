// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-3-3",
    title: "Spot the AI mistake: user_id as a metric label",
    slug: { _type: "slug", current: "spot-the-ai-mistake-user-id-metric-label" },
    description:
        "Asked to \"add a metric so we can see which learners submit the most\", an AI assistant labelled the submissions counter with user_id and the raw URL. The totals were right and the tests passed; three weeks later the metrics bill had tripled. Learn to tell an operational question (how many, how fast, is it broken) from a per-entity question (who, which one), where each one should be answered, how to fix the counter without losing the per-learner report, and how to review AI-written instrumentation for labels that grow with your users.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer and code reviewer, CodeDev learning platform",
        problem:
            "The monthly invoice of the hosted metrics backend for codedev-api went from $310 to $970. The vendor's usage page shows active series up from 41,200 to 128,900, and 87,400 of them belong to one metric, codedev_submissions_total, which did not exist a month ago. It was added by a pull request written with an AI coding assistant for the admin dashboard's new \"Top submitters\" card. The card works, the numbers are right, and the series count is still climbing with every learner who signs up.",
    },

    content: [
        h2("1. The incident: a correct metric with the wrong labels"),
        p("The request the product engineer sent to the assistant was one sentence: **\"Add a metric so we can see which learners submit the most.\"** This is the change it produced, merged after a green CI run:"),
        code("typescript", `
// src/submissions/submissions.metrics.ts (as merged)
const submissions = meter.createCounter("codedev.submissions", {
    description: "Submissions received, by learner",
    unit: "{submission}",
});

// called by the submit handler once the response status is known
export function onSubmission(req: Request, status: number): void {
    submissions.add(1, {
        user_id: req.user?.id ?? "anonymous",
        url: req.originalUrl,                 // "/submissions?challengeId=c_17&attempt=2"
        method: req.method,
        status: String(status),
    });
}

// admin dashboard: "Top submitters" = the counter summed by user_id, highest first`, "submissions.metrics.ts (as merged)"),
        p("Read it the way the reviewer did: the counter is incremented once per submission, the names follow the conventions, the unit is right, and the test checked that three submissions by `u_an` make `u_an` the top submitter. Nothing in it is *wrong* as code. The problem is not in any line; it is in the choice of tool. The request was a question about **who**, and the assistant answered it with a tool built for **how many**."),

        h2("2. Reproduce it and read the evidence"),
        p("Ask the metrics backend how many series the counter has and which label drives them. (`codedev.submissions` is exported to Prometheus as `codedev_submissions_total`.)"),
        code("text", `
count(codedev_submissions_total)                                  87,400
count(count by (user_id) (codedev_submissions_total))             31,906   <- learners who submitted this month
count(count by (url) (codedev_submissions_total))                 12,315
count(count by (status) (codedev_submissions_total))                   9

# the week after the release, one sample per day
count(codedev_submissions_total)   Mon 6,120   Wed 24,730   Fri 41,980   ...   today 87,400`, "PromQL"),
        p("The series count follows the number of learners (and of challenges, and of attempts in the query string), not the number of submissions per second. It will keep growing as long as CodeDev gains learners. With `user_id` in the labels, every learner is a few series for as long as the backend keeps data. The status code adds a factor of nine where the alerting only ever uses the class."),
        p("The test that went green did not measure any of this. It counted submissions, and the counts were right. A test that would have caught it records submissions from 10,000 different learners and asserts the number of series stays small."),

        h2("3. Core idea: operational questions and per-entity questions"),
        p("Before choosing a signal, classify the question:"),
        bullets([
            "**Operational:** how many submissions per second, how many fail, how slow are they, is it worse than an hour ago? The answer is an aggregate over a few dimensions you choose in advance (route, method, status class, language). This is what **metrics** are for: cheap to keep for months, fast to query, the input for alerts and SLOs (lessons 10-11).",
            "**Per-entity:** which learners submit the most, what did learner 88231 do yesterday, which challenge has the most retries? The answer needs one record per thing, and the set of things grows with the platform. This is what **events, logs and databases** are for: a `GROUP BY user_id` over rows is their normal job.",
        ]),
        p("The request was a per-entity question. The simplest correct answer may not need anything new: the `submissions` table in PostgreSQL already has a `user_id` and a `created_at` for every submission, and the admin card could read `SELECT user_id, count(*) FROM submissions WHERE created_at > now() - interval '7 days' GROUP BY user_id ORDER BY count(*) DESC LIMIT 10` (with an index on `created_at`, and the query plan checked). When the question belongs to product analytics instead, send one event per submission to the analytics pipeline. Either way, the metric keeps its job: counting submissions by route, method and status class, with a handful of series."),
        h3("Why not keep user_id \"just in case\"?"),
        bullets([
            "**Cost grows with users, not traffic.** The bill tripled with flat traffic. Next year's growth plan multiplies it again.",
            "**Queries get slower for everyone.** The SLO and alert queries over `codedev_submissions_total` now read 87,400 series instead of a few.",
            "**Personal data in the wrong place.** A metrics backend has broad read access, long retention, sometimes a vendor in another region, and no practical way to delete one learner's data on request. A user id there is a privacy decision nobody made.",
        ]),
        callout("warning", "Aggregating in the query does not remove a label",
            "`sum without (user_id) (...)` makes a panel look right and changes nothing in storage or on the bill: the labels were attached in the API process, before export. To stop paying for them, stop recording them, or drop them in the SDK (a View) or in the collector before export."),

        challenge("chal_quiz_otl_331"),

        h2("4. The fix pattern: bounded labels on the metric, the entity in an event"),
        p("The same mistake shows up in other places. The lesson page has a view counter that the same assistant wrote a week earlier, with the same shape. Here it is before and after the fix, so you can see the pattern without the challenge's code:"),
        code("typescript", `
// before: one series per learner x lesson x query string
lessonViews.add(1, { user_id: req.user.id, lesson_id: lesson.id, url: req.originalUrl });

// after: the metric answers "how many lesson views, and are they failing?"
lessonViews.add(1, {
    "codedev.course.level": course.level,          // beginner | intermediate | advanced | expert
    "http.route": req.route.path,                  // "/courses/:courseId/lessons/:lessonId"
    "status_class": \`\${Math.floor(res.statusCode / 100)}xx\`,
});

// ...and the analytics pipeline answers "who viewed what": one row per view
if (req.user) {
    analytics.track({
        name: "lesson_viewed",
        userId: req.user.id,
        properties: { lessonId: lesson.id, courseId: course.id },
    });
}`, "lesson views, before and after"),
        bullets([
            "**Every label on the metric has a fixed set of values.** Four levels, one route template per handler, five status classes: at most a few dozen series, whatever the traffic or the number of learners.",
            "**The entity id moves to an event,** where one row per occurrence is the normal shape and \"top 10 learners this week\" is a cheap group-by.",
            "**Requests without a user stay in the metric** (they are traffic and may be errors) but do not create a fake `anonymous` user in the analytics data.",
            "**Exemplars, if your stack supports them,** can still link a slow sample to a trace that carries the request's details, without a label.",
        ]),

        h2("5. Reviewing AI-generated instrumentation"),
        p("Assistants are good at producing instrumentation that compiles, follows naming conventions and makes the requested chart appear. They tend to answer the literal request (\"see which learners\") with the tool named in it (\"a metric\"), and nothing in a small test shows the cost. Review every generated `add`, `record` or span attribute with these questions:"),
        numbered([
            "**List the attribute keys of every `add()` and `record()`.** `git diff main -- 'src/**/*.ts' | grep -nE '\\.(add|record)\\('` finds them. For each key: how many values next year? Any key named like `user`, `id`, `email`, `session`, `url`, `path`, `query`, `ip` needs a written reason.",
            "**Check the route source.** `req.url` and `req.originalUrl` are raw; the router's matched template (`req.route.path` in Express, the route attribute set by the HTTP instrumentation) is bounded.",
            "**Classify the request.** Is it an operational question or a per-entity one? A per-entity request answered with a metric is the mistake of this lesson.",
            "**Ask for the bound test.** Record from 10,000 fake users and assert the series count. If the change comes without it, write it before approving.",
            "**Check personal data.** Is anything identifying a person leaving the database for the metrics or tracing backend? That needs the same review as any new data flow.",
        ]),
        p("In the challenge you review the assistant's counter yourself. The file contains a small fake meter (one data point per attribute set, like an OpenTelemetry counter) and the analytics sink the platform already uses. The public tests check the totals and the top list, as the original CI did, and pass on the assistant's code; the hidden ones simulate 10,000 learners and check what reaches the analytics sink."),
        challenge("chal_coding_otl_332"),

        h2("6. How to verify the fix"),
        bullets([
            "**The bound test.** 10,000 learners, two submissions each: the counter must have at most one series per route x method x status class, and the analytics sink must receive one `submission_created` event per signed-in submission.",
            "**Series after the deploy.** `count(codedev_submissions_total)` drops to a single-digit number once the old series go stale (they stop being scraped and disappear from the head after a few minutes; they stay on disk until retention ends).",
            "**Totals agree.** `sum(increase(codedev_submissions_total[1d]))` and the number of `submission_created` events for the same day differ only by the requests without a session.",
            "**The bill.** The vendor's active-series graph for codedev-api returns to its old level within its billing window. Put that graph on the team dashboard so the next change shows up there first.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Answering \"which users\" with a metric label.** Spot it: a dashboard card that groups a metric by `user_id`, `customer_id` or `email`.",
            "**Removing user_id but keeping the raw URL.** Spot it: `url` or `path` labels with query strings; the series still grow with challenges and attempts.",
            "**Hashing the id.** Spot it: `user_hash` as a label. A hash has as many values as the id: same cost, and still personal data.",
            "**Exact status codes where only classes are used.** Spot it: alert rules and SLOs match `status=~\"5..\"` while the label stores every code.",
            "**Tracking anonymous requests as a user.** Spot it: an `anonymous` user at the top of the analytics report, made of every expired session.",
        ]),

        h2("8. Summary"),
        numbered([
            "Metrics answer operational questions with a few bounded labels; questions about which user or which item belong in events, logs or the database.",
            "A label that grows with users, content or URLs multiplies series and cost even when traffic is flat, and puts personal data in a system not built for it. Aggregating it away in queries does not help.",
            "Review AI-written instrumentation by listing every attribute key, asking how many values it will have, and requiring a test that records from thousands of users and checks the series count.",
        ]),

        h2("Sources"),
        bullets([
            "Prometheus documentation: Instrumentation, Use labels - prometheus.io/docs/practices/instrumentation/",
            "OpenTelemetry: Metrics concepts (attributes and cardinality) - opentelemetry.io/docs/concepts/signals/metrics/",
            "OpenTelemetry specification: Metrics SDK, Views and cardinality limits - opentelemetry.io/docs/specs/otel/metrics/sdk/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Search your codebase for counter and histogram calls and list their attribute keys in a table with one column \"values next year\". For each unbounded key, write the per-entity question it was meant to answer and the query that answers it from a table or an event instead. Next time you ask an AI assistant for a metric, add the bound test to the same prompt: \"record from 10,000 users and assert the number of series stays under N\"."),
    ],
});
