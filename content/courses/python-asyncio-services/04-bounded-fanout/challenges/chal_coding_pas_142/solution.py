"""
Every morning at 09:30 Rice Rocket refreshes the menus of its partner restaurants before the lunch
rush. deps (the test runner's stand-ins):
  partners.menu(restaurant_id)  async, about 0.4 s -> {"dishes": n}; raises PartnerError when the
                                restaurant's system is down. The partner gateway answers 429 (also a
                                PartnerError) whenever more than 20 calls are open at once.

Requirements:
  - at most `limit` partner calls are open at the same time
  - all restaurants are fetched concurrently up to that limit (not one by one)
  - a failing restaurant does not fail the batch: its entry is {"error": "<message>"}, the others
    {"ok": <menu>}
Returns {restaurant_id: {...}} with the restaurants in the order they were given.
"""
import asyncio


async def refresh_menus(restaurant_ids, partners, limit=10):
    # @piece concurrency-limit: At most `limit` partner calls at a time
    slots = asyncio.Semaphore(limit)
    # @end

    async def fetch_one(restaurant_id):
        # @piece guarded-call: One partner call, holding a slot
        async with slots:
            return await partners.menu(restaurant_id)
        # @end

    async def fetch_or_error(restaurant_id):
        # @piece per-item-errors: One failed restaurant must not fail the batch
        try:
            return {"ok": await fetch_one(restaurant_id)}
        except PartnerError as error:
            return {"error": str(error)}
        # @end

    # @piece run-all: Start every restaurant and keep the input order
    results = await asyncio.gather(*(fetch_or_error(rid) for rid in restaurant_ids))
    # @end
    return dict(zip(restaurant_ids, results))


# ---------------------------------------------------------------- test runner (do not change)
# Refreshes the test case's restaurants on a simulated clock against a fake partner gateway and
# prints the largest number of calls open at once, the simulated time, the failed restaurants
# and the number of menus fetched.
import json
import sys


class VirtualClock:
    """Simulated seconds: asyncio timers jump straight to their deadline instead of waiting."""

    def __init__(self):
        self.now = 0.0


CLOCK = VirtualClock()


def new_virtual_loop():
    loop = asyncio.SelectorEventLoop()
    loop.time = lambda: CLOCK.now
    loop._clock_resolution = 1e-9  # fire timers at their deadline on every OS (Windows rounds to ~15.6 ms)
    real_select = loop._selector.select

    def select(timeout=None):
        events = real_select(0)
        if not events:
            if timeout is None:
                raise RuntimeError("deadlock: every task is waiting and no timer is scheduled")
            CLOCK.now += timeout  # nothing to do until the next timer: jump to it
        return events

    loop._selector.select = select
    return loop


class PartnerError(Exception):
    pass


class Partners:
    GATEWAY_LIMIT = 20

    def __init__(self, down, slow):
        self.down, self.slow = set(down), dict(slow)
        self.open = 0
        self.max_open = 0

    async def menu(self, restaurant_id):
        self.open += 1
        self.max_open = max(self.max_open, self.open)
        try:
            if self.open > self.GATEWAY_LIMIT:
                await asyncio.sleep(0.05)
                raise PartnerError(f"HTTP 429 from the partner gateway ({restaurant_id})")
            if restaurant_id in self.down:
                await asyncio.sleep(0.1)
                raise PartnerError(f"HTTP 503 from {restaurant_id}")
            await asyncio.sleep(self.slow.get(restaurant_id, 0.4))
            return {"dishes": 10 + len(restaurant_id)}
        finally:
            self.open -= 1


async def main(case):
    partners = Partners(case.get("down", []), case.get("slow", {}))
    ids = case["restaurants"] if "restaurants" in case else [f"r{n:03d}" for n in range(1, case["count"] + 1)]
    result = await refresh_menus(ids, partners, case.get("limit", 10))
    return {
        "max_open": partners.max_open,
        "elapsed_s": round(CLOCK.now, 2),
        "menus": sum(1 for r in result.values() if "ok" in r),
        "errors": {rid: r["error"] for rid, r in result.items() if "error" in r},
        "order_kept": list(result) == ids,
    }


if __name__ == "__main__":
    case = json.load(sys.stdin)
    loop = new_virtual_loop()
    try:
        print(json.dumps(loop.run_until_complete(main(case))))
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
    finally:
        loop.close()
