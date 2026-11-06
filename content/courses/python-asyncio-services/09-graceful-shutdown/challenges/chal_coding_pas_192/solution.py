"""
Rice Rocket's courier-location worker consumes location updates from a queue and writes them to
the database. Kubernetes stops it on every deploy: SIGTERM, then terminationGracePeriodSeconds
(30 s), then SIGKILL. The signal handler only sets `stop` (an asyncio.Event); run_worker does the
rest:

  - fetch messages with `await source.get()` until `stop` is set; never start a fetch after it,
    and do not wait for a message once it is set,
  - run at most `concurrency` handlers at once, each `await handle(message)`,
  - acknowledge a message (`await source.ack(message_id)`) only after its handler finished:
    unacknowledged messages are redelivered to the next pod, acknowledged ones never are,
  - on stop: give running handlers up to `grace` seconds to finish, then cancel the rest and wait
    for them to stop, and return.
Return {"cancelled": [ids of handlers that were cancelled]}.
"""
import asyncio
import json
import sys


async def run_worker(source, handle, stop, *, concurrency, grace):
    slots = asyncio.Semaphore(concurrency)
    in_flight = set()
    cancelled = []
    stop_wait = asyncio.create_task(stop.wait())

    async def work(message):
        try:
            # @piece work-then-ack: Handle the message, then acknowledge it
            await handle(message)
            await source.ack(message["id"])
            # @end
        except asyncio.CancelledError:
            cancelled.append(message["id"])
            raise
        finally:
            slots.release()

    while True:
        # @piece fetch-until-stop: Fetch the next message, unless stop comes first
        get = asyncio.ensure_future(source.get())
        finished, _ = await asyncio.wait({get, stop_wait}, return_when=asyncio.FIRST_COMPLETED)
        if get not in finished:
            get.cancel()
            break
        message = get.result()
        # @end
        # @piece bounded-start: Start the handler, at most `concurrency` at a time
        await slots.acquire()
        task = asyncio.create_task(work(message))
        in_flight.add(task)
        task.add_done_callback(in_flight.discard)
        # @end

    # @piece drain-with-grace: Let running handlers finish, but only for `grace` seconds
    if in_flight:
        await asyncio.wait(set(in_flight), timeout=grace)
    # @end
    # @piece cancel-leftovers: Cancel what is still running and wait until it stopped
    leftovers = list(in_flight)
    for task in leftovers:
        task.cancel()
    await asyncio.gather(*leftovers, return_exceptions=True)
    # @end
    stop_wait.cancel()
    return {"cancelled": sorted(cancelled)}


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


class Source:
    """A queue: message i becomes available at messages[i]["at"]; acks are recorded."""

    def __init__(self, messages):
        self.pending = sorted(messages, key=lambda m: (m["at"], m["id"]))
        self.fetched, self.acked = [], []

    async def get(self):
        loop = asyncio.get_running_loop()
        if not self.pending:
            await asyncio.Event().wait()  # nothing more will arrive
        message = self.pending[0]
        if message["at"] > loop.time():
            await asyncio.sleep(message["at"] - loop.time())
        self.pending.pop(0)
        self.fetched.append(message["id"])
        return message

    async def ack(self, message_id):
        await asyncio.sleep(0)
        self.acked.append(message_id)


async def scenario(case):
    loop = asyncio.get_running_loop()
    source = Source(case["messages"])
    completed = set()
    stop = asyncio.Event()

    async def handle(message):
        await asyncio.sleep(message["duration"])
        completed.add(message["id"])

    worker = asyncio.create_task(run_worker(source, handle, stop, concurrency=case["concurrency"], grace=case["grace"]))
    await asyncio.sleep(case["sigterm_at"])
    stop.set()  # what the SIGTERM handler does
    done, _ = await asyncio.wait({worker}, timeout=case["kill_after"])
    killed = worker not in done
    if killed:  # SIGKILL: the process is gone, nothing more runs
        result = {"cancelled": None}
    else:
        result = worker.result()
    all_ids = [m["id"] for m in case["messages"]]
    return {
        "acked": sorted(source.acked),
        "cancelled": result["cancelled"],
        "lost": sorted(i for i in source.acked if i not in completed),
        "redelivered": sorted(i for i in all_ids if i not in source.acked),
        "fetched_after_sigterm": sorted(i for i in source.fetched if next(m["at"] for m in case["messages"] if m["id"] == i) > case["sigterm_at"]),
        "killed": killed,
        "exited_at": None if killed else round(loop.time(), 2),
    }


if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(asyncio.run(scenario(case), loop_factory=VirtualLoop)))
