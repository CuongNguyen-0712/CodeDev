// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-1-2",
    title: "TaskGroup and structured concurrency",
    slug: { _type: "slug", current: "asyncio-taskgroup-structured-concurrency" },
    description:
        "Rice Rocket's tracking screen awaited three services one after another, then switched to `asyncio.gather` and started leaking calls that kept running after a failure. Learn structured concurrency with `asyncio.TaskGroup`: tasks that never outlive their block, cancellation of the siblings when one fails, and `except*` for the `ExceptionGroup` it raises.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The courier app's tracking screen calls the order, courier-location and restaurant services. It was slow, and after a rewrite with gather the logs filled with \"Task exception was never retrieved\" while the courier service kept receiving polls for screens that had already shown an error.",
    },

    content: [
        h2("Situation"),
        p("Two versions of the screen's backend, a week apart:"),
        code("python", `
# v1: 0.2 + 0.3 + 0.25 = 0.75 s per screen
order = await api.order(order_id)
courier = await api.courier(order_id)
eta = await api.restaurant_eta(order_id)

# v2: fast, until the restaurant service went down
order, courier, eta = await asyncio.gather(
    api.order(order_id), api.courier(order_id), api.restaurant_eta(order_id))`, "app/tracking.py"),
        code("text", `
ERROR  tracking: restaurant service unavailable (order o1003) -> 503
ERROR  asyncio: Task exception was never retrieved
       future: <Task finished name='Task-5521' coro=<Api.courier() done> exception=NotAssigned()>
INFO   courier-svc: GET /couriers/by-order/o1003 200 (210 ms)   <- after the 503 was sent`, "logs"),
        bullets([
            "v1 added the three latencies together: 0.75 s for every screen.",
            "v2 returned the 503 as soon as one call failed, but the other two calls kept running and their results (or errors) went nowhere.",
            "A new order with no courier yet raised `NotAssigned` and turned the whole screen into an error.",
        ]),

        h2("The core you need"),
        bullets([
            "**Structured concurrency: tasks live inside a block.** `async with asyncio.TaskGroup() as tg:` starts tasks with `tg.create_task(...)`, and the block does not exit until every one of them has finished. No task outlives the code that started it.",
            "**One failure cancels the siblings.** When a task in the group raises, the TaskGroup cancels the tasks still running, waits for them, and raises an `ExceptionGroup` with every error (Python 3.11+). `asyncio.gather` without `return_exceptions` raises the first error but leaves the other awaitables running.",
            "**`except*` handles exception groups.** `except* ApiError as group:` matches the `ApiError`s inside the group (`group.exceptions`); other exception types keep propagating. A plain `except ApiError:` never matches an `ExceptionGroup`.",
            "**Expected outcomes are not errors.** \"No courier yet\" belongs in the data (`None`), not in the group: catch it inside a small wrapper coroutine so it never cancels the other calls.",
            "**Results after the block.** Each `tg.create_task` returns a Task; read `task.result()` after the `async with` block, when they are all done.",
        ]),

        h2("Apply it in the project"),
        code("python", `
async def courier_or_none(api, order_id):
    try:
        return await api.courier(order_id)
    except NotAssigned:
        return None

async def load_tracking(order_id, api):
    failed = []
    try:
        async with asyncio.TaskGroup() as tg:
            order = tg.create_task(api.order(order_id))
            courier = tg.create_task(courier_or_none(api, order_id))
            eta = tg.create_task(api.restaurant_eta(order_id))
    except* ApiError as group:
        failed = sorted({error.service for error in group.exceptions})
    if failed:
        raise TrackingUnavailable(", ".join(failed))
    return {"status": order.result()["status"], "courier": courier.result(), "eta": eta.result()}`, "app/tracking.py"),
        p("The FastAPI route turns `TrackingUnavailable` into a 503 with the failed services in the body, so the app can show which part of the screen is missing."),
        callout("info", "Why the error is raised after the block",
            "An `except*` clause can raise too, but when the group still holds errors of other types Python combines the new exception and those errors into a new `ExceptionGroup`. Recording the failed services in the clause and raising once after the `try` keeps that step simple: one raise, with the full sorted list."),

        h2("Verify"),
        code("bash", `
pytest tests/test_tracking.py -q
# test_loads_in_parallel           PASSED   (elapsed < 0.35 s with fake 0.2/0.3/0.25 s services)
# test_failure_cancels_siblings    PASSED   (courier and order calls see CancelledError)
# test_no_courier_is_not_an_error  PASSED
PYTHONASYNCIODEBUG=1 uvicorn app.main:app &
curl -s localhost:8000/orders/o1003/tracking   # with the restaurant service stopped
# {"detail": "tracking unavailable: restaurant"}   and no "never retrieved" lines in the log`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Fire-and-forget `create_task`.** `asyncio.create_task(send_push(...))` without keeping a reference can be garbage-collected mid-run, and its exception is only logged as \"never retrieved\". Start it in a TaskGroup, or keep the task in a set and remove it in `add_done_callback`.",
            "**Catching `Exception` inside the tasks.** A wrapper that turns every error into `None` hides outages: the screen renders with holes and nobody is paged. Catch only the outcomes that are normal for the product, like `NotAssigned`.",
            "**A TaskGroup around unrelated work.** One failing optional call (recommendations) cancels the required ones (the order). Put optional calls in their own wrapper that returns a fallback, or outside the group.",
        ]),

        p("Now write `load_tracking`. The editor starts with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the v2 mistakes on purpose. Run loads the screen on a simulated clock with services that answer, fail or have no courier, and reports which calls were left running or cancelled."),
        challenge("chal_coding_pas_122"),
    ],
});
