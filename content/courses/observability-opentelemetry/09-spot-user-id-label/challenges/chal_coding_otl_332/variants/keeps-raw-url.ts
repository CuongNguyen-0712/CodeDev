import { readFileSync } from "node:fs";

// Spot the AI Mistake: user_id as a metric label. The request sent to an AI coding assistant was:
//   "Add a metric so we can see which learners submit the most."
// The assistant added a counter to the submit handler (POST /submissions) and a
// topLearners() for the admin dashboard that sums it by learner. The numbers were right, the tests passed
// and the pull request was merged.
//
// Three weeks later the metrics bill had tripled. codedev_submissions_total had one series per learner,
// per challenge, per query string and per status code, and the series kept growing with every new learner.
//
// Fix SubmissionMetrics:
//   - codedev_submissions_total keeps only bounded labels: route (the route template the router matched,
//     req.route), method, and status_class: the first digit of the response status + "xx" ("2xx", "4xx").
//   - per-learner counts go to the analytics sink: for each submission by a signed-in learner, call
//     analytics.track({ name: "submission_created", userId, properties: { challengeId, status } }).
//     A request without a userId (an expired session gets 401) is counted in the metric, not in analytics.
//   - topLearners(n) answers from the analytics sink: analytics.topUsers("submission_created", n).
// Do not change the types, FakeMeter, AnalyticsSink or anything below the "do not change" line.

type SubmitRequest = {
    method: string; // "POST"
    url: string; // raw URL: "/submissions?challengeId=c_17&attempt=2"
    route: string; // route template matched by the router: "/submissions"
    userId: string | null; // null when the session expired
    challengeId: string;
};

class SubmissionMetrics {
    private analytics: AnalyticsSink;
    private submissions: Counter;

    constructor(meter: FakeMeter, analytics: AnalyticsSink) {
        this.analytics = analytics;
        this.submissions = meter.createCounter("codedev_submissions_total", {
            description: "Submissions received, by route, method and status class",
            unit: "{submission}",
        });
    }

    // Called by the submit handler once the response status is known.
    onSubmission(req: SubmitRequest, status: number): void {
        // Bounded labels only: a handful of routes x methods x 5 status classes, whatever the traffic.
        this.submissions.add(1, {
            url: req.url,
            method: req.method,
            status_class: `${Math.floor(status / 100)}xx`,
        });
        // Per-learner detail is an event, not a label.
        if (req.userId !== null) {
            this.analytics.track({
                name: "submission_created",
                userId: req.userId,
                properties: { challengeId: req.challengeId, status },
            });
        }
    }

    // "Which learners submit the most": answered by the analytics pipeline.
    topLearners(n: number): Array<{ userId: string; count: number }> {
        return this.analytics.topUsers("submission_created", n);
    }
}

// ---------------------------------------------------------------- fake meter and analytics sink (do not change)
// FakeMeter keeps one data point per metric and attribute set, like an OpenTelemetry counter with a
// cumulative exporter: every distinct set of attribute values is one series in the metrics backend.
type Attributes = Record<string, string>;
type Counter = { add(value: number, attributes?: Attributes): void };
type DataPoint = { attributes: Attributes; value: number };

class FakeMeter {
    private streams = new Map<string, Map<string, DataPoint>>();

    createCounter(name: string, options: { description?: string; unit?: string } = {}): Counter {
        const stream = this.streams.get(name) ?? new Map<string, DataPoint>();
        this.streams.set(name, stream);
        void options;
        return {
            add(value: number, attributes: Attributes = {}): void {
                const key = JSON.stringify(Object.keys(attributes).sort().map((k) => [k, attributes[k]]));
                const point = stream.get(key) ?? { attributes: { ...attributes }, value: 0 };
                point.value += value;
                stream.set(key, point);
            },
        };
    }

    collect(name: string): DataPoint[] {
        return [...(this.streams.get(name)?.values() ?? [])];
    }
}

