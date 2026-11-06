"""
Rice Rocket's order-status poller asks the payment gateway about 300 pending orders. Last
Tuesday the gateway was down for five minutes, and the old retry loop

    for _ in range(5):
        try:
            return await call()
        except Exception:
            await asyncio.sleep(1)

made it worse: all 300 pollers retried in lockstep every second (a thundering herd that knocked
the gateway over again as it came back), 400 "order not found" answers were retried five times,
and the poller kept retrying long after the request's deadline.

Fix call_with_retry(call, *, attempts, base, cap, deadline, rng):
  - retry only what can succeed later: TimeoutError, ConnectionError, and HTTPError with status
    429, 502, 503 or 504; anything else is raised at once. Cancellation is never retried.
  - wait with exponential backoff and full jitter: rng.uniform(0, min(cap, base * 2 ** attempt)),
    attempt 0 for the first retry; a Retry-After value is a minimum wait.
  - never sleep past `deadline` seconds after the first call; then, or after `attempts` calls,
    raise the last error.
Time is asyncio's clock: asyncio.get_running_loop().time().
"""
import asyncio
import json
import random
import sys


class HTTPError(Exception):
    def __init__(self, status, retry_after=None):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.retry_after = retry_after


RETRYABLE_STATUS = {429, 502, 503, 504}


async def call_with_retry(call, *, attempts, base, cap, deadline, rng):
    loop = asyncio.get_running_loop()
    give_up_at = loop.time() + deadline
    last = None
    for attempt in range(attempts):
        try:
            return await call()
        # [ ] Which failures are worth another try
        if attempt == attempts - 1:
            break
        # [ ] Exponential backoff with full jitter, or Retry-After
        # [ ] Give up instead of sleeping past the deadline
        await asyncio.sleep(delay)
    raise last


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


def failure(outcome):
    if outcome == "timeout":
        return TimeoutError("gateway did not answer")
    if outcome == "conn":
        return ConnectionError("connection reset")
    if isinstance(outcome, dict):
        return HTTPError(outcome["status"], outcome.get("retry_after"))
    return HTTPError(outcome)


def describe(error):
    return f"HTTPError {error.status}" if isinstance(error, HTTPError) else type(error).__name__


async def single(case):
    """One poller; the gateway answers case["outcomes"] in order ("ok" ends it)."""
    loop = asyncio.get_running_loop()
    outcomes, calls = list(case["outcomes"]), []

    async def call():
        calls.append(round(loop.time(), 3))
        await asyncio.sleep(case.get("latency", 0.1))
        outcome = outcomes.pop(0) if outcomes else "ok"
        if outcome == "ok":
            return "ok"
        raise failure(outcome)

    try:
        result = await call_with_retry(call, attempts=case["attempts"], base=case["base"], cap=case["cap"],
                                       deadline=case["deadline"], rng=random.Random(case.get("seed", 1)))
    except Exception as error:  # the error the poller finally reports
        result = describe(error)
    return {"result": result, "calls_at": calls, "finished_at": round(loop.time(), 3)}


async def herd(case):
    """case["clients"] pollers start together; the gateway answers 503 until case["down_until"]."""
    loop = asyncio.get_running_loop()
    calls, done = [], {"ok": 0, "failed": 0}

    async def call():
        calls.append(loop.time())
        await asyncio.sleep(0.05)
        if loop.time() < case["down_until"]:
            raise HTTPError(503)
        return "ok"

    async def poller(i):
        try:
            await call_with_retry(call, attempts=10, base=0.5, cap=8, deadline=120, rng=random.Random(1000 + i))
            done["ok"] += 1
        except Exception:
            done["failed"] += 1

    async with asyncio.TaskGroup() as tg:
        for i in range(case["clients"]):
            tg.create_task(poller(i))
    per_second = {}
    for t in calls:
        per_second[int(t)] = per_second.get(int(t), 0) + 1
    back = case["down_until"]
    return {"ok": done["ok"], "failed": done["failed"], "calls": len(calls),
            "peak_calls_per_second": max(per_second.values()),
            "calls_in_first_second_back": sum(1 for t in calls if back <= t < back + 1),
            "all_done_at": round(loop.time(), 2)}


async def cancelled(case):
    """The poller's request is cancelled (client went away) while a gateway call hangs."""
    loop = asyncio.get_running_loop()
    calls = []

    async def call():
        calls.append(round(loop.time(), 3))
        await asyncio.sleep(5)
        raise TimeoutError("gateway did not answer")

    task = asyncio.create_task(call_with_retry(call, attempts=5, base=1, cap=8, deadline=60, rng=random.Random(7)))
    await asyncio.sleep(case["cancel_at"])
    task.cancel()
    try:
        await task
        state = "finished"
    except asyncio.CancelledError:
        state = "cancelled"
    except Exception as error:
        state = describe(error)
    await asyncio.sleep(60)  # anything still retrying in the background would call again
    return {"state": state, "calls_at": calls}


if __name__ == "__main__":
    case = json.load(sys.stdin)
    scenario = {"single": single, "herd": herd, "cancelled": cancelled}[case["scenario"]]
    print(json.dumps(asyncio.run(scenario(case), loop_factory=VirtualLoop)))
