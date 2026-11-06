// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-3-3",
    title: "Graceful shutdown and signal handling",
    slug: { _type: "slug", current: "asyncio-graceful-shutdown-signals" },
    description:
        "Every deploy of Rice Rocket's courier-location worker lost a few seconds of locations, and after a first fix it duplicated some instead. Learn what Kubernetes sends when it stops a pod, why asyncio.run does not handle SIGTERM for you, and how to stop fetching, drain within a grace period, cancel the rest and acknowledge only finished work.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The courier-location worker consumes location updates from a queue and writes them to Postgres, up to 8 at a time. It runs as a Kubernetes Deployment and is restarted by every deploy, several times a day, in the middle of the dinner rush.",
    },

    content: [
        h2("Situation"),
        code("text", `
12:31:00 wrote 50 locations
(pod stopped by deploy: no "stopped" line, 8 handlers were running)
12:31:03 courier 4471 jumped 2 km on the map: 3 s of points missing
-- after adding "ack as soon as fetched, so nothing is redelivered twice" --
12:52:10 SIGTERM handled, cancelling 8 handlers
12:52:10 courier 5120: 6 points acknowledged but never written`, "worker logs"),
        bullets([
            "Python's default SIGTERM action ends the process at once: running handlers die mid-write, and no `finally` runs.",
            "Acknowledging before the write turned \"redelivered once\" into \"lost for good\".",
            "Waiting for every handler without a limit ran into the 30-second grace period and ended in SIGKILL (exit code 137).",
        ]),

        h2("The core you need"),
        bullets([
            "**How Kubernetes stops a pod.** The pod is removed from Service endpoints, the preStop hook runs, the container gets SIGTERM, and after `terminationGracePeriodSeconds` (default 30) it gets SIGKILL, which nothing can catch.",
            "**asyncio.run handles SIGINT, not SIGTERM.** Since 3.11 Ctrl+C cancels the main task; for SIGTERM install `loop.add_signal_handler(signal.SIGTERM, stop.set)` (Unix only) and keep the handler tiny: set an event, let the main loop react.",
            "**Stop taking work first.** Race the next fetch against `stop.wait()` with `asyncio.wait(..., return_when=FIRST_COMPLETED)`, and cancel the fetch that lost; a worker blocked in `get()` would otherwise never notice the stop.",
            "**Drain with a deadline, then cancel.** `asyncio.wait(running, timeout=grace)` lets handlers finish; then cancel the stragglers and `await asyncio.gather(*pending, return_exceptions=True)` so their cleanup runs before the process exits. Choose `grace` well below the pod's grace period.",
            "**Acknowledge after the side effect.** An unacknowledged message is redelivered to the next pod (at-least-once, so handlers must be idempotent); an acknowledged but unwritten one is lost.",
            "**Web servers own the signal.** uvicorn (and gunicorn) handle SIGTERM themselves, stop accepting connections, wait for open requests up to `--timeout-graceful-shutdown`, then run the FastAPI lifespan shutdown. Put cleanup after `yield`, not in your own signal handler.",
        ]),

        h2("Apply it in the project"),
        code("python", `
async def main():
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()
    loop.add_signal_handler(signal.SIGTERM, stop.set)
    loop.add_signal_handler(signal.SIGINT, stop.set)
    async with Queue.connect(QUEUE_URL) as source, Database.connect(DB_URL) as db:
        result = await run_worker(source, db.write_location, stop, concurrency=8, grace=20)
        log.info("worker stopped, %d handlers cancelled", len(result["cancelled"]))

asyncio.run(main())`, "worker/main.py"),
        code("python", `
async def run_worker(source, handle, stop, *, concurrency, grace):
    slots = asyncio.Semaphore(concurrency)
    in_flight, cancelled = set(), []
    stop_wait = asyncio.create_task(stop.wait())

    async def work(message):
        try:
            await handle(message)
            await source.ack(message["id"])        # only after the write
        except asyncio.CancelledError:
            cancelled.append(message["id"])
            raise
        finally:
            slots.release()

    while True:
        get = asyncio.ensure_future(source.get())
        finished, _ = await asyncio.wait({get, stop_wait}, return_when=asyncio.FIRST_COMPLETED)
        if get not in finished:
            get.cancel()
            break
        await slots.acquire()
        task = asyncio.create_task(work(get.result()))
        in_flight.add(task)
        task.add_done_callback(in_flight.discard)

    if in_flight:
        await asyncio.wait(set(in_flight), timeout=grace)
    leftovers = list(in_flight)
    for task in leftovers:
        task.cancel()
    await asyncio.gather(*leftovers, return_exceptions=True)
    stop_wait.cancel()
    return {"cancelled": sorted(cancelled)}`, "worker/consumer.py"),
        code("yaml", `
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 30     # grace=20 in the worker leaves 10 s for the final flush`, "k8s/courier-worker.yaml"),
        callout("info", "Why the event, not work in the handler",
            "A signal handler added with `add_signal_handler` runs as a normal callback on the loop, but it cannot `await`. Setting an event keeps the shutdown logic in ordinary async code that you can test by setting the event yourself, which is exactly what the challenge does."),

        h2("Verify"),
        code("bash", `
kubectl -n rice-rocket rollout restart deployment/courier-worker
kubectl -n rice-rocket logs -f deploy/courier-worker --tail 3
# 13:10:02 SIGTERM received, draining 6 handlers
# 13:10:03 worker stopped, 0 handlers cancelled
kubectl -n rice-rocket get pod -l app.kubernetes.io/name=courier-worker \\
  -o jsonpath='{range .items[*]}{.status.containerStatuses[0].lastState.terminated.exitCode}{"\\n"}{end}'
# 0      (not 137: the worker exited before SIGKILL)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A shell as PID 1.** `CMD python -m worker` in shell form runs `/bin/sh -c`, which does not forward SIGTERM to Python. Use the exec form (`CMD [\"python\", \"-m\", \"worker\"]`) or an init such as `tini`; the Docker course's lesson 1 shows the same issue.",
            "**Handlers that swallow cancellation.** A `try/except BaseException` inside `handle` makes `task.cancel()` a no-op and the drain runs into SIGKILL. Let `CancelledError` propagate after cleanup.",
            "**Grace equal to the pod's grace period.** `grace=30` with `terminationGracePeriodSeconds: 30` leaves no time for cancelling and flushing; keep a margin and alert on exit code 137.",
        ]),

        challenge("chal_quiz_pas_191"),
        p("Now write the shutdown-aware consumer. The editor holds `worker.py` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first fixes' mistakes on purpose. Run plays deploys on asyncio's clock: messages arrive, SIGTERM sets `stop`, and Kubernetes kills the process if it has not exited in time."),
        challenge("chal_coding_pas_192"),
    ],
});
