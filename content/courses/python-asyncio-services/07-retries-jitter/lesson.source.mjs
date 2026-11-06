// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-3-1",
    title: "Retries with backoff and jitter",
    slug: { _type: "slug", current: "asyncio-retries-backoff-jitter" },
    description:
        "A five-minute payment gateway outage turned into twenty because Rice Rocket's 300 pollers retried in lockstep every second. Learn which failures deserve a retry, exponential backoff with full jitter, Retry-After, deadlines, and why a retry loop must never swallow cancellation.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The order-status poller checks pending card payments with the gateway every few seconds, one coroutine per order. When the gateway went down at 19:02, every poller retried once a second; when it came back, 300 requests arrived in the same millisecond and it fell over again, four times in a row.",
    },

    content: [
        h2("Situation"),
        p("The helper every poller used:"),
        code("python", `
async def call_with_retry(call):
    for _ in range(5):
        try:
            return await call()
        except Exception:
            await asyncio.sleep(1)`, "poller/retry.py"),
        code("text", `
19:07:00.004 gateway: 503 x 300   (all pollers, same second)
19:07:01.006 gateway: 503 x 300
19:07:02.009 gateway: back up -> 300 requests in 12 ms -> overloaded -> 503 x 300
19:07:02.011 poller: order 81723 failed: HTTP 400 order not found (attempt 5/5)
19:09:40.120 poller: request for order 80111 cancelled by client ... still calling gateway`, "logs"),
        bullets([
            "A fixed one-second delay kept all 300 pollers synchronized: each retry was a wave.",
            "`except Exception` retried `400 order not found` four more times; it will never succeed.",
            "Nothing looked at the clock: requests whose caller had given up long ago still retried.",
        ]),

        h2("The core you need"),
        bullets([
            "**Retry only what can succeed later.** Timeouts, connection resets and 429/502/503/504 are transient; 400, 401, 403, 404 and 422 are answers. Retrying a POST is only safe with an idempotency key (the gateway's `Idempotency-Key` header).",
            "**Exponential backoff with full jitter.** Wait `random.uniform(0, min(cap, base * 2 ** attempt))`. The exponential part backs off from a struggling service; the random part spreads clients apart so they stop arriving in waves (AWS's \"Exponential Backoff and Jitter\" article compares the variants).",
            "**Retry-After wins.** A 429 or 503 with `Retry-After` tells you when to come back; use it as the minimum wait.",
            "**A deadline bounds everything.** Compute the give-up time once; before each sleep, check that the wait still fits. A retry that lands after the caller gave up is pure load.",
            "**Never retry cancellation.** `asyncio.CancelledError` derives from `BaseException`, so `except Exception` lets it through; `except BaseException` or a bare `except:` swallows it and the task keeps running after its request was cancelled.",
            "**Libraries.** `tenacity` (`stop_after_delay`, `wait_random_exponential`, `retry_if_exception_type`) and httpx transports implement the same rules; know them before configuring one.",
        ]),

        h2("Apply it in the project"),
        code("python", `
RETRYABLE_STATUS = {429, 502, 503, 504}

async def call_with_retry(call, *, attempts, base, cap, deadline, rng=random):
    loop = asyncio.get_running_loop()
    give_up_at = loop.time() + deadline
    last = None
    for attempt in range(attempts):
        try:
            return await call()
        except (TimeoutError, ConnectionError) as error:
            last, retry_after = error, None
        except HTTPError as error:
            if error.status not in RETRYABLE_STATUS:
                raise                              # an answer, not a failure
            last, retry_after = error, error.retry_after
        if attempt == attempts - 1:
            break
        delay = rng.uniform(0, min(cap, base * 2 ** attempt))
        if retry_after is not None:
            delay = max(delay, retry_after)
        if loop.time() + delay > give_up_at:
            break
        await asyncio.sleep(delay)
    raise last`, "poller/retry.py"),
        callout("info", "Pass the random generator in",
            "Taking `rng` as a parameter lets tests use `random.Random(seed)` and assert exact retry times, while production uses the module-level generator."),

        h2("Verify"),
        code("bash", `
python -m poller.simulate --clients 300 --outage 5s
# all 300 orders confirmed in 12.4 s; 92 calls in the first second after recovery (was 300)
python -m poller.simulate --status 400
# order 81723: HTTP 400 order not found after 1 call`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Retries at every layer.** The client library retries 3 times, the helper 5 times and the job runner 3 times: 45 calls per failure. Detect it by counting gateway calls per order id; retry in one layer only.",
            "**Jitter with a shared seed.** `random.Random(42)` created per poller gives every poller the same sequence: they stay in lockstep. Seed per client, or use the shared module generator.",
            "**Deadline from the wrong clock.** `time.time()` jumps with NTP corrections; use `loop.time()` (monotonic) for deadlines.",
        ]),

        p("Now repair the helper. The editor holds `retry.py` with the repaired helper's key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. The wrong pieces are the old helper's code. Run plays single calls, a 300-poller outage and a cancelled request on asyncio's clock."),
        challenge("chal_coding_pas_172"),
    ],
});
