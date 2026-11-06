// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-1-1",
    title: "Coroutines vs blocking calls in the event loop",
    slug: { _type: "slug", current: "asyncio-blocking-calls-event-loop" },
    description:
        "One `async def` endpoint that called `requests.get`, slept with `time.sleep` and rendered a PDF in place made every request on Rice Rocket's API pod slow, health checks included. Learn what the event loop is, what blocks it, how to find the blocking line, and the three fixes: an async client, an awaited sleep and a worker pool for CPU work.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The receipt service is a FastAPI app on Kubernetes. At the lunch peak its p99 latency rose from 80 ms to over 2 s on every route, the liveness probe (timeout 1 s) failed and Kubernetes restarted healthy pods, which made the queue of requests worse.",
    },

    content: [
        h2("Situation"),
        p("The endpoint that went live the week before the incident:"),
        code("python", `
@app.get("/orders/{order_id}/receipt")
async def receipt(order_id: str):
    order = await orders.get(order_id)
    for attempt in range(3):
        try:
            eta = requests.get(f"{MAPS}/eta", params={"to": order.address}, timeout=5).json()["minutes"]
            break
        except requests.HTTPError:
            time.sleep(0.2)                     # the maps API answers 429 at peak
    pdf = render_receipt(order, eta)            # reportlab, ~0.8 s of CPU
    await receipts.save(order_id, pdf)
    return Response(pdf, media_type="application/pdf")`, "app/receipts.py"),
        bullets([
            "`GET /health` answered in 1.8 s, `GET /menu/42` in 2.4 s: routes that never touch receipts were slow too.",
            "Kubernetes events: `Liveness probe failed: Get \"http://10.8.1.14:8000/health\": context deadline exceeded`.",
            "CPU on the pod was at 100% of one core, the other three idle.",
        ]),

        h2("The core you need"),
        bullets([
            "**One thread runs every coroutine.** An asyncio app (FastAPI on uvicorn included) has one event loop per worker process. It runs one task at a time until that task reaches an `await` that has to wait; only then can another task run.",
            "**`await` is the only place another task can run.** `await asyncio.sleep(0.2)` and `await client.get(...)` hand the loop back while they wait. `time.sleep(0.2)`, `requests.get(...)` and a CPU-heavy function keep the thread busy, and every other request on the worker waits behind them.",
            "**`async def` does not make code non-blocking.** FastAPI runs `async def` endpoints on the loop and plain `def` endpoints in a thread pool. A blocking call is safer in a `def` endpoint than in an `async def` one.",
            "**Three fixes.** Use an async client for I/O (`httpx.AsyncClient`, `asyncpg`, `redis.asyncio`). Await the sleep (`asyncio.sleep`). Move CPU work off the loop: `await asyncio.to_thread(fn, ...)` for short work or code that releases the GIL, a `ProcessPoolExecutor` via `loop.run_in_executor` for heavy pure-Python work.",
            "**Find the blocking line.** Debug mode (`PYTHONASYNCIODEBUG=1` or `asyncio.run(main(), debug=True)`) logs every task step that holds the loop longer than `loop.slow_callback_duration` (0.1 s by default), with the coroutine and line. In production, measure loop lag: how late a task that sleeps 50 ms wakes up.",
        ]),

        h2("Apply it in the project"),
        p("The handler after the fix: every wait is awaited and the rendering runs in a process pool created once at startup:"),
        code("python", `
import asyncio
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Response

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.maps = httpx.AsyncClient(base_url=MAPS, timeout=5)
    app.state.pool = ProcessPoolExecutor(max_workers=2)
    yield
    await app.state.maps.aclose()
    app.state.pool.shutdown()

app = FastAPI(lifespan=lifespan)

@app.get("/orders/{order_id}/receipt")
async def receipt(order_id: str):
    order = await orders.get(order_id)
    eta = None
    for attempt in range(3):
        response = await app.state.maps.get("/eta", params={"to": order.address})
        if response.status_code != 429:
            eta = response.json()["minutes"]
            break
        await asyncio.sleep(0.2)
    loop = asyncio.get_running_loop()
    pdf = await loop.run_in_executor(app.state.pool, render_receipt, order, eta)
    await receipts.save(order_id, pdf)
    return Response(pdf, media_type="application/pdf")`, "app/receipts.py"),
        callout("info", "A loop lag metric costs ten lines",
            "A background task that sleeps 50 ms and records how late it woke up (`loop.time()` before and after) turns \"the pod is slow\" into a number per pod. Export it as a gauge next to request latency; a lag that grows with traffic means something blocks the loop."),

        h2("Verify"),
        code("bash", `
PYTHONASYNCIODEBUG=1 uvicorn app.main:app --port 8000 &
hey -z 20s -c 40 http://localhost:8000/orders/9/receipt
# before: WARNING asyncio: Executing <Task ... coro=<receipt() running at app/receipts.py:11>> took 0.812 seconds
# after:  no slow-callback warnings
curl -s -o /dev/null -w '%{time_total}\\n' http://localhost:8000/health
# before: 1.83   after: 0.004`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A coroutine called without `await`.** `receipts.save(order_id, pdf)` creates a coroutine object and drops it: nothing is saved and Python only prints `RuntimeWarning: coroutine ... was never awaited` at garbage collection. Treat that warning as an error in tests (`-W error::RuntimeWarning`).",
            "**Blocking calls hidden in libraries.** Sync database drivers, `boto3`, `open().read()` of large files and DNS lookups in some clients block too. Debug mode names the coroutine and line; wrap what has no async version in `asyncio.to_thread`.",
            "**One process pool per request.** Creating a `ProcessPoolExecutor` inside the endpoint starts new processes on every call. Create it once in the app's lifespan and shut it down there.",
        ]),

        challenge("chal_quiz_pas_111"),
        p("Now fix the handler. The editor starts from the fixed `build_receipt` with its key lines missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. The wrong pieces are the lines that caused the incident. Run serves a batch of orders concurrently on a simulated clock and reports the event loop lag a heartbeat task sees."),
        challenge("chal_coding_pas_112"),
    ],
});
