// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-1-3",
    title: "W3C trace context: traceparent from service to service",
    slug: { _type: "slug", current: "w3c-trace-context-traceparent" },
    description:
        "One submission showed up as three unrelated traces: the edge gateway wrote its traceparent with upper-case ids, the API rejected it and started a new trace, then forwarded the bad header to grading-service, which did the same. Learn the W3C traceparent format field by field, what each hop keeps and what it replaces, how versions, flags and tracestate are handled, when to use the OpenTelemetry propagator and when you have to write the code yourself - and write it, tested against the spec's rules.",
    estimatedTime: 35,

    scenario: {
        role: "Backend developer, CodeDev learning platform (edge gateway, NestJS API, grading-service, OpenTelemetry)",
        problem:
            "After the logging fix, the team tried to follow submission s_1204 from the browser to the test run. The trace search returned three traces for the same minute: one span from the edge gateway, a POST /submissions trace from the API with no parent, and a grading-service trace that also started from nothing. Every log line had a trace id, but each service had a different one. The gateway's traceparent middleware had been written by hand a month earlier, and the API's client for grading-service copied the incoming header onto its outgoing call.",
    },

    content: [
        h2("1. The incident: three traces for one request"),
        p("The trace search for the minute of submission `s_1204`, filtered on the route and the submission attribute:"),
        code("text", `
trace 4bf92f3577b34da6a3ce929d0e0e4736   edge-gateway     POST /submissions          2,212 ms  (1 span)
trace 9c2e41d0a7b35f6e81d4c0b2a9f3e7d5   codedev-api      POST /submissions          2,190 ms  root, no parent
trace 1d7a33c8e5b04f2690aa7c1e4b2d8f63   grading-service  POST /runs                 1,940 ms  root, no parent`, "trace search"),
        p("Three roots. Each service did trace its own work, but nothing tells the backend that the API's span was caused by the gateway's, or that the test run was part of the API's request. The headers captured between the hops show why:"),
        code("text", `
edge-gateway -> codedev-api
  traceparent: 00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01

codedev-api -> grading-service
  traceparent: 00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01`, "captured headers"),
        p("Two bugs. The gateway's middleware wrote the ids with `.toUpperCase()` - the spec only allows lowercase hex, so the API's OpenTelemetry propagator ignored the header and started a new trace. And the API's hand-written client for grading-service did `headers.traceparent = req.headers.traceparent`: it forwarded what it received instead of writing its own. grading-service rejected the same invalid header, and even a valid copy would have pointed at the wrong parent."),

        h2("2. Read the header field by field"),
        p("W3C Trace Context (a W3C Recommendation since 2021) defines two HTTP headers. **`traceparent`** carries the position in the trace; **`tracestate`** carries optional vendor data. `traceparent` version `00` is four fields separated by dashes, 55 characters in total:"),
        code("text", `
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^ ^^
             |  trace-id: 16 bytes, 32 hex       parent-id:       trace-flags: 8 bits, 2 hex
             |  the whole request, every hop     8 bytes, 16 hex  bit 0 (0x01) = sampled
             version: 2 hex, "00" today          the CALLER's span`, "anatomy"),
        bullets([
            "**version**: two lowercase hex digits. `00` is the only version defined; `ff` is forbidden.",
            "**trace-id**: 32 lowercase hex characters, identical in every service of the request. All zeros is invalid.",
            "**parent-id**: 16 lowercase hex characters, the id of the span **in the caller** that made this call. All zeros is invalid.",
            "**trace-flags**: two hex characters. Only the lowest bit is defined: **sampled**, meaning the caller may have recorded its part of the trace. The other bits are reserved and a service sets them to 0 on what it sends.",
        ]),
        p("\"Lowercase hex\" is not a style preference. The spec defines the fields with lowercase hex digits only and says a service must ignore a `traceparent` whose parent-id contains anything else. A receiver that ignores the header does exactly what the spec asks: it **restarts the trace**, with a new trace id. That is the first bug of the incident, and a lenient parser in one service would only have hidden it until the next service."),
        h3("What a hop keeps and what it replaces"),
        p("When the API receives a request and calls grading-service, its outgoing header is built from three sources:"),
        numbered([
            "**trace-id: kept.** Same value as received. This is what puts every span in one trace.",
            "**parent-id: replaced** by the id of the API's own span that makes the call (usually the HTTP client span). This is what builds the tree: grading-service's span becomes a child of that span.",
            "**sampled flag: kept.** The decision made at the root travels with the request, so a trace is either recorded by every service or by none. Forcing `01` everywhere defeats sampling and its cost savings; forcing `00` cuts holes in traces.",
        ]),
        p("If the incoming header is missing or invalid, the service starts a new trace: a new random trace id, its own span, and its own sampling decision. It never \"repairs\" a broken header, and it never reads `tracestate` without a valid `traceparent`."),
        h3("Versions and tracestate"),
        p("The spec plans for a future version. A service that receives a version it does not know (`01` to `fe`) should still try: if the header has at least 55 characters, parse trace-id, parent-id and flags at the same positions; if it is longer, the character after the flags must be a dash, and what follows is not read. The service then writes **version 00** on its own calls, the highest version it knows. A version `00` header, by contrast, has exactly 55 characters: anything appended makes it invalid."),
        p("**`tracestate`** is a comma-separated list of `key=value` members where tracing vendors keep their own data, for example `rojo=00f067aa0ba902b7,congo=t61rcWkgMzE`. A service that has nothing to add passes it on; one that adds an entry puts it first. The spec limits it to 32 members and asks for at least 512 characters to be propagated; keys are lowercase, values printable ASCII without `,` and `=`. If `tracestate` cannot be parsed, the service may drop the whole header. It is not a place for application data: `baggage` (a separate W3C header) exists for that, and anything in either header is visible to every service and proxy on the path."),
        callout("info", "When not to trust an incoming traceparent",
            "At the edge, requests come from browsers and anyone with curl. Accepting their traceparent means accepting their trace ids and their sampling decision: a client can force every request to be sampled, or reuse one trace id for thousands of requests. Many teams let the edge gateway start a new trace for public traffic (optionally linking the client's span) and trust traceparent only between their own services."),

        challenge("chal_quiz_otl_131"),

        h2("3. Use the propagator when you can"),
        p("In a service with the OpenTelemetry SDK you rarely touch the header. The Node SDK registers the W3C Trace Context propagator by default (together with W3C Baggage), and the HTTP instrumentations extract the incoming header into the active context and inject the right one on outgoing calls - parent-id included. Check the current OpenTelemetry JS docs for the defaults of your version."),
        p("You inject by hand when the transport is not instrumented: a queue message, a WebSocket frame, a custom RPC. The propagation API works on any object of string keys:"),
        code("typescript", `
import { context, propagation, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("codedev-api");

// sending: inside the span that represents the call
await tracer.startActiveSpan("grading.request", async (span) => {
    try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        propagation.inject(context.active(), headers);   // writes traceparent (and tracestate)
        // headers.traceparent === "00-<same trace id>-<this span's id>-<sampled flag>"
        await this.queue.publish("grading", { submissionId, headers });
    } finally {
        span.end();
    }
});

// receiving, in the worker: continue the trace from the carrier
const parent = propagation.extract(context.active(), job.data.headers);
await context.with(parent, () => tracer.startActiveSpan("grading.process", async (span) => { /* ... */ }));`, "propagation.ts"),
        p("Lesson 4 goes deeper into keeping this context across `await`, callbacks and the queue. The point here: `inject` writes the active span's id as parent-id. Copying the header you received - the API's second bug - skips that step."),
        h3("When you have to write it yourself"),
        p("Some places have no SDK: an edge function with a tiny runtime, a proxy configured in a template language, a legacy service in a stack without OpenTelemetry, or the gateway middleware of this incident. Then you implement the spec's rules yourself, and the rules are exact: positions, lengths, lowercase, all-zero ids, version handling, flags. The gateway's fixed middleware is short because it only creates headers:"),
        code("typescript", `
// edge-gateway/traceparent.middleware.ts - after
import { randomBytes } from "node:crypto";

function randomId(bytes: number): string {
    let id = "";
    do id = randomBytes(bytes).toString("hex");   // lowercase hex already
    while (/^0+$/.test(id));                      // all zeros is invalid: draw again
    return id;
}

// public traffic: always start a new trace at the edge, sampled
export function startTrace(): { traceparent: string; spanId: string } {
    const traceId = randomId(16);
    const spanId = randomId(8);
    return { traceparent: \`00-\${traceId}-\${spanId}-01\`, spanId };
}`, "traceparent.middleware.ts"),
        p("The receiving side is where the rules pile up. In the exercise you write it for the API's call to grading-service: parse and validate the incoming `traceparent` (including unknown higher versions), build the outgoing header for a child span with a new id from an injected, deterministic id source, keep the sampled bit, and pass `tracestate` through unchanged only when it is valid. The description gives the exact rules, taken from the spec and simplified where noted."),
        challenge("chal_coding_otl_132"),

        h2("4. How to verify propagation"),
        bullets([
            "**Send a known header and read the span.** `curl -H \"traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01\" https://api.codedev.test/health` and check in the trace backend that the API's span has that trace id and parent span id `00f067aa0ba902b7`. Then send it upper-case and check that the API starts a new trace - that is correct behaviour.",
            "**Capture the outgoing header.** Point the API at a local echo server (or read the debug exporter of the collector) and check: same trace id, a parent-id equal to the API's client span id, never the parent-id it received.",
            "**Unit-test a hand-written parser with the spec's cases**: valid, upper-case, all-zero ids, `ff`, a future version with extra fields, `00` with extra fields, short headers, flags `00`, `01`, `03`. The exercise's tests are a ready list.",
            "**Count root spans per service.** In the backend, the number of root spans of `codedev-api` with a `traceparent` on the request should be zero. Roots appearing on an internal service mean a hop drops or breaks the header.",
        ]),

        h2("5. Common mistakes"),
        bullets([
            "**Hand-rolled ids in the wrong format.** Upper case, missing leading zeros, 128-bit ids printed as UUIDs with dashes. Spot it: roots on the receiving service right after a hop you wrote yourself; compare the raw header with the 55-character pattern.",
            "**Forwarding the received header.** The trace id survives, the tree does not: the callee hangs under the caller's caller. Spot it: a client span with no children while the callee's span sits next to it as a sibling.",
            "**Overriding the sampled flag.** Always sending `01` makes every downstream service record every request; always `00` drops their spans. Spot it: trace volume of a downstream service that does not follow the sampling ratio of the edge.",
            "**Reading tracestate without a valid traceparent**, or putting user data in it. Spot it: tracestate entries with emails or user ids in captured headers. Use your own span attributes for application data, and nothing personal in headers.",
            "**Lenient parsing.** Accepting upper case or extra fields in a hand-written parser makes your service join traces that the next standard-compliant service will break again. Spot it: the same header accepted by one hop and rejected by the next.",
        ]),

        h2("6. Summary"),
        bullets([
            "traceparent is version-traceid-parentid-flags in lowercase hex, 55 characters for version 00; a header that breaks a rule is ignored and the trace restarts.",
            "Each hop keeps the trace id and the sampled bit, replaces the parent-id with its own span's id, and passes valid tracestate on; unknown higher versions are parsed by position and answered with version 00.",
            "Let the OpenTelemetry propagator inject and extract wherever an SDK runs, and test hand-written propagation against the spec's rules.",
        ]),

        h2("Sources"),
        bullets([
            "W3C Trace Context, Recommendation: www.w3.org/TR/trace-context/ (traceparent, tracestate, versioning, privacy and security considerations)",
            "OpenTelemetry, Context propagation: opentelemetry.io/docs/concepts/context-propagation/",
            "OpenTelemetry JS API: propagation.inject / propagation.extract (check the current docs)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every hop a request takes in one of your systems - CDN, gateway, services, queues, scheduled jobs - and mark where traceparent is written by an SDK, written by hand or lost. Send one request with a known traceparent through all of them and count the traces it produces; the target is one."),
    ],
});
