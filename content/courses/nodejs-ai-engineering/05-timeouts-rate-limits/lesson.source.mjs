// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nae-2-2",
    title: "Timeouts, rate limits & provider fallback",
    slug: { _type: "slug", current: "timeouts-rate-limits-provider-fallback" },
    description:
        "During a 45-minute provider slowdown the CodeDev Hint button spun for up to a minute, learners clicked it again and again, and the extra calls ran into the provider's rate limit. Learn to give every model call a timeout and every hint request an overall deadline, to honour 429 and Retry-After without waiting past that deadline, to stop calling a failing provider with a circuit breaker and switch to a secondary model or a static hint, to make retries and double clicks idempotent, and to tell the learner honestly what is happening while the feature is degraded.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the CodeDev AI hint feature",
        problem:
            "Tuesday 19:40-20:25, the busiest hour of the evening cohort. The model provider's status page later called it \"elevated latency\". On CodeDev the Hint button spun for 30 to 60 seconds; learners clicked it again, or reloaded the lesson and clicked again. POST /hints traffic tripled, the provider started answering 429, and the hint service, which kept every slow call open, ran out of sockets and slowed down the run-tests endpoint that shares its process. Nobody got a hint for 45 minutes, and nobody was told why.",
    },

    content: [
        h2("1. The incident: a slow dependency with no limits"),
        p("The hint route after lesson 2.1 retries transient errors, repairs invalid output and always ends with a hint or a fallback. It still has no notion of time:"),
        code("typescript", `
// hints/gateway.ts (current)
export function complete(messages: Message[]): Promise<Reply> {
  return provider.chat({ model: HINT_MODEL, messages });   // no timeout, no signal
}`, "gateway.ts"),
        p("When the provider is fast, nobody notices. When it slows down, every open hint request holds a socket, a bit of memory and a learner staring at a spinner, for as long as the provider takes. Many SDKs and HTTP clients have a default timeout, but it is often minutes long and differs between libraries and versions: check what yours does instead of assuming."),
        h3("The evidence"),
        code("text", `
time    POST /hints  p50 hint   p99 hint   open provider calls  provider 429s  fallbacks
19:30   410/min      2.1 s      6.8 s       12                   0              4
19:45   1,240/min    31.0 s     58.2 s      470                  0              9
20:00   1,310/min    44.5 s     >60 s       512 (socket limit)   220/min        14
20:15   1,180/min    40.2 s     >60 s       512 (socket limit)   310/min        11
20:30   430/min      2.3 s      7.1 s       15                   0              5`, "hint service dashboard, Tuesday evening"),
        code("text", `
20:01:12.004 hint req=h_a1f0 user=u_2210 call=1 started
20:01:52.910 web  POST /hints req=h_a1f0 client closed the connection after 40 s
20:01:58.317 hint req=h_b77c user=u_2210 call=1 started          <- same learner, same challenge
20:02:41.660 hint req=h_a1f0 user=u_2210 call=1 status=200 after 89.6 s (nobody waiting)
20:02:44.120 hint req=h_b77c user=u_2210 call=1 status=429 error=rate_limit_exceeded retry-after=30`, "hint service log, one learner"),
        p("Three lessons hide in these two pieces:"),
        bullets([
            "**Waiting is not free.** Open provider calls went from 12 to the socket limit of 512. The hint service did not crash; it just had no room left, and the run-tests endpoint in the same process slowed down with it.",
            "**Users retry for you.** POST /hints tripled while the number of learners online did not: the same learner sent `h_a1f0` and then `h_b77c` for the same challenge. Every new click added a provider call while the old one was still running.",
            "**Load turns into rate limits.** The 429s started only after the extra clicks. The provider limits requests and tokens per minute for your account, and a slowdown plus duplicate requests reaches that limit quickly.",
        ]),

        h2("2. A timeout per call, a deadline per request"),
        p("Two different limits answer two different questions:"),
        bullets([
            "**The per-call timeout** asks: how long can one model call take before we treat it as failed? Set it from measured latency of healthy calls, above the slow but normal case. For this hint (a short JSON answer, no streaming) p99 is about 7 s, so 10 s is a sensible limit. A timeout below normal slow calls turns healthy calls into retries and adds load.",
            "**The overall deadline** asks: how long can the learner wait for this hint at all, retries and fallbacks included? That is a product decision. For CodeDev it is 8 s from the click: after that a static hint is more useful than a spinner.",
        ]),
        p("Each attempt gets the smaller of the two: its own timeout, or the time left before the deadline. And a retry that cannot finish before the deadline is not started at all."),
        code("typescript", `
const HINT_DEADLINE_MS = 8_000;
const CALL_TIMEOUT_MS = 10_000;
const MIN_USEFUL_MS = 1_500;   // shorter than this, a call almost never succeeds: do not start it

function attemptSignal(deadlineAt: number, now: number): AbortSignal | null {
  const left = deadlineAt - now;
  if (left < MIN_USEFUL_MS) return null;                       // degrade instead
  return AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, left));
}`, "deadline.ts"),
        p("`AbortSignal.timeout(ms)` aborts by itself after `ms` milliseconds, and an aborted `fetch` rejects with a `DOMException` named `TimeoutError`. Pass the signal down through your gateway to whatever HTTP client or SDK you use; most accept a signal or a timeout option. In tests, inject the clock and the timeout instead of waiting for real time."),
        callout("warning", "A timeout stops your waiting, not the provider's work",
            "When you abort a call, the request may already be running on the provider's side. It can finish, and the tokens it used can show up in your usage and on the bill. How cancelled requests are counted depends on the provider: check its documentation, and compare your own call log with its usage export once. A retry after a timeout is therefore not free."),

        h2("3. 429 and Retry-After: the provider's limits"),
        p("Providers limit how much one account (or one API key, or one project) can send: usually requests per minute and tokens per minute, sometimes requests per day, often different per model. When you go over, they answer **429 Too Many Requests**. The response often says how long to wait: the standard `Retry-After` header (a number of seconds, or an HTTP date) and, with many providers, extra headers about the remaining quota and when it resets. Their names differ between providers: read yours from the API reference, not from a blog post."),
        code("typescript", `
/** Retry-After as milliseconds from now, or null when absent or unreadable. */
function retryAfterMs(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  if (/^\\d+$/.test(header.trim())) return Number(header) * 1000;    // "20"
  const at = Date.parse(header);                                     // "Tue, 27 Oct 2026 19:02:41 GMT"
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

// in the retry decision for a 429
const waitMs = retryAfterMs(res.headers.get("retry-after"), clock.now()) ?? backoffMs(attempt);
if (clock.now() + waitMs + MIN_USEFUL_MS > deadlineAt) return degrade("rate limited");
await clock.sleep(waitMs);`, "retryAfter.ts"),
        p("Honouring Retry-After means **not calling before** that time. It does not mean the learner has to wait for it: if the wait does not fit in the deadline, degrade now. Calling earlier anyway is worse than useless: it usually gets another 429, and some providers count rejected requests against the limit too."),
        p("Your own side needs a limit as well. A small concurrency limit on provider calls (for example at most 50 in flight for the hint service) keeps one slow minute from filling every socket, and per-user limits (lesson 3.3) keep one learner, or one bug, from using the account's whole quota."),

        h2("4. Stop calling a provider that is failing: a circuit breaker"),
        p("During the incident every hint request went to a provider that had been failing for twenty minutes, waited its full timeout and then failed. A **circuit breaker** remembers recent failures and, after too many, stops sending calls for a while:"),
        bullets([
            "**Closed** (normal): calls go through; failures are counted.",
            "**Open**: after, say, 5 transient failures within 30 s, calls are not sent at all for a cool-down of 60 s. Requests go straight to the next option, in milliseconds instead of after a timeout.",
            "**Half-open**: after the cool-down, a trial call is allowed. Success closes the breaker; failure opens it again for another cool-down.",
        ]),
        code("typescript", `
type Clock = { now(): number };

export class CircuitBreaker {
  private failures: number[] = [];          // times of recent transient failures
  private openedAt: number | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly threshold = 5,         // 5 failures ...
    private readonly windowMs = 30_000,     // ... within 30 s open the breaker
    private readonly coolDownMs = 60_000,   // then skip this provider for 60 s
  ) {}

  state(): "closed" | "open" | "half-open" {
    if (this.openedAt === null) return "closed";
    return this.clock.now() - this.openedAt < this.coolDownMs ? "open" : "half-open";
  }

  allows(): boolean {
    return this.state() !== "open";        // production: let only one trial call through when half-open
  }

  success(): void {
    this.failures = [];
    this.openedAt = null;
  }

  failure(): void {
    const now = this.clock.now();
    if (this.state() === "half-open") {     // the trial failed: open again
      this.openedAt = now;
      return;
    }
    this.failures = [...this.failures.filter((t) => now - t < this.windowMs), now];
    if (this.failures.length >= this.threshold) this.openedAt = now;
  }
}`, "circuitBreaker.ts"),
        p("Count only failures that say something about the provider's health: timeouts, 429, 5xx. A 400 caused by one oversized prompt or a 401 after a key rotation should not open the breaker for everyone (the 401 needs an alert instead). Keep one breaker per provider and model, and expose its state on your dashboard: \"the breaker opened at 19:47\" is the fastest incident summary you will ever get."),
        callout("info", "When not to bother",
            "A breaker is worth it when a dependency can be slow or down for minutes and you have something better to do than wait: a secondary model, a static answer. With one provider and a short deadline, the deadline alone already bounds the damage; add the breaker when the logs show many requests waiting out their full timeout during an outage."),

        h2("5. Fallback: a secondary model, then a static hint"),
        p("With the breaker open, where does the request go? A chain, from best to always-available:"),
        numbered([
            "**The primary model**, if its breaker allows and the deadline leaves enough time.",
            "**A secondary model**: another model of the same provider (often smaller and faster), or a model of a second provider. It is worth adding only if it is tested: run the same prompt version (lesson 1.2) against it in your evals, keep the same validateHint() gate, and expect different answers, a different cost per token and different limits.",
            "**The static hint** of the learner's current level from `challenge.challenge_hints`. It is always there, costs nothing and never times out.",
        ]),
        code("typescript", `
async function hintWithFallback(req: HintRequest, deps: Deps): Promise<HintResult> {
  const deadlineAt = deps.clock.now() + HINT_DEADLINE_MS;
  for (const p of [deps.primary, deps.secondary]) {
    if (!p.breaker.allows()) continue;                         // open: skip in a millisecond
    const signal = attemptSignal(deadlineAt, deps.clock.now());
    if (!signal) break;                                        // no time left for a useful call
    try {
      const result = await p.getHint(req, signal);             // retry + repair from lesson 2.1
      p.breaker.success();
      return { ...result, provider: p.name };
    } catch (err) {
      if (isProviderHealthError(err)) p.breaker.failure();     // timeouts, 429, 5xx only
      deps.log.warn("hint provider failed", { req: req.id, provider: p.name, err: String(err) });
    }
  }
  return { source: "fallback", hint: await deps.staticHint(req.challengeId, req.level), provider: "static" };
}`, "hintWithFallback.ts"),
        callout("warning", "A second provider is a second data processor",
            "The hint prompt contains the learner's code. Sending it to another company is a new data flow: it needs the same review as the first provider (terms, data retention, region, what your privacy notice says). \"We added a fallback during an outage\" is not a reason to skip that review."),

        h2("6. Idempotency: one click, one hint"),
        p("Retries are safe only when doing something twice has the same effect as doing it once. A model call is not like that: every call is a new answer and new tokens. So make the **hint request** idempotent instead, at the level where the duplicates come from:"),
        bullets([
            "**The browser** disables the Hint button while a request is in flight and sends an idempotency key with it: one key per click, reused by the client's own retries.",
            "**The hint service** keeps the key with the in-flight request and then with the result for a few minutes. A second request with the same key waits for, or returns, the first result instead of calling the model again.",
            "**The quota** (lesson 3.3) is charged once per key, and only for a hint that came from the model.",
        ]),
        code("typescript", `
const inFlight = new Map<string, Promise<HintResult>>();

// shortcut: one process only; with several instances keep the key and the result in Postgres or Redis
export function hintOnce(key: string, run: () => Promise<HintResult>): Promise<HintResult> {
  const existing = inFlight.get(key);
  if (existing) return existing;                // the double click joins the first request
  const pending = run().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}`, "hintOnce.ts"),
        p("In the incident log, `h_a1f0` and `h_b77c` were the same learner asking for the same hint. With one key for \"this learner, this challenge, this submission, this level\", the second click would have joined the first request instead of adding a call."),

        challenge("chal_quiz_nae_221"),

        h2("7. What the learner sees while degraded"),
        p("Degraded is a normal state, not an error. Design it on purpose:"),
        bullets([
            "**A visible limit.** The button shows progress, and after the deadline the learner gets an answer. No spinner lasts longer than the deadline.",
            "**An honest label.** \"AI hints are busy right now - here is the standard hint for this level\" is better than a generic error and much better than a silent swap.",
            "**No penalty.** A fallback hint should not use up an AI hint for the day, and it should not count as opening a static hint level for the EXP rules: the learner did not choose it.",
            "**One message for everyone.** When the breaker is open, the route returns `degraded: true` and the lesson page shows a small banner, so learners stop clicking again and again.",
        ]),

        h2("8. How to verify"),
        bullets([
            "**Fake-clock tests for the deadline.** A fake provider that never answers: the request must end at the deadline with the fallback, and the number of calls must match your plan. A 429 with Retry-After 30 and 3 s left: no second call, fallback at once.",
            "**Breaker tests.** Five timeouts in 30 s on the fake clock open it; a call during the cool-down is not sent; after 60 s one trial goes through; a success closes it.",
            "**A chaos run in staging.** Put a delay in front of the fake provider (or block it) and click Hint in two tabs: you should see the fallback within 8 s, one provider call per key, the banner, and the breaker state change on the dashboard.",
            "**Production dashboards.** p99 hint latency never above the deadline, open provider calls well under the socket limit, fallback share and breaker state as their own panels, and an alert when the fallback share stays high for 10 minutes.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**A timeout per call and no deadline.** Three attempts of 10 s plus backoff is more than 30 s. Spot it: the worst case of the retry loop is longer than what the product promised.",
            "**Waiting out Retry-After while the learner waits.** Spot it: a sleep with no check against the time left.",
            "**Counting every error as a provider failure.** A burst of 400s from one bad prompt opens the breaker for everyone. Spot it: `catch (err) { breaker.failure(); }` with no classification.",
            "**A secondary model nobody has tested.** It answers, but in a different format or with worse hints. Spot it: the secondary is not in the eval suite or the prompt version tests.",
            "**No idempotency key.** Double clicks and client retries become extra paid calls. Spot it: two provider calls for one learner and one challenge within seconds in the log.",
        ]),

        h2("10. Summary"),
        numbered([
            "Every model call has a timeout set from measured latency, and every hint request has an overall deadline; attempts get the time left, and no retry starts that cannot finish.",
            "Honour 429 and Retry-After by not calling early, degrade when the wait does not fit the deadline, and use a circuit breaker to stop calling a failing provider and move to a tested secondary model or the static hint.",
            "Make the hint request idempotent with a key per click, and design the degraded state the learner sees: a limit, an honest label, no penalty.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics: section 10.2.3 (Retry-After) - rfc-editor.org/rfc/rfc9110",
            "RFC 6585, Additional HTTP Status Codes: section 4 (429 Too Many Requests)",
            "MDN Web Docs: AbortSignal.timeout() and AbortSignal.any()",
            "OWASP Top 10 for Large Language Model Applications: unbounded consumption - owasp.org/www-project-top-10-for-large-language-model-applications",
            "Your provider's API reference: rate limits, rate-limit headers, error codes and how cancelled requests are counted (check the current version)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the degraded-mode spec for the CodeDev Hint button in half a page: the deadline, the fallback chain, the exact text of the label and the banner, what is and is not charged to the learner, and the three dashboard panels on-call looks at first. Then add a half-open rule to the CircuitBreaker above that lets only one trial call through at a time, with a fake-clock test."),
    ],
});
