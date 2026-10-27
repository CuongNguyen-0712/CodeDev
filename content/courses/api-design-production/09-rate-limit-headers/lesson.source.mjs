// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-3-3",
    title: "Rate limit headers & Retry-After",
    slug: { _type: "slug", current: "rate-limit-headers-retry-after" },
    description:
        "A class of 42 learners in one school lab hit a per-IP rate limit five minutes into a timed exercise: the web client retried in a loop and the mobile app crashed on an HTML 429. Learn when to limit per user and when per IP, how to answer 429 with Retry-After and a problem+json body like every other error, which rate limit headers clients can read (and why their names are still a draft), how to document limits in OpenAPI, and how a client should back off.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev API platform",
        problem:
            "On Friday at 15:00 a university lab class of 42 learners started a timed exercise on CodeDev. At 15:03 submissions began to fail for almost everyone. The access log shows the same client IP for every learner - the school's NAT address - and the nginx rate limit added after a scraping incident allows 60 requests per minute per IP on /submissions. The web client treated each 429 as retryable and resent at once, so the lab used its budget faster. The mobile app crashed: nginx answers 429 with an HTML page, and the app's error parser expects JSON. Learners outside the lab saw no problem at all.",
    },

    content: [
        h2("1. The incident: 42 learners, one IP address"),
        p("The on-call engineer's first query grouped the rejected requests by IP and by user:"),
        code("text", `
15:03:11.402  POST /submissions  ip=203.0.113.24  user=u_311  -> 429  (nginx)
15:03:11.418  POST /submissions  ip=203.0.113.24  user=u_287  -> 429  (nginx)
15:03:11.420  POST /submissions  ip=203.0.113.24  user=u_311  -> 429  (nginx)   <- retried after 18 ms
15:03:11.455  POST /submissions  ip=203.0.113.24  user=u_402  -> 429  (nginx)

rejected 15:03-15:10: 3,912 requests, 1 ip, 42 users`, "edge access log"),
        p("Nothing was wrong with any single learner. Each one submitted a few times a minute, which is normal during an exercise; together they were 42 people behind one address. The limit was meant to stop a scraper, and it was keyed by the only identity nginx knows: the IP. Then two client behaviours turned a slowdown into an outage:"),
        bullets([
            "**The web client retried 429 at once.** Each rejected request came back 18 ms later and was rejected again, using up the budget the next learner needed.",
            "**The mobile app crashed.** nginx sends its own HTML error page for 429, with no `Retry-After`. The app's `ApiError.fromResponse` calls `res.json()` on every error response, and it threw `SyntaxError: JSON Parse error: Unexpected character: '<'`.",
        ]),
        p("A rate limit is part of the API contract, like a status code or an error body. This lesson fixes three things: **who** is counted, **what the 429 says**, and **how clients react** to it."),

        h2("2. Reproduce it and read the evidence"),
        p("From one machine, with two different learners' tokens, send requests until the limit answers. `curl -i` shows exactly what a client receives:"),
        code("bash", `
for i in $(seq 1 61); do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://api.codedev.test/submissions \\
    -H "Authorization: Bearer $([ $((i % 2)) = 0 ] && echo $LAN || echo $MINH)" \\
    -H "Content-Type: application/json" -d '{"challengeId":"c_17","language":"typescript","code":"..."}'
done; echo
201 201 201 ... 201 429

curl -i -X POST https://api.codedev.test/submissions -H "Authorization: Bearer $LAN" ...
HTTP/1.1 429 Too Many Requests
Server: nginx
Content-Type: text/html

<html><head><title>429 Too Many Requests</title></head>...`, "terminal"),
        p("Two learners, one budget: the 61st request is refused no matter whose token it carries. The response has no `Retry-After`, so a client has no idea how long to wait, and no JSON body, so a client that reads `code` from every error has nothing to read."),

        h2("3. Who is counted: per user, per IP, per client"),
        p("A rate limit protects something: the database from a flood, the grader from a learner who submits in a loop, the login endpoint from password guessing. The key you count by should match the thing you want to stop."),
        bullets([
            "**Per user** for authenticated endpoints. `POST /submissions` should allow each learner a fair amount, independent of who shares their network. Schools, offices, hotels and mobile carriers (carrier-grade NAT) put many people behind one IPv4 address.",
            "**Per IP** where you do not know the user yet: `POST /auth/login`, sign-up, password reset, anonymous catalog pages. For IPv6, count by prefix (a /64 is often one customer), or one client can rotate through millions of addresses.",
            "**Both, for login.** Per IP stops one machine trying many accounts; per account (the email) stops many machines trying one account.",
            "**Per client application or API key** for partner integrations, with limits written into the agreement.",
            "**A coarse per-IP limit at the edge only against floods**, set well above what a full classroom can produce (here: hundreds of requests per second, not 60 per minute). It protects the servers; it is not where fairness between learners is decided.",
        ]),
        callout("warning", "Behind a load balancer, req.ip may be the load balancer",
            "Express reports the address of the TCP peer. Behind a proxy that is the proxy, so a per-IP limit in the API puts every user in the world into one bucket. Set Express's trust proxy setting to the number of proxies you run (app.set(\"trust proxy\", 1) on a NestExpressApplication) so req.ip comes from X-Forwarded-For - and only then, because a client can write that header itself when no proxy overwrites it."),
        h3("When not to add a limit"),
        p("Not every endpoint needs its own limit. A per-user limit on a cheap, cached `GET /courses` mostly creates support tickets; the edge flood limit and caching already protect it. Start with the endpoints that are expensive (the grader, search, exports) or abusable (login, sign-up, anything that sends email), measure normal traffic per user, and set the limit several times above it."),

        h2("4. What the 429 says"),
        p("`429 Too Many Requests` is defined in RFC 6585. A useful 429 answers three questions for the client: **is this a rate limit**, **how long should I wait**, and **how much do I have left**."),
        numbered([
            "**The same error contract as every other error.** `Content-Type: application/problem+json` (RFC 9457) with the course's fields: `type`, `title`, `status`, a stable `code` such as `rate_limited`, a `detail` a person can read and the `traceId`. The client's existing error path then handles it.",
            "**`Retry-After`.** Defined in RFC 9110 for 429 and 503: a number of seconds (`Retry-After: 30`) or an HTTP-date. It is the one rate limit header every HTTP client library can be expected to understand. Send it on every 429.",
            "**The quota, for clients that want to slow down before they hit the wall.** This part is not standardised yet; see the callout below.",
        ]),
        code("text", `
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 30
RateLimit-Policy: "submissions";q=20;w=60
RateLimit: "submissions";r=0;t=30

{
  "type": "https://api.codedev.test/problems/rate-limited",
  "title": "Too many requests",
  "status": 429,
  "code": "rate_limited",
  "detail": "You can send 20 submissions per minute. Retry in 30 seconds.",
  "traceId": "4bf92f3577b34da6"
}`, "the 429 after the fix"),
        callout("info", "Rate limit header names are a draft: check before you copy",
            "The RateLimit-Policy and RateLimit fields above follow the IETF HTTPAPI draft draft-ietf-httpapi-ratelimit-headers (q = quota, w = window in seconds, r = remaining, t = seconds until the quota resets). The draft is not an RFC at the time of writing and its field names and syntax have changed between versions: earlier versions used RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset, and many APIs send their own X-RateLimit-* headers, where Reset is sometimes seconds and sometimes a Unix timestamp. Check the current version on datatracker.ietf.org, write down in your API documentation exactly which names and units you send, and keep Retry-After in any case - clients must not need the draft to know when to retry."),

        challenge("chal_quiz_adp_331"),

        h2("5. Worked example: limits in NestJS, problem+json at the edge"),
        p("Fairness between learners moves into the API, where the user is known. `@nestjs/throttler` provides a guard and a `@Throttle()` decorator; a small subclass changes the key from the IP to the user:"),
        code("typescript", `
// rate-limit/user-throttler.guard.ts
import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
    // signed-in requests are counted per learner, the rest per client IP (with trust proxy set)
    protected async getTracker(req: Record<string, any>): Promise<string> {
        return req.user?.id ? \`user:\${req.user.id}\` : \`ip:\${req.ip}\`;
    }
}

// app.module.ts: a generous default for every route (ttl is in milliseconds)
ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 300 }]);

// submissions.controller.ts: the grader is expensive, so a tighter limit here
@UseGuards(JwtAuthGuard, UserThrottlerGuard)          // auth first, so req.user is set
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Post()
create(@CurrentUser() user: User, @Body() dto: CreateSubmissionDto) {
    return this.submissions.create(user.id, dto);
}`, "user-throttler.guard.ts"),
        p("Guard order matters: if the throttler runs as a global guard before the auth guard, `req.user` is still empty and every learner falls back to the IP key - the incident again. When the limit is hit, the guard throws a `ThrottlerException` (status 429). Recent versions of `@nestjs/throttler` also set `Retry-After` and `X-RateLimit-*` headers on the response; header names have changed between versions, so check what your installed version sends with `curl -i`. The 429 body comes from the global exception filter you built in lesson 3, with one extra branch:"),
        code("typescript", `
// errors/problem-details.filter.ts (excerpt)
if (exception instanceof ThrottlerException) {
    const retryAfter = Number(res.getHeader("Retry-After") ?? 60);
    res.setHeader("Retry-After", String(retryAfter));
    return sendProblem(res, {
        type: "https://api.codedev.test/problems/rate-limited",
        title: "Too many requests",
        status: 429,
        code: "rate_limited",
        detail: \`Too many requests. Retry in \${retryAfter} seconds.\`,
        traceId,
    });
}`, "problem-details.filter.ts"),
        p("The edge keeps a flood limit, now set far above a classroom's traffic, and answers in the same format. nginx can return a fixed body from a named location:"),
        code("text", `
limit_req_zone $binary_remote_addr zone=flood:10m rate=50r/s;

server {
    location / {
        limit_req zone=flood burst=200 nodelay;
        limit_req_status 429;
        error_page 429 = @rate_limited;
        proxy_pass http://codedev_api;
    }
    location @rate_limited {
        default_type application/problem+json;
        add_header Retry-After 1 always;
        return 429 '{"type":"https://api.codedev.test/problems/rate-limited","title":"Too many requests","status":429,"code":"rate_limited","detail":"Too many requests from this network. Retry in 1 second."}';
    }
}`, "nginx.conf"),
        h3("Document the limits in OpenAPI"),
        p("A limit a client cannot read about is a limit it discovers in production. Describe the 429 once as a reusable response, reference it from every limited operation, and state the numbers in the operation's description:"),
        code("yaml", `
components:
  headers:
    Retry-After:
      description: Seconds to wait before sending another request.
      schema: { type: integer, minimum: 0 }
    RateLimit:
      description: >
        Remaining quota and seconds until it resets, as in draft-ietf-httpapi-ratelimit-headers
        (the draft version we follow is listed in the API changelog). Informational; rely on Retry-After.
      schema: { type: string }
      example: '"submissions";r=0;t=30'
  responses:
    TooManyRequests:
      description: Rate limit exceeded. Wait for Retry-After seconds before retrying.
      headers:
        Retry-After: { $ref: "#/components/headers/Retry-After" }
        RateLimit: { $ref: "#/components/headers/RateLimit" }
      content:
        application/problem+json:
          schema: { $ref: "#/components/schemas/Problem" }
paths:
  /submissions:
    post:
      summary: Submit code for grading
      description: Limited to 20 requests per minute per learner.
      responses:
        "201": { $ref: "#/components/responses/SubmissionCreated" }
        "429": { $ref: "#/components/responses/TooManyRequests" }`, "openapi.yaml"),

        h2("6. How clients should back off"),
        p("The server's half is a clear 429. The client's half is to believe it:"),
        code("typescript", `
// api/retry-delay.ts - how long to wait after a 429 or 503, or null to stop and tell the user
export function retryDelayMs(res: Response, attempt: number, now = Date.now(), random = Math.random): number | null {
    const header = res.headers.get("Retry-After");
    if (header !== null) {
        const ms = /^\\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now;
        if (Number.isFinite(ms)) return ms > 60_000 ? null : Math.max(0, ms);
    }
    if (attempt >= 3) return null;
    return random() * Math.min(10_000, 500 * 2 ** attempt);   // full jitter when the server gave no hint
}`, "retry-delay.ts"),
        bullets([
            "**Retry-After first.** When the server says 30 seconds, no request goes out for 30 seconds. Backoff is only the fallback when there is no header.",
            "**Jitter.** Forty-two clients that were refused at the same moment must not all come back at the same moment.",
            "**A cap, then the user.** A long wait is not something to do silently in the background: show \"You are submitting too fast - try again in 30 s\", disable the Run button with a countdown, and keep the learner's code.",
            "**Slow down before the wall.** A client that reads the remaining quota can space out background requests (autosave, polling) when it gets low, and keep the budget for the requests the learner is waiting for.",
            "**Only retry what is safe to retry.** A 429 means the request was not processed, so retrying a `POST` after it is safe; for any other uncertain failure, the idempotency key from lesson 7 is what makes a retry safe.",
        ]),

        h2("7. How to verify it"),
        bullets([
            "**Two users, one IP.** Repeat the loop from section 2 with two tokens from one machine: each learner must get their own 20 requests per minute, and the 21st request of one learner must not affect the other.",
            "**The shape of every 429.** `curl -i` against the API and against the edge: `application/problem+json`, `code: rate_limited`, a `Retry-After` header. Add the same check to the e2e suite with a test module whose limit is 2, so the test runs in milliseconds.",
            "**req.ip in production.** Log `req.ip` for a few requests after deploying: it must show client addresses, not the load balancer's.",
            "**The client.** A unit test with a fake response carrying `Retry-After: 30` and a fake clock: the client must not send anything for 30 seconds, and must stop and show the message when the header is larger than its cap.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Per-IP limits on authenticated endpoints.** A classroom, an office or a mobile carrier shares one budget. Spot it: in the 429 log, one IP with many user ids.",
            "**Counting the load balancer.** Without trust proxy, req.ip is the same for everyone and the limit is global. Spot it: every log line shows the same private address.",
            "**A 429 in a different format.** HTML from the proxy, plain text from a library, problem+json from the API. Spot it: `curl -i` the 429 of each layer and compare the Content-Type with your other errors.",
            "**No Retry-After, or a client that ignores it.** Clients guess, retry too soon, and keep the limit hit. Spot it: bursts of 429s from the same user less than a second apart.",
            "**Undocumented limits and units.** A header named Reset that is seconds in one API and a timestamp in another breaks clients that guess. Spot it: no 429 response and no numbers in the OpenAPI document.",
        ]),

        h2("9. Summary"),
        bullets([
            "Count by the identity you want to limit: per user for authenticated endpoints, per IP (and per account) before sign-in, and only a generous flood limit at the edge.",
            "A 429 follows the same problem+json contract as every other error, always carries Retry-After, and may add quota headers whose names come from a draft that you document precisely.",
            "Clients wait for Retry-After, add jitter, cap the wait and then tell the user; document every limit and its 429 response in OpenAPI.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 6585, Additional HTTP Status Codes: section 4 (429 Too Many Requests)",
            "RFC 9110, HTTP Semantics: section 10.2.3 (Retry-After) - rfc-editor.org/rfc/rfc9110",
            "RFC 9457, Problem Details for HTTP APIs - rfc-editor.org/rfc/rfc9457",
            "IETF HTTPAPI working group: RateLimit header fields for HTTP (draft-ietf-httpapi-ratelimit-headers) - check the current version and status on datatracker.ietf.org",
            "OpenAPI Specification 3.1: Response Object and Header Object - spec.openapis.org/oas/v3.1.0",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add UserThrottlerGuard to a NestJS app of your own, with a per-account and a per-IP limit on login, and write the e2e test with two users behind one IP. Then build the client side: a Run button that shows a countdown from Retry-After and a unit test for retryDelayMs with a fake clock."),
    ],
});
