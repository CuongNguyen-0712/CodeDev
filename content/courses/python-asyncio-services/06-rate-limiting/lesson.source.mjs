// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-2-3",
    title: "Rate limiting with a token bucket",
    slug: { _type: "slug", current: "asyncio-rate-limiting-token-bucket" },
    description:
        "Rice Rocket's SMS worker fired a whole lunch batch at a provider that allows 20 requests per second, got a storm of 429s and had its account blocked. Learn why a semaphore and a per-task sleep do not limit a rate, how a shared token bucket does, and how to honour Retry-After for the whole worker.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The notification worker (an asyncio service next to the FastAPI api) texts customers when a courier picks up their order. The SMS provider allows 20 requests per second with bursts of 40 and blocks the account after too many rejected requests. At 12:05 one batch of 400 messages went out in under a second.",
    },

    content: [
        h2("Situation"),
        p("The worker already used a semaphore, so the team believed it was \"limited to 20\":"),
        code("python", `
sem = asyncio.Semaphore(20)

async def send_one(sms):
    async with sem:
        return await client.post("/v1/sms", json=sms)   # about 50 ms each

async def send_batch(batch):
    async with asyncio.TaskGroup() as tg:
        for sms in batch:
            tg.create_task(send_one(sms))`, "worker/sms.py"),
        code("text", `
12:05:02.114 provider: 412 requests in the last second, limit 20/s (burst 40) -> 429
12:05:02.160 sms-1187 429 Retry-After: 1
12:05:02.161 sms-1188 429 Retry-After: 1
...
12:05:04.020 provider: account rate-limited for 10 minutes`, "worker log"),
        bullets([
            "The semaphore kept 20 requests in flight; at 50 ms each that is about 400 per second.",
            "A first fix added `await asyncio.sleep(1 / 20)` at the top of `send_one`: all tasks slept together and the burst simply started 50 ms later.",
            "Every task retried its own 429 at once, so the rejections multiplied until the provider blocked the account.",
        ]),

        h2("The core you need"),
        bullets([
            "**Concurrency is not rate.** A semaphore limits how many calls run at the same moment; a rate limit counts how many start per unit of time. Fast responses turn a small concurrency into a large rate.",
            "**A token bucket models the provider.** It holds up to `capacity` tokens and gains `rate` tokens per second. Each request takes one token; with none left, the caller waits `(1 - tokens) / rate` seconds for the next. The capacity is the burst you may send after a quiet period, never more.",
            "**One limiter, shared and serialized.** Every task asks the same bucket, and an `asyncio.Lock` around the take-or-wait step makes callers queue one after another. A sleep inside each task only shifts the whole burst.",
            "**Measure time with the loop's clock.** `asyncio.get_running_loop().time()` is monotonic; wall-clock time can jump when NTP adjusts it.",
            "**Retry-After is about the provider, not one request.** Record it in the shared limiter (`paused_until`) so every sender stops until it ends, then resend the rejected message.",
            "**Libraries do the same.** `aiolimiter.AsyncLimiter(max_rate, time_period)` is a leaky-bucket limiter used as `async with limiter:`; with several worker processes, the bucket has to live in a shared store (Redis) instead of memory.",
        ]),

        h2("Apply it in the project"),
        code("python", `
class TokenBucket:
    def __init__(self, rate, capacity):
        self.rate, self.capacity = rate, capacity
        self.tokens = float(capacity)
        self.updated = asyncio.get_running_loop().time()
        self.paused_until = 0.0
        self.lock = asyncio.Lock()

    def _refill(self, now):
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    async def acquire(self):
        loop = asyncio.get_running_loop()
        async with self.lock:                      # callers take tokens one at a time
            while loop.time() < self.paused_until:
                await asyncio.sleep(self.paused_until - loop.time())
            self._refill(loop.time())
            if self.tokens < 1:
                await asyncio.sleep((1 - self.tokens) / self.rate)
                self._refill(loop.time())
            self.tokens -= 1


async def send_one(sms, bucket):
    loop = asyncio.get_running_loop()
    while True:
        await bucket.acquire()
        response = await client.post("/v1/sms", json=sms)
        if response.status_code != 429:
            return response
        retry_after = float(response.headers.get("Retry-After", "1"))
        bucket.paused_until = max(bucket.paused_until, loop.time() + retry_after)`, "worker/sms.py"),
        callout("info", "Leave headroom",
            "Configure the bucket a little below the provider's published limit (18 per second instead of 20): your clock and theirs never agree exactly, and retries also consume their budget."),

        h2("Verify"),
        code("bash", `
python -m worker.sms --dry-run --batch 400 --rate 20 --burst 40
# sent 400 in 18.0 s, busiest second 59 requests (burst 40 + 19 refilled), 429s: 0
python -m worker.sms --dry-run --batch 400 --simulate-429 "12:05:03,2s"
# paused 2.0 s after the first 429, 429s: 2, every message delivered`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A limiter per task or per request.** Creating `TokenBucket(...)` inside `send_one` gives every task a full bucket. Detect it by logging requests per second at the provider client; the limiter must be created once per worker.",
            "**Refill without the cap.** Forgetting `min(capacity, ...)` lets a quiet hour save up thousands of tokens and send them in one burst. Test an idle period followed by a batch.",
            "**Several processes, one provider.** Three worker pods with 20 per second each send 60. Divide the budget between them or move the bucket to Redis.",
        ]),

        challenge("chal_quiz_pas_161"),
        p("Now write the limiter. The editor holds `sms_limiter.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first fixes' mistakes on purpose. Run plays the batches on asyncio's clock, which jumps to the next timer instead of waiting, against a simulated provider."),
        challenge("chal_coding_pas_162"),
    ],
});
