"""
Rice Rocket's order-event loader. It reads order events from the stream (fast: `async for event
in source`, about 100 events per second) and writes them to the warehouse (slow:
`await sink.write(event)` takes 0.1 s; it raises SinkError for an event the warehouse refuses).

Requirements:
  - memory stays bounded: at most `maxsize` events wait between reading and writing, so a slow
    warehouse slows the reading down instead of filling memory (backpressure)
  - `workers` writers run concurrently
  - a refused event is added to the dead-letter list and the loader carries on
  - run_pipeline returns once every event read has been written or dead-lettered, and leaves no
    writer task running
Returns {"written": <count>, "dead": [<event ids>]}.
"""
import asyncio


async def run_pipeline(source, sink, workers=4, maxsize=50):
    # @piece bounded-buffer: A buffer that holds at most `maxsize` events
    queue = asyncio.Queue(maxsize=maxsize)
    # @end
    written, dead = 0, []

    async def writer():
        nonlocal written
        while True:
            event = await queue.get()
            # @piece write-one: Write one event and always mark it done
            try:
                await sink.write(event)
                written += 1
            except SinkError:
                dead.append(event["id"])
            finally:
                queue.task_done()
            # @end

    # @piece start-writers: Start the writers
    tasks = [asyncio.create_task(writer()) for _ in range(workers)]
    # @end
    # @piece read-source: Read the stream into the buffer
    async for event in source:
        await queue.put(event)
    # @end
    # @piece drain-and-stop: Wait for the buffer to drain, then stop the writers
    await queue.join()
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    # @end
    return {"written": written, "dead": dead}


# ---------------------------------------------------------------- test runner (do not change)
# Streams the test case's events on a simulated clock into a fake warehouse and prints what was
# written, the dead letters, the most events held in memory at once (read but not finished), the
# simulated time and the tasks still running after run_pipeline returned.
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


class SinkError(Exception):
    pass


class Meter:
    def __init__(self):
        self.read = 0
        self.finished = 0
        self.max_in_memory = 0


class Sink:
    def __init__(self, bad, meter):
        self.bad, self.meter = set(bad), meter
        self.rows = []

    async def write(self, event):
        try:
            await asyncio.sleep(0.1)
            if event["id"] in self.bad:
                raise SinkError(f"warehouse refused {event['id']}")
            self.rows.append(event["id"])
        finally:
            self.meter.finished += 1


async def stream(count, meter):
    for n in range(1, count + 1):
        await asyncio.sleep(0.01)
        meter.read += 1
        meter.max_in_memory = max(meter.max_in_memory, meter.read - meter.finished)
        yield {"id": f"e{n}", "order": f"o{n % 37}"}


async def main(case):
    meter = Meter()
    sink = Sink(case.get("bad", []), meter)
    result = await run_pipeline(stream(case["count"], meter), sink, case.get("workers", 4), case.get("maxsize", 50))
    left = [t for t in asyncio.all_tasks() if t is not asyncio.current_task() and not t.done()]
    return {
        "written": result["written"],
        "rows_in_warehouse": len(sink.rows),
        "dead": sorted(result["dead"], key=lambda e: int(e[1:])),
        "max_in_memory": meter.max_in_memory,
        "elapsed_s": round(CLOCK.now, 2),
        "tasks_left": len(left),
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
