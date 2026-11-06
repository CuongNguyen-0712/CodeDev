"""
The courier app's order tracking screen needs three answers for one order, from three services:
  api.order(order_id)           async, 0.2 s  -> {"id": ..., "status": ...}
  api.courier(order_id)         async, 0.3 s  -> {"lat": ..., "lng": ...}; raises NotAssigned while
                                no courier has accepted the order yet
  api.restaurant_eta(order_id)  async, 0.25 s -> minutes until the food is ready
Any call may raise ApiError (its .service says which service is down).

Requirements:
  - the three calls run at the same time: the screen loads in about 0.3 s, not 0.75 s
  - NotAssigned is a normal answer: the screen shows "courier": None
  - when a call raises ApiError, the calls still running are cancelled at once (nothing keeps
    running after load_tracking returns), and load_tracking raises
    TrackingUnavailable("<failed services, sorted, comma-separated>")
Returns {"status": ..., "courier": {...} or None, "eta": minutes}.
"""
import asyncio


class TrackingUnavailable(Exception):
    pass


async def courier_or_none(api, order_id):
    # @piece courier-optional: No courier assigned yet is a normal answer
    try:
        return await api.courier(order_id)
    except NotAssigned:
        return None
    # @end


async def load_tracking(order_id, api):
    failed = []
    # @piece run-together: Run the three calls together as one group
    try:
        async with asyncio.TaskGroup() as tg:
            order = tg.create_task(api.order(order_id))
            courier = tg.create_task(courier_or_none(api, order_id))
            eta = tg.create_task(api.restaurant_eta(order_id))
    # @end
    # @piece collect-failures: Note which services failed
    except* ApiError as group:
        failed = sorted({error.service for error in group.exceptions})
    # @end
    if failed:
        raise TrackingUnavailable(", ".join(failed))
    return {"status": order.result()["status"], "courier": courier.result(), "eta": eta.result()}


# ---------------------------------------------------------------- test runner (do not change)
# Loads the screen for one order on a simulated clock. The test case says which services fail and
# when. Prints the screen (or the error), the simulated time it took, the calls that were still
# running when load_tracking returned, and the calls that were cancelled.
import json
import sys
import time


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


class ApiError(Exception):
    def __init__(self, service):
        super().__init__(f"{service} service unavailable")
        self.service = service


class NotAssigned(Exception):
    pass


class Api:
    def __init__(self, case):
        self.fail = case.get("fail", {})  # service -> seconds until it raises ApiError
        self.unassigned = case.get("unassigned", False)
        self.running = set()
        self.cancelled = []

    async def _call(self, service, seconds, value):
        self.running.add(service)
        try:
            if service in self.fail:
                await asyncio.sleep(self.fail[service])
                raise ApiError(service)
            await asyncio.sleep(seconds)
            if service == "courier" and self.unassigned:
                raise NotAssigned()
            return value
        except asyncio.CancelledError:
            self.cancelled.append(service)
            raise
        finally:
            self.running.discard(service)

    async def order(self, order_id):
        return await self._call("order", 0.2, {"id": order_id, "status": "cooking"})

    async def courier(self, order_id):
        return await self._call("courier", 0.3, {"lat": 10.7769, "lng": 106.7009})

    async def restaurant_eta(self, order_id):
        return await self._call("restaurant", 0.25, 12)


async def main(case):
    api = Api(case)
    out = {}
    try:
        out["screen"] = await load_tracking(case["order_id"], api)
    except Exception as error:
        out["error"] = f"{type(error).__name__}: {error}"
    out["elapsed_s"] = round(CLOCK.now, 2)
    out["still_running"] = sorted(api.running)
    await asyncio.sleep(1)  # let anything left behind finish
    out["cancelled"] = sorted(api.cancelled)
    return out


if __name__ == "__main__":
    case = json.load(sys.stdin)
    loop = new_virtual_loop()
    try:
        print(json.dumps(loop.run_until_complete(main(case))))
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
    finally:
        loop.close()
