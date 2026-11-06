// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-2-2",
    title: "Queues and backpressure",
    slug: { _type: "slug", current: "asyncio-queues-backpressure" },
    description:
        "Rice Rocket's order-event loader read the stream ten times faster than the warehouse could write, buffered the difference in an unbounded queue and was OOMKilled. Learn producer/consumer with `asyncio.Queue`: a bounded buffer that slows the producer down, a fixed set of workers, `task_done` in `finally`, and a drain-then-stop shutdown that loses nothing and leaves nothing running.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "A worker copies order events from the event stream into the analytics warehouse. During a warehouse slowdown its memory climbed from 200 MB to 2 GB in twenty minutes and Kubernetes killed the pod; after a fix it hung on the first event the warehouse refused.",
    },

    content: [
        h2("Situation"),
        code("text", `
$ kubectl -n rice-rocket describe pod event-loader-7c9d5-x2kq4 | grep -A3 "Last State"
    Last State:  Terminated
      Reason:    OOMKilled
      Exit Code: 137
$ kubectl -n rice-rocket logs event-loader-7c9d5-x2kq4 --previous | tail -2
queue size 184,220  written/s 40  read/s 400
queue size 186,950  written/s 38  read/s 410`, "terminal"),
        bullets([
            "The stream delivers about 400 events per second; four writers manage about 40 while the warehouse is slow.",
            "`asyncio.Queue()` has no limit, so every event read and not yet written stayed in memory.",
            "The next version called `queue.task_done()` only after a successful write: the first refused event left `queue.join()` waiting forever.",
        ]),

        h2("The core you need"),
        bullets([
            "**Producer/consumer with a queue.** One task reads the source and `put`s items; N worker tasks `get` and process them. N is your concurrency limit, like the semaphore of the last lesson, but for a stream you cannot start as one batch.",
            "**A bounded queue is backpressure.** `asyncio.Queue(maxsize=50)`: when the queue is full, `await queue.put(item)` waits until a worker takes one. The producer slows down to the workers' pace, and memory holds at most `maxsize` items plus one per worker.",
            "**`task_done` for every `get`.** `queue.join()` waits until every item put has been marked done. Call `queue.task_done()` in `finally`, so a failed item counts too; record the failure (dead-letter list or topic) instead of losing it.",
            "**Drain, then stop.** When the source is exhausted, `await queue.join()` waits for the remaining items; then cancel the workers (they wait on `get()` forever) and await them with `asyncio.gather(..., return_exceptions=True)`. Cancelling first drops whatever is still in the queue. Python 3.13 adds `Queue.shutdown()` as another way to end the workers.",
            "**Measure the buffer.** Export queue size and the read and write rates. A queue that stays full means the consumer is the bottleneck; a slow source with an empty queue means the opposite.",
        ]),

        h2("Apply it in the project"),
        code("python", `
async def run_pipeline(source, sink, workers=4, maxsize=50):
    queue = asyncio.Queue(maxsize=maxsize)
    written, dead = 0, []

    async def writer():
        nonlocal written
        while True:
            event = await queue.get()
            try:
                await sink.write(event)
                written += 1
            except SinkError:
                dead.append(event["id"])
            finally:
                queue.task_done()

    tasks = [asyncio.create_task(writer()) for _ in range(workers)]
    async for event in source:
        await queue.put(event)
    await queue.join()
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    return {"written": written, "dead": dead}`, "app/event_loader.py"),
        p("With a real stream consumer, backpressure goes one step further: while the queue is full the loader stops fetching from the stream, and the broker keeps the unread events instead of the pod's memory."),
        callout("info", "How big should maxsize be?",
            "Big enough to smooth short bursts so the workers never wait on an empty queue, small enough that a full buffer fits comfortably in the pod's memory limit. A few seconds of the normal write rate is a good start; here 50 events at 40 per second."),

        h2("Verify"),
        code("bash", `
python -m app.event_loader --replay fixtures/lunch-peak.jsonl --warehouse slow
# read 24,000  written 23,998  dead 2 (e7, e40)
# queue size max 50  memory max 214 MB
kubectl -n rice-rocket top pod -l app=event-loader
# NAME                         CPU   MEMORY
# event-loader-6f8b9-kd2w1     120m  216Mi`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A worker that dies on an unexpected error.** An exception that escapes the worker loop ends that task silently and the pipeline runs with one writer fewer, then hangs in `join()` when the last one dies. Catch what you expect inside the loop and let the TaskGroup or a supervisor surface the rest.",
            "**`put_nowait` to \"avoid blocking\".** On a full queue it raises `QueueFull`; code that catches and drops the item turns backpressure into silent data loss. Use `await queue.put` unless dropping is the documented policy.",
            "**Per-item tasks instead of workers.** `create_task(write(event))` for every event read brings back the unbounded growth, now as tasks. Keep a fixed number of workers.",
        ]),

        p("Now write `run_pipeline`. The editor starts with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the versions that were OOMKilled, hung or dropped events. Run streams events on a simulated clock into a slow warehouse and reports the most events held in memory at once."),
        challenge("chal_coding_pas_152"),
    ],
});
