"""
Rice Rocket's receipt endpoint, `async def` in FastAPI: for one order it asks the maps API for the
delivery ETA, renders the receipt PDF and stores it. At the lunch peak this handler made every
request on the pod slow and the liveness probe failed: something in it blocks the event loop.

deps (the test runner's stand-ins for the real clients):
  deps.maps.eta(address)        async (an httpx.AsyncClient call), 0.3 s; raises MapsBusy when the
                                maps API answers 429, then the next attempt may succeed
  deps.maps.eta_sync(address)   the same call through a blocking client (requests): holds the
                                event loop for 0.3 s
  render_receipt(order, eta)    CPU work: 0.8 s of PDF rendering on whichever thread runs it
  deps.pool.run(fn, *args)      runs fn in the worker pool (asyncio.to_thread or a process pool)
                                and awaits the result; the event loop stays free meanwhile
  deps.store.save(order_id, pdf)  async, 0.05 s

Requirements:
  - nothing in the handler blocks the event loop: every wait is awaited, CPU work runs in the pool
  - up to 3 attempts for the ETA, 0.2 s apart; after 3 busy answers the receipt says eta None
  - the receipt is always stored before the handler returns
Returns {"id": <order id>, "eta": <minutes or None>}.
"""


async def build_receipt(order, deps):
    eta = None
    for attempt in range(3):
        try:
            # [ ] Ask the maps API for the delivery ETA
            break
        except MapsBusy:
            # [ ] Wait before the next attempt
    # [ ] Render the receipt PDF
    # [ ] Store the receipt
    return {"id": order["id"], "eta": eta}


# ---------------------------------------------------------------- test runner (do not change)
# Runs the handler for every order of one test case at once on a simulated clock and measures how
# late a 50 ms heartbeat task gets to run: that delay is the event loop lag every request on the
# pod (and the liveness probe, timeout 1 s) would see. Prints one JSON line.
import asyncio
import json
import sys
import time
from types import SimpleNamespace


class VirtualClock:
    """Simulated seconds. asyncio timers jump straight to their deadline instead of waiting;
    a blocking call (time.sleep, sync I/O, CPU work) moves the clock while the loop is stuck."""

    def __init__(self):
        self.now = 0.0
        self.in_worker = False  # True while the worker pool runs the work
        self.worker_cost = 0.0

    def block(self, seconds):
        if self.in_worker:
            self.worker_cost += seconds
        else:
            self.now += seconds  # the event loop thread is busy: no other task runs meanwhile


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


def run_virtual(coro):
    time.sleep = CLOCK.block  # a blocking sleep stalls the loop for that long
    loop = new_virtual_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class MapsBusy(Exception):
    pass


class Maps:
    def __init__(self, busy):
        self.busy = dict(busy)  # address -> how many 429 answers before a real one

    def _answer(self, address):
        if self.busy.get(address, 0) > 0:
            self.busy[address] -= 1
            raise MapsBusy(address)
        return 12 + len(address) % 20

    async def eta(self, address):
        await asyncio.sleep(0.3)
        return self._answer(address)

    def eta_sync(self, address):
        time.sleep(0.3)
        return self._answer(address)


def render_receipt(order, eta):
    CLOCK.block(0.8)
    return f"pdf:{order['id']}:{eta}"


class Pool:
    def __init__(self, workers):
        self.slots = asyncio.Semaphore(workers)

    async def run(self, fn, *args):
        async with self.slots:
            CLOCK.in_worker, CLOCK.worker_cost = True, 0.0
            try:
                result = fn(*args)
            finally:
                CLOCK.in_worker = False
            await asyncio.sleep(CLOCK.worker_cost)  # the work takes as long, on another thread
            return result


class Store:
    def __init__(self):
        self.saved = {}

    async def save(self, order_id, pdf):
        await asyncio.sleep(0.05)
        self.saved[order_id] = pdf


async def main(case):
    deps = SimpleNamespace(maps=Maps(case.get("busy", {})), pool=Pool(case.get("workers", 4)), store=Store())
    lags = []
    running = True

    async def heartbeat():
        while running:
            started = CLOCK.now
            await asyncio.sleep(0.05)
            lags.append(CLOCK.now - started - 0.05)

    beat = asyncio.create_task(heartbeat())
    results = await asyncio.gather(*(build_receipt(order, deps) for order in case["orders"]))
    finished = CLOCK.now
    await asyncio.sleep(0.2)  # anything still running in the background gets its chance now
    running = False
    await beat
    return {
        "receipts": [[r["id"], r["eta"]] for r in results],
        "saved": sorted(deps.store.saved),
        "finished_at_s": round(finished, 2),
        "max_loop_lag_ms": round(max(lags, default=0) * 1000),
        "probe_failures": sum(1 for lag in lags if lag > 1.0),
    }


if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(run_virtual(main(case))))
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
