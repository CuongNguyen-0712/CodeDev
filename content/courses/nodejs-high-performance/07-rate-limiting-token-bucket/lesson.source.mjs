// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-3-1",
    title: "Rate limiting with token buckets",
    slug: { _type: "slug", current: "rate-limiting-token-buckets" },
    description:
        "One merchant's retry loop floods the payment API and every other merchant starts timing out. Learn why a fixed-window counter lets twice the limit through, build a token bucket with an injected clock, answer with 429 and Retry-After, and share the limit across instances with Redis.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, payments platform of an e-commerce marketplace",
        problem:
            "Black Friday, 20:00. A large merchant deploys a checkout plugin with a bug: when POST /payments is slow it retries immediately, in a tight loop, from 40 servers. Within two minutes that one API key produces 70% of the traffic. The database connection pool is exhausted, p99 latency for every other merchant goes from 180 ms to 9 s, and the on-call engineer has to block the key by hand. The postmortem action item: per-merchant rate limits that protect everyone else automatically.",
    },

    content: [
        h2("1. The incident"),
        p("Nothing in the payment API was broken. Every request was valid, authenticated and handled correctly - there were just far too many of them from one client. Capacity is shared: the connection pool, the CPU and the downstream card processor do not care which merchant a request belongs to, so one noisy client degrades all of them."),
        p("A **rate limiter** caps how much work one key (an API key, a merchant, a user, an IP) can request per unit of time and rejects the excess cheaply - before it touches the database. Done well it turns \"everyone is slow\" into \"one client gets `429 Too Many Requests` and everyone else is fine\"."),
        bullets([
            "**Choose the key deliberately.** Limit per API key or merchant for business fairness; add a coarser per-IP limit in front for unauthenticated endpoints like login.",
            "**Reject early.** The limiter runs before body parsing and database access, so a rejected request costs microseconds.",
            "**Different routes, different budgets.** Reading a payment status is cheap; creating a payment or a bulk payout is expensive and gets a tighter limit.",
        ]),
        callout("info", "Rate limiting is not load shedding",
            "A rate limiter enforces a per-client contract (\"100 payments per minute per merchant\"). Load shedding protects the server as a whole when it is overloaded, regardless of who is asking. You usually want both; this lesson is about the first."),

        h2("2. Fixed windows and the boundary burst"),
        p("The first limiter most teams write is a counter per key per minute:"),
        code("javascript", `
async function fixedWindowAllow(redis, apiKey, limit = 100) {
    const minute = Math.floor(Date.now() / 60000);
    const key = \`ratelimit:\${apiKey}:\${minute}\`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    return count <= limit;
}`, "fixedWindow.js"),
        p("It is cheap - one counter per key - and easy to reason about. But the window has hard edges. Think about what the counter remembers one millisecond after 12:01:00."),
        challenge("chal_quiz_nhp_301"),
        p("There are two common fixes:"),
        bullets([
            "**Sliding window log**: store a timestamp per request (a Redis sorted set) and count the ones in the last 60 seconds. Exact, but memory grows with the limit.",
            "**Sliding window counter**: keep the current and previous window counters and estimate `previous * overlap + current`. Cheap and close enough for most APIs.",
        ]),
        p("Both answer \"how many requests in the last minute?\". For payment APIs there is often a better question: \"how big a burst may this client send, and how fast may it go on average?\" That is exactly what a token bucket expresses."),

        h2("3. The token bucket"),
        p("Picture a bucket that holds up to `capacity` tokens and is refilled at a steady `refillPerSecond`. Every request takes one token (or more for expensive operations). If there are not enough tokens, the request is rejected and nothing is taken."),
        bullets([
            "`capacity` is the **burst** you tolerate: a client that was idle may send this many requests at once.",
            "`refillPerSecond` is the **sustained rate**: over a long period nobody can exceed it, no matter how requests are timed.",
            "The bucket never holds more than `capacity`, so idling for an hour does not earn an hour of burst.",
        ]),
        image("fixed-window-vs-token-bucket", {
            alt: "Two timelines of the same 200-request burst. The fixed window accepts 100 on each side of the 12:01:00 boundary; the token bucket accepts 100, empties, and rejects the next 100 with 429 while it slowly refills.",
            caption: "The fixed window resets at the boundary and lets 200 through. The bucket remembers it was just emptied.",
        }),
        h3("No timers: refill lazily"),
        p("You do not need a timer that adds tokens every few milliseconds. Store two numbers per key - the token count and the time you last looked - and on each request add the tokens earned since then:"),
        code("javascript", `
// tokens earned since the last request, never above capacity
const elapsedMs = current - lastRefillAt;
tokens = Math.min(capacity, tokens + elapsedMs * refillPerSecond / 1000);
lastRefillAt = current;`),
        p("When a request is denied, the same arithmetic tells the client exactly how long to wait: the missing tokens divided by the refill rate."),
        callout("tip", "Inject the clock",
            "Take the current time from a now() function passed in, not from Date.now() inside the limiter. Tests can then replay a timeline in microseconds, and you can reason about edge cases (exact boundaries, long idle periods) without sleeping."),
        challenge("chal_coding_nhp_302", "Keep two pieces of state: the token count and the time of the last call. Refill first, then decide. A denied request must not consume anything."),

        h2("4. Telling the client to slow down: 429 and Retry-After"),
        p("A rejection is part of your API contract. Return `429 Too Many Requests` with a `Retry-After` header (in seconds) so well-behaved clients back off instead of hammering you, and include the standard rate limit headers so they can pace themselves before hitting the wall."),
        code("javascript", `
function rateLimit(limiterFor) {
    return (req, res, next) => {
        const bucket = limiterFor(req.auth.merchantId, req.route.path);
        const cost = req.route.path === "/payouts/bulk" ? 10 : 1;
        const { allowed, retryAfterMs } = bucket.take(cost);

        if (allowed) return next();

        res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
        res.status(429).json({ error: "RATE_LIMITED", retryAfterMs });
    };
}`, "middleware/rateLimit.js"),
        bullets([
            "Round `Retry-After` **up**: telling a client to retry 0 seconds later just produces another 429.",
            "Never count a 429 as a failure in your own circuit breaker or retry logic - it is the system working as designed.",
            "Clients should combine `Retry-After` with jittered backoff so that thousands of rejected clients do not all come back in the same millisecond.",
        ]),
        callout("warning", "Do not rate limit retries of the same payment twice",
            "If a client retries a payment with the same Idempotency-Key, the replayed response is cheap. Some teams apply the limiter after the idempotency lookup so a replay never burns a token - decide this explicitly rather than by accident."),

        h2("5. One limit, many instances: Redis"),
        p("An in-memory bucket per process is fine for a single instance. Behind a load balancer with six instances, each one keeps its own bucket and the client effectively gets six times the limit. The state has to be shared, and the read-refill-write must be **atomic** - otherwise two instances can read the same token count and both spend the last token (the same read-modify-write race from lesson 1.1)."),
        p("The simplest shared limiter is the fixed-window counter from section 2. Its two commands look harmless:"),
        challenge("chal_quiz_nhp_303"),
        p("For a token bucket, put the whole read-refill-decide-write sequence in one Lua script. Redis runs a script without interleaving other commands, so it is atomic across all instances:"),
        code("lua", `
-- KEYS[1] = bucket key, ARGV = capacity, refill_per_ms, now_ms, cost
local capacity = tonumber(ARGV[1])
local rate     = tonumber(ARGV[2])
local now      = tonumber(ARGV[3])
local cost     = tonumber(ARGV[4])

local state  = redis.call("HMGET", KEYS[1], "tokens", "ts")
local tokens = tonumber(state[1]) or capacity
local ts     = tonumber(state[2]) or now

tokens = math.min(capacity, tokens + (now - ts) * rate)
local allowed = tokens >= cost
if allowed then tokens = tokens - cost end

redis.call("HSET", KEYS[1], "tokens", tokens, "ts", now)
redis.call("PEXPIRE", KEYS[1], math.ceil(capacity / rate) * 2)
return { allowed and 1 or 0, tostring(tokens) }`, "token_bucket.lua"),
        bullets([
            "**One round trip** per request: load the script once with `SCRIPT LOAD` and call it with `EVALSHA`.",
            "**Expire idle buckets.** A full bucket carries no information, so `PEXPIRE` lets Redis forget keys that have been quiet for a while.",
            "**Clock source.** Pass `now` from the application only if your instances' clocks are well synchronized; otherwise read `redis.call(\"TIME\")` inside the script so one clock decides.",
            "**Decide on failure mode.** If Redis is down, most payment APIs fail open (allow, with an alert) for reads and fall back to a conservative local limit for writes.",
        ]),

        h2("6. Checklist"),
        bullets([
            "Pick the limit key (merchant, API key, user, IP) and a budget per route; expensive operations cost more tokens.",
            "Avoid plain fixed windows when bursts matter: they allow up to 2x the limit around a boundary.",
            "Token bucket: `capacity` = allowed burst, `refillPerSecond` = sustained rate; refill lazily and cap at capacity.",
            "Reject with `429` and a rounded-up `Retry-After`; never consume tokens for a denied request.",
            "Shared limits across instances need atomic updates: one Lua script, or INCR and EXPIRE in the same script or MULTI.",
            "Inject the clock so limiter edge cases are tested deterministically.",
        ]),
    ],
});
