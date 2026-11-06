// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-1-3",
    title: "Timeouts and cancellation",
    slug: { _type: "slug", current: "asyncio-timeouts-cancellation" },
    description:
        "Rice Rocket's checkout waited 90 seconds on a hung payment provider, then got per-step timeouts that added up to 6 seconds, and left dishes reserved whenever a customer closed the app. Learn how cancellation flows through asyncio, one deadline per request with `asyncio.timeout`, cleanup that runs on every exit, and `asyncio.shield` for the one write that must finish.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "During a payment provider incident, checkout requests hung for 90 seconds and the worker ran out of connections. Two weeks later the kitchen app showed dishes as \"reserved\" for orders that had never been paid: customers had closed the app mid-checkout.",
    },

    content: [
        h2("Situation"),
        code("text", `
14:02:11 checkout o2004  reserve ok (0.1 s)
14:02:11 checkout o2004  charge ... (provider not answering)
14:03:41 checkout o2004  charge failed: ReadTimeout after 90.0 s
14:03:41 uvicorn  499 client closed request /checkout   <- the app gave up after 10 s
SELECT count(*) FROM stock_reservations WHERE created_at < now() - interval '1 hour';
 count: 37`, "logs"),
        bullets([
            "The httpx client's default read timeout had been raised to 90 s for a slow export job and shared by checkout.",
            "Customers who closed the app were never charged, but their dishes stayed reserved.",
            "Some charges succeeded at the provider while the ledger row was never written: the request was cancelled in between.",
        ]),

        h2("The core you need"),
        bullets([
            "**Cancellation is an exception thrown into the task.** `task.cancel()` (a client disconnect in uvicorn, a TaskGroup sibling failing, a timeout) raises `asyncio.CancelledError` at the `await` the task is waiting on. Since Python 3.8 it inherits from `BaseException`, so `except Exception` does not catch it.",
            "**One deadline per request.** `async with asyncio.timeout(2.0):` (Python 3.11+) cancels whatever is running inside when the time is up and raises `TimeoutError` at the end of the block. Put the block around all the steps that share the budget, or compute a deadline once and use `asyncio.timeout_at(deadline)` deeper down.",
            "**Clean up on every exit, then let it propagate.** `try/finally` runs on success, on errors, on timeouts and on cancellation. If you need `except asyncio.CancelledError` to clean up, end it with `raise`: swallowing a cancellation breaks `asyncio.timeout` and TaskGroup, which rely on seeing it come back.",
            "**`asyncio.shield` for the step that must finish.** `await asyncio.shield(ledger.record(...))` keeps the inner write running when the outer task is cancelled; the caller still gets `CancelledError` right away. Use it only for short, must-finish work, and keep a reference so the shielded task is not lost.",
            "**`asyncio.wait_for` is the older form.** It works for a single awaitable; `asyncio.timeout` reads better when several awaits share a budget.",
        ]),

        h2("Apply it in the project"),
        code("python", `
async def checkout(order, deps):
    reservation = None
    paid = False
    try:
        async with asyncio.timeout(2.0):
            reservation = await deps.stock.reserve(order["id"])
            charge = await deps.payments.charge(order["id"], order["amount"])
        paid = True
        await asyncio.shield(deps.ledger.record(order["id"], charge))
        return {"status": "paid", "charge": charge}
    except TimeoutError:
        return {"status": "timeout"}
    except PaymentDeclined:
        return {"status": "declined"}
    finally:
        if reservation is not None and not paid:
            await deps.stock.release(reservation)`, "app/checkout.py"),
        p("The payment client gets its own timeouts too (`httpx.Timeout(connect=1.0, read=1.5)`), so one slow export no longer changes checkout behaviour; the `asyncio.timeout` is the budget of the whole request on top of them."),
        callout("info", "A charge that timed out may still have happened",
            "Hitting the deadline only stops waiting. The provider may still capture the charge after Rice Rocket gave up, so the payment call sends an idempotency key, and a reconciliation job compares provider captures with ledger rows every few minutes."),

        h2("Verify"),
        code("bash", `
pytest tests/test_checkout.py -q
# test_shared_deadline                PASSED  (fake provider 1.95 s -> timeout at 2.0 s)
# test_disconnect_releases_stock      PASSED  (task.cancel() during charge -> CancelledError, stock released)
# test_ledger_written_after_cancel    PASSED  (cancel during record -> row still written)
psql -c "SELECT count(*) FROM stock_reservations WHERE created_at < now() - interval '1 hour'"
#  count: 0`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Awaiting inside `finally` after a second cancel.** If the task is cancelled again while the cleanup awaits, the cleanup itself is interrupted. Keep cleanup short, or shield it when it must complete; watch for reservations that never get released in the metrics.",
            "**Shielding everything.** A shielded call keeps running after the caller left, so shielding slow work turns cancellations into hidden load. Shield only short writes that keep data consistent.",
            "**Timeouts only at the HTTP client.** A client read timeout covers one network read, not the request: retries and several calls in a row can still add up to minutes. Keep one deadline per request on top of client timeouts.",
        ]),

        challenge("chal_quiz_pas_131"),
        p("Now write the checkout. The editor starts from `checkout` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the earlier fixes that did not work. Run plays one checkout on a simulated clock: a slow provider, a declined card, or a client that disconnects at a given second."),
        challenge("chal_coding_pas_132"),
    ],
});
