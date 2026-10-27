// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-rdp-2-2",
    title: "Rate limits with Redis: fixed & sliding windows",
    slug: { _type: "slug", current: "rate-limits-redis-fixed-sliding-windows" },
    description:
        "A \"5 attempts per minute\" login limit let 9 password guesses through in under a second, because the attacker timed the burst around the window boundary. Learn what to key a limit on, how the fixed window (INCR + EXPIRE) works and where it leaks, how the sliding window log and the two-window sliding estimate fix it, how to answer 429 with Retry-After, and how to keep the counters atomic and self-cleaning.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev auth API (NestJS, Redis)",
        problem:
            "The security dashboard of https://api.codedev.test shows bursts of failed logins on POST /auth/login: one IP tries a password, waits almost a minute, then sends nine guesses in under one second, then waits again. The endpoint is protected by a rate limit of 5 attempts per 60 seconds per IP, and the logs show that it answered 401 (wrong password), not 429, to all nine guesses. Over a night the attacker tried thousands of passwords against a list of learner e-mails, and two weak passwords were found.",
    },

    content: [
        h2("1. The incident: a limit that resets at the wrong moment"),
        p("The login guard was written in an afternoon and has worked for months against careless scripts:"),
        code("typescript", `
// auth/login-rate-limit.guard.ts (as shipped)
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly redis: Redis) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const ip = ctx.switchToHttp().getRequest<Request>().ip;
    const key = \`rl:login:\${ip}\`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    if (count > 5) throw new HttpException("Too many login attempts", 429);
    return true;
  }
}`, "login-rate-limit.guard.ts"),
        p("This is a **fixed window**: the first request creates a counter that lives 60 seconds, every request increments it, and when the key expires the budget starts again from zero. It promises \"at most 5 requests per window\". It does not promise \"at most 5 requests in any 60 seconds\", and the attacker found the difference."),

        h2("2. Reproduce it and read the evidence"),
        p("The access log for one attacking IP, with the TTL of its counter added from `redis-cli TTL rl:login:203.0.113.7` at each step:"),
        code("text", `
10:00:00.000 POST /auth/login 401   counter 1, TTL 60  (window opens)
10:00:59.600 POST /auth/login 401   counter 2, TTL 1
10:00:59.700 POST /auth/login 401   counter 3, TTL 1
10:00:59.800 POST /auth/login 401   counter 4, TTL 1
10:00:59.900 POST /auth/login 401   counter 5, TTL 1
10:01:00.050 POST /auth/login 401   counter 1, TTL 60  (key expired at 10:01:00.000: new window)
10:01:00.150 POST /auth/login 401   counter 2
10:01:00.250 POST /auth/login 401   counter 3
10:01:00.350 POST /auth/login 401   counter 4
10:01:00.450 POST /auth/login 401   counter 5
10:01:00.550 POST /auth/login 429`, "access log, one IP"),
        p("Nine guesses between 10:00:59.600 and 10:01:00.450, all accepted by the limiter. Nothing is broken in the code: the attacker opened a window with one request, waited until it was about to close, spent the rest of its budget, and spent the whole next budget right after the reset. In the worst case a fixed window lets through about **2 x limit** requests in a short burst around each boundary."),
        p("You can watch the same thing with nothing but `redis-cli`, which is a good habit before changing a limiter:"),
        code("bash", `
$ redis-cli INCR rl:login:test
(integer) 1
$ redis-cli EXPIRE rl:login:test 60
(integer) 1
$ redis-cli TTL rl:login:test
(integer) 57
# ...wait until the TTL is 1, run INCR four times, then wait one more second:
$ redis-cli GET rl:login:test
(nil)                              # a fresh budget, whatever happened a second ago`, "terminal"),

        h2("3. Core idea: what you count, and over which window"),
        h3("Key the limit on what the attacker spends"),
        p("A rate limit is a budget per key. Picking the key is a security decision before it is a Redis one:"),
        bullets([
            "**Per IP** stops one machine from flooding the endpoint. It also limits everyone behind a shared address (a university NAT, a mobile carrier), so the limit must be generous enough for them.",
            "**Per account** (`user:<id>` or the normalised e-mail being tried) stops a distributed attack on one account from many IPs. Used alone it lets an attacker lock a real learner out by failing on purpose, so pair it with a per-IP limit and prefer delays over hard lockouts.",
            "**Both** is the usual answer for login: a request is allowed only if every limit that applies allows it.",
        ]),
        callout("warning", "A rate limit is one layer, not the defence",
            "Limits slow guessing down; they do not make weak passwords safe. Keep them alongside breached-password checks, multi-factor authentication and alerts on failed-login spikes. And decide in advance what happens when Redis is unreachable: failing open keeps logins working during an outage, failing closed protects accounts; for login, many teams fail open with a much smaller in-process limit as a fallback."),
        h3("Three algorithms and what each one costs"),
        bullets([
            "**Fixed window** - one counter per key: `INCR`, and `EXPIRE` when the counter is created. One key, two commands, trivial to read. Leaks up to 2 x limit at a boundary.",
            "**Sliding window log** - a sorted set per key with one member per request, scored by its timestamp: `ZREMRANGEBYSCORE` drops entries older than the window, `ZCARD` counts the rest, `ZADD` records the new one. Exact, but it stores every request: 1,000 allowed requests per window means 1,000 members per key.",
            "**Sliding window estimate** - two fixed-window counters aligned to the clock, the current and the previous one. The estimated count is the current counter plus the previous counter weighted by how much of the previous window still overlaps the last W seconds. Two small keys per caller, no boundary burst, and an error only when traffic inside a window is very uneven.",
        ]),
        p("The estimate in numbers, with a limit of 5 per 60 seconds. At 10:01:00.050 the attacker is 50 ms into the new window, which is empty; the previous window holds 5 requests, and 59.95 of its 60 seconds still overlap the last minute:"),
        code("text", `
estimate = previous * (W - elapsed) / W + current
         = 5 * (60000 - 50) / 60000 + 0  =  4.996
allowed only if estimate + 1 <= 5            ->  5.996 > 5: denied

At 10:01:15.000 (elapsed = 15000):
estimate = 5 * 45000 / 60000 + 0  =  3.75   ->  4.75 <= 5: allowed`, "sliding estimate"),
        p("The estimate assumes the previous window's requests were spread evenly over it. When they were bunched at its end, as here, the real number of requests in the last 60 seconds is higher than the estimate, so the estimate errs toward allowing. Right after the boundary the previous window still weighs almost 1, so the burst is stopped anyway; a limit that must be exact at every moment needs the log. Production implementations compare integers (multiply both sides by W) so that floating point never decides whether a request passes."),
        callout("info", "Token buckets",
            "A token bucket refills N tokens per second up to a maximum, and each request takes one. It deliberately allows a burst up to the bucket size and then a steady rate, which suits APIs better than logins. It needs the last refill time and the token count per key, updated atomically, usually in a Lua script."),

        challenge("chal_quiz_rdp_221"),

        h2("4. Worked example: counters that are atomic and clean up after themselves"),
        p("The shipped guard has a second, quieter bug. `INCR` and `EXPIRE` are two round trips. If the process crashes or the connection drops between them, the counter exists without a TTL and never expires: that IP or user is denied forever, and nobody notices until a learner writes to support. Three ways to close the gap:"),
        bullets([
            "Send both in one `MULTI`/`EXEC` transaction or in a Lua script, so Redis runs them together.",
            "Use `EXPIRE key seconds NX` (Redis 7.0 and later), which sets the expiry only if the key has none. Run after every INCR, it repairs a counter left without a TTL and never moves an existing expiry.",
            "Check `TTL key` after the INCR and set the expiry when it returns -1. This is what the challenge does, because the in-memory model has no transactions.",
        ]),
        code("text", `
-- fixed-window.lua: KEYS[1] = counter, ARGV[1] = limit, ARGV[2] = window seconds
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count > tonumber(ARGV[1]) then
  return {0, 0, redis.call('TTL', KEYS[1])}      -- denied: allowed, remaining, retry-after
end
return {1, tonumber(ARGV[1]) - count, 0}`, "fixed-window.lua"),
        p("Never call `EXPIRE` unconditionally on every request. It moves the end of the window forward each time, so a client that keeps sending requests, even slowly, keeps the counter alive and its count only grows."),
        h3("Answer like a good API"),
        p("A denied request should get `429 Too Many Requests` and a `Retry-After` header with the number of seconds to wait (RFC 9110 allows seconds or an HTTP date; seconds are easier for clients). Retry-After must be honest: for a fixed window it is the TTL of the counter; for a sliding estimate it is the time until the estimate has dropped enough, which can be longer than the end of the current window if the current window is already full."),
        code("typescript", `
// auth/login-rate-limit.guard.ts (sketch of the new version)
async canActivate(ctx: ExecutionContext): Promise<boolean> {
  const req = ctx.switchToHttp().getRequest<Request>();
  const res = ctx.switchToHttp().getResponse<Response>();
  const decisions = await Promise.all([
    this.limiter.sliding(\`ip:\${req.ip}\`, 20, 60),                        // generous: shared IPs
    this.limiter.sliding(\`user:\${normaliseEmail(req.body.email)}\`, 5, 60),
  ]);
  const denied = decisions.filter((d) => !d.allowed);
  if (denied.length === 0) return true;
  res.setHeader("Retry-After", String(Math.max(...denied.map((d) => d.retryAfter))));
  throw new HttpException("Too many login attempts", 429);
}`, "login-rate-limit.guard.ts"),
        p("The sliding counters need one more detail to stay small: each window key gets an expiry of two windows when it is created, which is exactly as long as it can still be the \"previous\" window. After that Redis removes it, so idle callers leave nothing behind."),

        h2("5. Build both limiters"),
        p("The challenge gives you the in-memory Redis model and a fake clock. Write `fixedWindow` and `slidingWindow` with the exact rules in the description: the key names, when to set the expiry, the integer arithmetic of the estimate and the Retry-After formula. The test runner sends the same request timeline to both limiters and prints their decisions side by side, so you can see the boundary burst pass one and stop at the other. The tests replay that burst, steady traffic, several keys, a counter left without a TTL by a crash and invalid configurations, and finally check that no key is left two windows after the last request."),
        challenge("chal_coding_rdp_222"),

        h2("6. How to verify a limiter"),
        bullets([
            "**Replay timelines on a fake clock.** A list of request times and the expected decisions is the whole specification of a limiter. Include the request just before and just after each boundary, and a denied request followed by one exactly at its Retry-After.",
            "**Check Retry-After against reality.** For every denied request in a test, send the same request at `now + retryAfter` and expect it to pass, and one second earlier and expect it to fail.",
            "**Look at the keys.** In staging, `redis-cli --scan --pattern 'rl:*' | head` and `redis-cli TTL <key>` on a few of them: every rate-limit key must have a TTL. A key with TTL -1 is a lockout waiting to happen.",
            "**Load test the boundary.** A script that sends limit requests just before a window ends and limit more just after must see the second group denied with a sliding limiter.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**EXPIRE on every request.** Spot it: an `expire` call with no condition next to `incr`. Steady traffic never lets the key expire.",
            "**INCR and EXPIRE not atomic.** Spot it: two awaits in a row with nothing tying them together; look for rate-limit keys with TTL -1.",
            "**A limit per process.** An in-memory counter in each of 6 API instances allows 6 x limit. Spot it: a `Map` of counters in a guard, and a load balancer in front.",
            "**Only one key for login.** Per-IP alone misses distributed guessing; per-account alone lets attackers lock learners out. Spot it: one limiter where the threat model needs two.",
            "**A Retry-After that lies.** Returning the end of the current window when the sliding estimate is still over the limit makes polite clients retry into another 429. Spot it: retry-after computed without the previous window.",
        ]),

        h2("8. Summary"),
        numbered([
            "Choose the key by what an attacker spends (IP, account, or both) and decide what happens when Redis is down before you choose an algorithm.",
            "A fixed window is one INCR and one EXPIRE per new counter, made atomic; it lets about twice the limit through around a boundary.",
            "A sliding window (a log in a sorted set, or the two-window estimate) removes the boundary burst; answer 429 with an honest Retry-After and let every counter expire on its own.",
        ]),

        h2("Sources"),
        bullets([
            "Redis documentation: INCR (the rate limiter pattern), EXPIRE (NX/XX/GT/LT options since Redis 7.0), sorted sets - redis.io/docs/latest/develop/data-types/",
            "RFC 6585, section 4: 429 Too Many Requests; RFC 9110, section 10.2.3: Retry-After",
            "OWASP Authentication Cheat Sheet: protect against automated attacks (rate limits, account lockout trade-offs)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Implement the sliding window log with a sorted set (ZREMRANGEBYSCORE, ZCARD, ZADD in one Lua script) and run the same timelines through it; compare its decisions and its memory per key with the two-window estimate. Then write down your login limits (per IP and per account), what the client shows on 429, and what the API does when Redis is unreachable."),
    ],
});
