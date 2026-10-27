// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-lle-2-2",
    title: "Tracing LLM calls: tokens, latency, model & cost",
    slug: { _type: "slug", current: "tracing-llm-calls-tokens-latency-cost" },
    description:
        "The model bill of the CodeDev AI features doubled in a month and nobody could say which feature, prompt version or user caused it: the only log line was \"grading done in 2.3s\". Learn what to record for every LLM call (model, prompt version, input and output tokens, latency, cost, finish reason, retries, tool calls), how the experimental OpenTelemetry GenAI conventions name those attributes, why prompts with personal data stay out of traces by default, why totals come from metrics or usage rows and not from sampled traces, and how to build cost per feature and per user.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on call for the AI features, CodeDev learning platform",
        problem:
            "The model provider's October invoice for CodeDev is $3,870, against $1,910 in September, while graded submissions grew by only 8%. The platform has three AI features - the grading assistant, the hint generator and the feedback chat - sharing one API key. The application logs show lines like \"grading done in 2.3s\" and nothing about which model was used, how many tokens a call consumed, whether it was retried, or which prompt version ran. The finance team wants to know which feature to cap; the on-call engineer has no data to answer.",
    },

    content: [
        h2("1. The incident: a bill without a breakdown"),
        p("The invoice has one line per model and month. The application has three features and a deploy every few days. Between the two there was nothing that linked a dollar to a feature, a prompt version or a user. This is everything the grading service logged for one submission:"),
        code("text", `
2026-10-21T14:02:11.204Z INFO grading done in 2.3s sub_88412 verdict=pass
2026-10-21T14:02:11.311Z INFO hints generated sub_88412 count=3`, "application log, grading service"),
        p("Three questions came from finance and product within an hour, and the logs answer none of them:"),
        bullets([
            "Which feature spends the money? (The key is shared, so the invoice cannot say.)",
            "Did something change on a particular day - a prompt version, a model, a retry policy?",
            "Is it many learners using a feature a little, or a few clients using it a lot?",
        ]),

        h2("2. Read the evidence you can get"),
        p("The provider's usage export, grouped by day, shows the jump started on 9 October. The deploy log for that day lists `hints-v3` (\"richer hints, JSON output\"). That is a hypothesis, not a cause: the export cannot tell which feature made the calls. A quick sample of raw request logs from the API gateway added two facts. The hint generator's requests now carried about 2,200 input tokens instead of 900, and many grading requests appeared twice within three seconds, with the same submission id."),
        p("The second fact pointed to the client library's automatic retry on a timeout. Each retry is a full, billed call. Without a record per attempt, a retry policy is invisible on every dashboard except the invoice."),

        h2("3. Core idea: one span per model call, with the numbers that cost money"),
        p("A trace already follows a request through the services (the API, the grading worker, the database). Each call to a model becomes a **child span** of the operation that made it, so `grade_submission` contains its model calls, and each call carries the facts that explain time, cost and quality:"),
        bullets([
            "**Model:** the model requested and the model that actually answered (a provider can route an alias to a dated version).",
            "**Prompt version:** a version label for the prompt template, such as `grading-v7`. Without it, a regression cannot be linked to a deploy.",
            "**Tokens:** input and output tokens from the provider's response, not estimated by the application.",
            "**Latency:** the span's own duration; time to first token as well, if you stream.",
            "**Cost:** computed from tokens and a versioned price table in configuration, never hard-coded.",
            "**Finish reason:** \"stop\", \"length\" (cut off by the output limit), a content filter, or a tool call.",
            "**Retries:** one span **per attempt**, with an attempt number, so a retried call shows up as two calls with two costs.",
            "**Tool calls:** when the model asks for a tool (for example \"run the hidden tests\"), the execution of the tool is its own span.",
        ]),
        h3("The OpenTelemetry GenAI conventions (experimental)"),
        p("OpenTelemetry has semantic conventions for generative AI so that dashboards and tools can read spans from different libraries the same way. At the time of writing they are **experimental**: names have changed between versions and may change again, so check the current specification (linked in the course sources) and the documentation of the instrumentation library you use before you build a dashboard on them. Names in use at the time of writing include:"),
        code("text", `
span name                        "chat grader-large"   ({operation} {model})
gen_ai.operation.name            chat
gen_ai.provider.name             the provider (older versions used gen_ai.system)
gen_ai.request.model             grader-large
gen_ai.response.model            grader-large-2026-08-01
gen_ai.request.max_tokens        1024
gen_ai.usage.input_tokens        1840   (older versions: gen_ai.usage.prompt_tokens)
gen_ai.usage.output_tokens       690    (older versions: gen_ai.usage.completion_tokens)
gen_ai.response.finish_reasons   ["stop"]
gen_ai.response.id               the provider's id for this response`, "GenAI span attributes (experimental - verify against the current spec)"),
        p("Anything the conventions do not cover goes in your own namespace, so it can never clash with a future standard name: `codedev.feature`, `codedev.prompt.version`, `codedev.attempt`, `codedev.cost_usd`. Some instrumentation libraries let you choose between older and newer GenAI names with an opt-in setting (for example `OTEL_SEMCONV_STABILITY_OPT_IN`); if you upgrade one, compare the attribute names on a real span before and after."),
        callout("info", "The model names in this course are placeholders",
            "grader-large and grader-small stand for whatever models your provider offers, and the prices in the examples are made up for the arithmetic. Take real prices from your provider's price page and keep them in a dated config file, because prices change."),
        h3("What stays out of the trace"),
        p("A grading prompt contains the learner's submission, and the submission can contain a name, an email in a comment or a phone number in a test string. A trace store is usually readable by every engineer and kept for weeks. So by default, record **metadata, not content**: tokens, versions, ids, finish reasons. GenAI instrumentations generally capture message content only when you explicitly opt in. If you need content to debug quality, capture it for a sample, after redaction (lesson 2.3), with a short retention."),
        h3("Sampling: traces are examples, totals come from elsewhere"),
        p("At thousands of grading calls an hour, keeping every trace is expensive, so traces are sampled (for example 10% with a trace id ratio sampler, plus tail sampling that keeps errors, slow requests and `finish_reasons = [\"length\"]`). A sampled store is perfect for \"show me a slow request\" and useless for \"how much did we spend\". Record the totals for **every** call: a counter or histogram metric for tokens and cost (labelled by feature, model and prompt version), and one usage row per call in a table if you need per-user numbers."),
        callout("warning", "Do not put user ids in metric labels",
            "A metric label with one value per user creates one time series per user, which most metric backends charge for and some refuse. Keep metric labels low-cardinality (feature, model, prompt version, finish reason). Per-user cost comes from the usage table or from logs, where a high-cardinality column is cheap. Use the internal user id there, never the email."),

        challenge("chal_quiz_lle_221"),

        h2("4. Worked example: an instrumented model call"),
        p("The grading worker calls the model through one function. Wrapping that function is the whole change: every feature that uses it is traced. The model client here is the fake one the course uses (it returns recorded responses); a real client returns the same usage fields."),
        code("typescript", `
// llm/tracedChat.ts - every model call of every feature goes through here
import { trace, metrics, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import prices from "../config/llm-prices.json";          // { "grader-large": { "inputPerMTok": 0.4, "outputPerMTok": 1.6 } }

const tracer = trace.getTracer("codedev-llm");
const meter = metrics.getMeter("codedev-llm");
const tokenCounter = meter.createCounter("codedev.llm.tokens", { unit: "{token}" });
const costCounter = meter.createCounter("codedev.llm.cost", { unit: "USD" });

type ChatRequest = { feature: string; promptVersion: string; model: string; maxTokens: number; messages: Message[] };

export async function tracedChat(req: ChatRequest, client: ModelClient, attempt = 1): Promise<ChatResponse> {
    return tracer.startActiveSpan(\`chat \${req.model}\`, { kind: SpanKind.CLIENT }, async (span) => {
        span.setAttributes({
            "gen_ai.operation.name": "chat",
            "gen_ai.request.model": req.model,
            "gen_ai.request.max_tokens": req.maxTokens,
            "codedev.feature": req.feature,
            "codedev.prompt.version": req.promptVersion,
            "codedev.attempt": attempt,
        });                                                  // no message content: metadata only
        try {
            const res = await client.chat(req);
            const price = prices[req.model as keyof typeof prices];
            const cost = (res.usage.inputTokens * price.inputPerMTok + res.usage.outputTokens * price.outputPerMTok) / 1_000_000;
            span.setAttributes({
                "gen_ai.response.model": res.model,
                "gen_ai.usage.input_tokens": res.usage.inputTokens,
                "gen_ai.usage.output_tokens": res.usage.outputTokens,
                "gen_ai.response.finish_reasons": [res.finishReason],
                "codedev.cost_usd": cost,
            });
            const labels = { feature: req.feature, model: req.model, prompt_version: req.promptVersion };
            tokenCounter.add(res.usage.inputTokens, { ...labels, type: "input" });
            tokenCounter.add(res.usage.outputTokens, { ...labels, type: "output" });
            costCounter.add(cost, labels);                   // recorded for every call, sampled or not
            return res;
        } catch (error) {
            span.recordException(error as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
            throw error;
        } finally {
            span.end();
        }
    });
}`, "tracedChat.ts"),
        p("Retries call `tracedChat` again with `attempt + 1`, so each attempt is a sibling span under `grade_submission` and each one adds its own tokens and cost. Metrics are recorded through the metrics API whether or not the trace is sampled, which is what makes the totals complete. The conventions also define GenAI client metrics (such as a token usage histogram and an operation duration histogram); if your instrumentation emits them, use those instead of custom counters."),
        h3("Cost per feature and per user"),
        p("For per-user numbers, the worker also writes one row per call to a `llm_usage` table (user id, feature, model, prompt version, tokens, cost, finish reason, attempt, trace id). Both dashboards are then plain queries:"),
        code("sql", `
-- cost per feature and day
SELECT date_trunc('day', created_at) AS day, feature, round(sum(cost_usd), 2) AS cost_usd,
       sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens
FROM llm_usage
WHERE created_at >= '2026-10-01' AND created_at < '2026-11-01'
GROUP BY 1, 2 ORDER BY 1, 2;

-- the 10 users with the highest cost this month, and how much of it was retries
SELECT user_id, count(*) AS calls, round(sum(cost_usd), 2) AS cost_usd,
       round(sum(cost_usd) FILTER (WHERE attempt > 1), 2) AS retry_cost_usd
FROM llm_usage
WHERE created_at >= date_trunc('month', now())
GROUP BY user_id ORDER BY cost_usd DESC LIMIT 10;`, "dashboards"),
        p("On the October data these two queries answered the incident in minutes: the hint generator's daily cost tripled on 9 October with `hints-v3` (longer prompts and a JSON output that often hit the output limit and was retried), and one integration account that re-submitted every challenge in a loop accounted for 11% of grading cost. The fixes were a shorter hint prompt, a higher output limit with no automatic retry on `length`, and a per-user rate limit."),

        h2("5. How to verify the instrumentation"),
        bullets([
            "**A unit test with an in-memory exporter.** Register a tracer provider with `InMemorySpanExporter` and a `SimpleSpanProcessor` (from `@opentelemetry/sdk-trace-base`; in SDK 2.x the processors are passed to the provider's constructor), run `tracedChat` against the fake client, and assert the span name, the token attributes, the finish reason and the cost. Add a test where the first attempt throws and check that you get two spans.",
            "**No content in spans.** In the same test, assert that no attribute value contains the submission text or an `@`. That test fails the day someone adds the prompt \"just for debugging\".",
            "**Reconcile with the invoice.** Once a month, compare the sum of `cost_usd` in `llm_usage` with the provider's invoice per model. A gap of more than a few percent means calls that bypass `tracedChat`, or an outdated price table.",
            "**Check the sampler with a forced error.** Make the fake client fail once in staging: the error trace must be in the trace store even with 10% head sampling, if your tail sampling is meant to keep errors.",
        ]),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**One span around all retries.** The span shows 4.9 s and the tokens of the last attempt only. Spot it: the provider's request count is higher than the number of chat spans, or `attempt` never goes above 1.",
            "**Full prompts in span attributes or logs.** Spot it: search the trace store for `@` or for a learner's name; check the span size (prompts make spans many kilobytes).",
            "**Totals from sampled traces.** Spot it: the cost panel queries the trace store, and its number is a fraction of the invoice.",
            "**User ids as metric labels.** Spot it: the metric backend reports a series count in the hundreds of thousands, or warns about cardinality.",
            "**Attribute names copied from an old example.** `gen_ai.usage.prompt_tokens` on one service and `gen_ai.usage.input_tokens` on another, and the dashboard shows half the tokens. Spot it: compare a real span from each service with the spec version you target.",
        ]),

        h2("7. Summary"),
        bullets([
            "Give every model call its own span with model, prompt version, input and output tokens, latency, cost, finish reason and attempt number; tool executions get their own spans.",
            "Use the OpenTelemetry GenAI names where they exist, knowing they are experimental, and your own namespace for everything else; record metadata, not prompts with personal data.",
            "Traces are sampled examples; totals come from metrics and per-call usage rows, which give cost per feature and per user and can be reconciled with the invoice.",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Wrap the model client of your own project (or the fake client from lesson 1.2) in a function like tracedChat, export spans to the console or to a local collector, and write the in-memory exporter test from section 5. Then create the llm_usage table, fill it from a day of recorded calls, and run both dashboard queries."),
    ],
});
