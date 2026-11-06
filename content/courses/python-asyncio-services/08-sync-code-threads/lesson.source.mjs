// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-3-2",
    title: "Sync code in async apps: threads, executors and free-threading",
    slug: { _type: "slug", current: "asyncio-sync-code-threads-executors" },
    description:
        "Rice Rocket's receipt endpoint rendered PDFs and uploaded them with a blocking SDK inside `async def`, and every endpoint's p99 went from 80 ms to two seconds. Learn how to find blocking calls on the event loop, when a thread is enough, when you need a process, how big the executors really are, and what the free-threaded build changes.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The FastAPI api started generating receipt PDFs (pure-Python rendering, about 300 ms each) and uploading them to S3 with boto3. During the dinner rush, menu and order-status requests that never touch receipts became slow too.",
    },

    content: [
        h2("Situation"),
        code("python", `
@app.post("/orders/{order_id}/receipt")
async def receipt(order_id: int):
    pdf = render_pdf(await load_order(order_id))                         # CPU, ~310 ms
    s3.put_object(Bucket="rr-receipts", Key=f"{order_id}.pdf", Body=pdf)  # boto3, ~400 ms
    return {"ok": True}`, "api/receipts.py"),
        code("text", `
p99 GET /menu           80 ms -> 1.9 s
p99 GET /orders/{id}    95 ms -> 2.1 s
PYTHONASYNCIODEBUG=1:
asyncio WARNING Executing <Task pending name='Task-91' coro=<receipt() running at api/receipts.py:4>> took 0.721 seconds`, "dashboard and debug log"),
        bullets([
            "The event loop runs one coroutine at a time; for 0.7 s per receipt it ran nothing else.",
            "Moving the work into `asyncio.to_thread` made the menu fast again, but eight receipts in a row still took eight times as long.",
            "A webhook batch through `run_in_executor(None, ...)` ran eight calls at a time, not all of them.",
        ]),

        h2("The core you need"),
        bullets([
            "**Blocking calls freeze the loop.** Anything that does not `await` (sync HTTP, boto3, file I/O, CPU work) stops every other task. `asyncio` debug mode (`PYTHONASYNCIODEBUG=1` or `asyncio.run(..., debug=True)`) logs callbacks slower than `loop.slow_callback_duration` (100 ms).",
            "**Threads for blocking I/O.** `await asyncio.to_thread(fn, *args)` runs `fn` in the loop's default executor and awaits the result. FastAPI runs plain `def` endpoints in its own worker threadpool for the same reason, so a sync endpoint is fine; a sync call inside `async def` is not.",
            "**Executors are bounded.** The default executor is a `ThreadPoolExecutor` with `min(32, os.cpu_count() + 4)` workers. Pass your own executor to `loop.run_in_executor` when you need a different size, and prefer an async client when there are hundreds of calls.",
            "**Processes for CPU.** On the standard build the GIL lets one thread run Python bytecode at a time, so CPU-bound work in threads does not use more cores. `loop.run_in_executor(ProcessPoolExecutor(), fn, arg)` does; arguments and results are pickled, so send ids and bytes, not ORM objects.",
            "**Free-threading.** CPython 3.13 shipped an experimental build without the GIL (`python3.13t`), and 3.14 made it a supported option. Pure-Python threads can then run in parallel, but every C extension you use must support it; check `sys._is_gil_enabled()` in the pod before relying on it.",
            "**asyncio objects are not thread-safe.** From another thread, use `loop.call_soon_threadsafe` or `asyncio.run_coroutine_threadsafe`, never `queue.put_nowait` on an `asyncio.Queue` directly.",
        ]),

        h2("Apply it in the project"),
        code("python", `
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager

pdf_pool = ProcessPoolExecutor(max_workers=4)        # one per core of the pod

@asynccontextmanager
async def lifespan(app):
    yield
    pdf_pool.shutdown(wait=True)                     # finish running renders on shutdown

app = FastAPI(lifespan=lifespan)

@app.post("/orders/{order_id}/receipt")
async def receipt(order_id: int):
    order = await load_order(order_id)
    loop = asyncio.get_running_loop()
    pdf = await loop.run_in_executor(pdf_pool, render_pdf, order.to_dict())   # CPU: a process
    await asyncio.to_thread(                                                   # blocking I/O: a thread
        s3.put_object, Bucket="rr-receipts", Key=f"{order_id}.pdf", Body=pdf)
    return {"ok": True}`, "api/receipts.py"),
        callout("info", "Or move it out of the request",
            "A receipt nobody waits for does not belong in the request at all: enqueue the order id and let a worker render and upload it. The executor rules above still apply inside that worker."),

        h2("Verify"),
        code("bash", `
PYTHONASYNCIODEBUG=1 uvicorn api.main:app --workers 1
# no "Executing <Task ...> took" warnings while receipts are generated
hey -z 30s -c 50 http://localhost:8000/menu &
python -m tools.receipts --count 8 --concurrency 8
# 8 receipts in 0.7 s (4 processes); GET /menu p99 stays near 80 ms`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`to_thread` for CPU work.** It keeps the loop responsive but adds no throughput on the GIL build; measure the batch, not one call.",
            "**Unpicklable arguments to a process pool.** Passing a SQLAlchemy object or an open client fails with a pickling error, or worse, sends a huge object graph. Send plain data.",
            "**Thread pools inside thread pools.** A `def` endpoint (already in FastAPI's threadpool) that calls `asyncio.run` or starts its own executor per request multiplies threads. Create executors once at startup.",
        ]),

        challenge("chal_quiz_pas_181"),
    ],
});