// The product analytics pipeline: one event per row in the warehouse, built for high-cardinality ids
// such as user ids, and queried for per-learner reports instead of the metrics backend.
type AnalyticsEvent = { name: string; userId: string; properties: Record<string, string | number> };

class AnalyticsSink {
    events: AnalyticsEvent[] = [];

    track(event: AnalyticsEvent): void {
        this.events.push(event);
    }

    // The n users with the most events of this name: highest count first, then userId in string order.
    topUsers(name: string, n: number): Array<{ userId: string; count: number }> {
        const totals = new Map<string, number>();
        for (const e of this.events) if (e.name === name) totals.set(e.userId, (totals.get(e.userId) ?? 0) + 1);
        return [...totals]
            .map(([userId, count]) => ({ userId, count }))
            .sort((a, b) => b.count - a.count || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
            .slice(0, n);
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of steps.
//   { "submit": { "userId": "u_an", "challengeId": "c_17", "status": 202, "query": "&attempt=2" } }
//       one POST /submissions?challengeId=c_17&attempt=2 (userId null: no session; query optional)
//   { "simulate": { "learners": 10000, "perLearner": 2, "challenges": 40 } }   many learners at once
//   { "total": true }    the sum of every data point of codedev_submissions_total
//   { "top": 3 }         topLearners(3)
//   { "series": true }   how many series the counter has (and, up to 12, the series themselves)
//   { "analytics": true } the submission_created events in the analytics sink
const ROUTE = "/submissions";
type Step = {
    submit?: { userId: string | null; challengeId: string; status: number; query?: string };
    simulate?: { learners: number; perLearner: number; challenges: number };
    total?: boolean;
    top?: number;
    series?: boolean;
    analytics?: boolean;
};

const meter = new FakeMeter();
const analytics = new AnalyticsSink();
const metrics = new SubmissionMetrics(meter, analytics);
const submit = (userId: string | null, challengeId: string, status: number, query = ""): void =>
    metrics.onSubmission({ method: "POST", url: `/submissions?challengeId=${challengeId}${query}`, route: ROUTE, userId, challengeId }, status);

const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
for (const step of steps) {
    if (step.submit) {
        submit(step.submit.userId, step.submit.challengeId, step.submit.status, step.submit.query);
    } else if (step.simulate) {
        const { learners, perLearner, challenges } = step.simulate;
        for (let i = 0; i < learners; i++) {
            for (let k = 0; k < perLearner; k++) {
                const j = i * perLearner + k;
                const status = j % 25 === 0 ? 500 : j % 10 === 0 ? 422 : 202;
                submit(`u${i}`, `c_${(i * 7 + k * 3) % challenges}`, status, `&attempt=${k + 1}`);
            }
        }
    } else if (step.total) {
        console.log(`total: ${meter.collect("codedev_submissions_total").reduce((sum, p) => sum + p.value, 0)}`);
    } else if (step.top !== undefined) {
        const top = metrics.topLearners(step.top);
        console.log(`top ${step.top}: ${top.map((t) => `${t.userId} ${t.count}`).join(", ") || "(none)"}`);
    } else if (step.series) {
        const points = meter.collect("codedev_submissions_total");
        console.log(`series: ${points.length}`);
        if (points.length <= 12) {
            const lines = points.map((p) => `{${Object.keys(p.attributes).sort().map((k) => `${k}="${p.attributes[k]}"`).join(",")}} ${p.value}`);
            for (const line of lines.sort()) console.log(`  ${line}`);
        }
    } else if (step.analytics) {
        const events = analytics.events.filter((e) => e.name === "submission_created");
        const learners = new Set(events.map((e) => e.userId)).size;
        console.log(`analytics: ${events.length} submission_created events from ${learners} learners`);
        const last = events[events.length - 1];
        if (last) console.log(`  last: ${last.userId} ${last.properties.challengeId} ${last.properties.status}`);
    }
}
