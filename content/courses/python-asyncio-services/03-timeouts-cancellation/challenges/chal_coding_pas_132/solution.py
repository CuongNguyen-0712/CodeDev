"""
Rice Rocket's checkout for one order. deps (the test runner's stand-ins):
  deps.stock.reserve(order_id)            async, 0.1 s -> reservation id (the dishes are held)
  deps.stock.release(reservation)         async, 0.05 s (the dishes go back on sale)
  deps.payments.charge(order_id, amount)  async; slow when the provider is slow; raises
                                          PaymentDeclined when the card is refused
  deps.ledger.record(order_id, charge)    async, 0.2 s: the audit row of a successful charge

Requirements:
  - reserving and charging share ONE time budget of 2.0 s; when it runs out the checkout returns
    {"status": "timeout"}
  - a declined card returns {"status": "declined"}
  - stock reserved by a checkout that did not get paid is always released: on a timeout, a
    declined card, and when the client disconnects (the request task is cancelled)
  - a cancellation is never swallowed: after the cleanup, CancelledError keeps propagating
  - once the charge succeeded, its ledger row is written even if the client disconnects meanwhile
Returns {"status": "paid", "charge": <charge id>} on success.
"""
import asyncio


async def checkout(order, deps):
    reservation = None
    paid = False
    try:
        # @piece deadline: One time budget for reserving and charging
        async with asyncio.timeout(2.0):
            reservation = await deps.stock.reserve(order["id"])
            charge = await deps.payments.charge(order["id"], order["amount"])
        # @end
        paid = True
        # @piece ledger-write: Write the successful charge to the ledger
        await asyncio.shield(deps.ledger.record(order["id"], charge))
        # @end
        return {"status": "paid", "charge": charge}
    # @piece timeout-answer: Answer a checkout that ran out of time
    except TimeoutError:
        return {"status": "timeout"}
    # @end
    except PaymentDeclined:
        return {"status": "declined"}
    # @piece release-unpaid: Give back the stock of an unpaid checkout
    finally:
        if reservation is not None and not paid:
            await deps.stock.release(reservation)
    # @end


# ---------------------------------------------------------------- test runner (do not change)
# Runs one checkout on a simulated clock. The test case sets the payment latency, a declined card,
# or a client disconnect at a given second (the request task is cancelled then). Prints what the
# caller saw, when, the stock still held, and the ledger rows written by the end.
import json
import sys
from types import SimpleNamespace


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


class PaymentDeclined(Exception):
    pass


class Stock:
    def __init__(self):
        self.held = set()
        self.released = 0

    async def reserve(self, order_id):
        await asyncio.sleep(0.1)
        self.held.add(f"r-{order_id}")
        return f"r-{order_id}"

    async def release(self, reservation):
        await asyncio.sleep(0.05)
        self.held.discard(reservation)
        self.released += 1


class Payments:
    def __init__(self, latency, declined):
        self.latency, self.declined = latency, declined

    async def charge(self, order_id, amount):
        await asyncio.sleep(self.latency)
        if self.declined:
            raise PaymentDeclined(order_id)
        return f"ch-{order_id}"


class Ledger:
    def __init__(self):
        self.rows = []

    async def record(self, order_id, charge):
        await asyncio.sleep(0.2)
        self.rows.append([order_id, charge])


async def main(case):
    deps = SimpleNamespace(stock=Stock(), payments=Payments(case.get("payment_s", 0.5), case.get("declined", False)), ledger=Ledger())
    task = asyncio.create_task(checkout({"id": case["order_id"], "amount": 185000}, deps))
    if "disconnect_at" in case:
        await asyncio.sleep(case["disconnect_at"])
        task.cancel()  # the client went away: the server cancels the request task
    try:
        outcome = await task
    except asyncio.CancelledError:
        outcome = "cancelled"
    ended = CLOCK.now
    await asyncio.sleep(2)  # work that was shielded or left behind finishes now
    return {"outcome": outcome, "ended_s": round(ended, 2), "stock_held": sorted(deps.stock.held),
            "released": deps.stock.released, "ledger": deps.ledger.rows}


if __name__ == "__main__":
    case = json.load(sys.stdin)
    loop = new_virtual_loop()
    try:
        print(json.dumps(loop.run_until_complete(main(case))))
    except BaseException as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
    finally:
        loop.close()
