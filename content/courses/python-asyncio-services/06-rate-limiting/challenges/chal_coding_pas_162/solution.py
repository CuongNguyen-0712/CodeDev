"""
Rice Rocket's notification worker sends order SMS through a provider that allows 20 requests per
second with bursts of 40 (a token bucket on its side). Above that it answers 429 with a
Retry-After header, and after more than 20 rejections in one run it blocks the account.

Write the worker's limiter and fan-out:
  TokenBucket(rate, capacity)  starts full; refills `rate` tokens per second up to `capacity`.
  await bucket.acquire()       returns when a token was taken; waits (asyncio.sleep) otherwise.
                               Callers queue fairly: one shared limiter, never a sleep per task.
                               While bucket.paused_until is in the future, nobody gets a token.
  await send_all(messages, bucket, send)
                               sends every message concurrently through the bucket.
                               `await send(message)` returns (status, retry_after_seconds).
                               On 429 the WHOLE worker pauses for retry_after (not just the
                               task that saw it), then the message is sent again.
Time is asyncio's clock: asyncio.get_running_loop().time().
"""
import asyncio
import json
import sys


class TokenBucket:
    def __init__(self, rate, capacity):
        # @piece bucket-state: A full bucket, its clock and one lock for all callers
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.updated = asyncio.get_running_loop().time()
        self.paused_until = 0.0
        self.lock = asyncio.Lock()
        # @end

    def _refill(self, now):
        # @piece refill: Add the tokens earned since the last look, up to capacity
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        # @end

    async def acquire(self):
        loop = asyncio.get_running_loop()
        # @piece take-or-wait: Take a token, or wait exactly until the next one
        async with self.lock:
            while loop.time() < self.paused_until:
                await asyncio.sleep(self.paused_until - loop.time())
            self._refill(loop.time())
            if self.tokens < 1:
                await asyncio.sleep((1 - self.tokens) / self.rate)
                self._refill(loop.time())
            self.tokens -= 1
        # @end


async def send_all(messages, bucket, send):
    loop = asyncio.get_running_loop()

    async def one(message):
        while True:
            await bucket.acquire()
            status, retry_after = await send(message)
            if status != 429:
                return
            # @piece pause-on-429: Pause every sender for the Retry-After time
            bucket.paused_until = max(bucket.paused_until, loop.time() + retry_after)
            # @end

    # @piece fan-out: Send every message concurrently and wait for all of them
    async with asyncio.TaskGroup() as tg:
        for message in messages:
            tg.create_task(one(message))
    # @end


# ---------------------------------------------------------------- test runner (do not change)
# A virtual clock: asyncio.sleep and loop.time() jump to the next timer instead of waiting.
class VirtualLoop(asyncio.SelectorEventLoop):
    def __init__(self):
        super().__init__()
        self._clock_resolution = 1e-9  # same timer batching on every OS (Windows reports ~15 ms)
        self._now = 0.0
        real_select = self._selector.select

        def select(timeout=None):
            if timeout:
                self._now += timeout
            return real_select(0)

        self._selector.select = select

    def time(self):
        return self._now


class Provider:
    """The SMS provider's own token bucket, plus an optional outage window answering 429."""

    def __init__(self, rate, capacity, outage):
        self.rate, self.capacity, self.tokens, self.updated = rate, capacity, float(capacity), 0.0
        self.outage = outage
        self.accepted, self.rejected, self.times = 0, 0, []

    def handle(self, now):
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.outage and self.outage["from"] <= now < self.outage["to"]:
            self.rejected += 1
            return 429, self.outage["retry_after"]
        if self.tokens >= 1 - 1e-9:  # float rounding: a client at exactly the same rate is fine
            self.tokens -= 1
            self.accepted += 1
            self.times.append(now)
            return 200, 0
        self.rejected += 1
        return 429, 1.0


async def scenario(case):
    loop = asyncio.get_running_loop()
    p = case["provider"]
    provider = Provider(p["rate"], p["capacity"], case.get("outage"))
    bucket = TokenBucket(case["rate"], case["capacity"])

    async def send(message):
        await asyncio.sleep(0)  # the request leaves the loop like a real call would
        return provider.handle(loop.time())

    async def batch(at, count, start):
        await asyncio.sleep(at)
        await send_all([f"sms-{start + i}" for i in range(count)], bucket, send)

    async with asyncio.TaskGroup() as tg:
        start = 0
        for b in case["batches"]:
            tg.create_task(batch(b["at"], b["count"], start))
            start += b["count"]
    busiest = max((sum(1 for t in provider.times if s <= t < s + 1) for s in provider.times), default=0)
    return {
        "sent": provider.accepted,
        "rejected": provider.rejected,
        "blocked": provider.rejected > 20,
        "busiest_second": busiest,
        "finished_at": round(loop.time(), 2),
    }


if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(asyncio.run(scenario(case), loop_factory=VirtualLoop)))
