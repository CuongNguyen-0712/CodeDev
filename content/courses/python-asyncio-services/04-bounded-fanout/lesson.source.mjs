// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-pas-2-1",
    title: "Semaphore-limited fan-out",
    slug: { _type: "slug", current: "asyncio-semaphore-bounded-fan-out" },
    description:
        "Rice Rocket's morning menu refresh went from two minutes one-by-one to a burst of 300 concurrent calls that the partner gateway answered with 429s, and one broken restaurant failed the whole batch. Learn bounded fan-out with `asyncio.Semaphore`, per-item error handling, and how to pick the limit from what the other side can take.",
    estimatedTime: 14,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "At 09:30 a worker refreshes the menus of 300 partner restaurants before the lunch rush. The partner gateway allows 20 open connections per client; above that it answers 429.",
    },

    content: [
        h2("Situation"),
        code("python", `
# v1: 300 x 0.4 s = two minutes, menus still updating at 09:32
for rid in restaurant_ids:
    menus[rid] = await partners.menu(rid)

# v2: everything at once
menus = await asyncio.gather(*(partners.menu(rid) for rid in restaurant_ids))`, "app/menu_refresh.py"),
        code("text", `
09:30:00 menu_refresh  starting 300 restaurants
09:30:00 partner-gw    429 Too Many Requests (x 280)
09:30:00 menu_refresh  FAILED: PartnerError: HTTP 429 from the partner gateway (r021)
09:30:00 menu_refresh  0 menus updated`, "logs"),
        bullets([
            "v1 was correct and too slow.",
            "v2 opened 300 calls at once; everything above 20 got a 429, and `gather` raised the first error, so not even the 20 good menus were saved.",
            "The same burst would hit any limit: open files, the database pool, the CPU of a small partner's server.",
        ]),

        h2("The core you need"),
        bullets([
            "**Concurrency needs a limit.** `asyncio.gather` and `TaskGroup` start every coroutine at once. Starting tasks is cheap; what is limited is on the other side (connection limits, rate limits, a database pool) and on yours (file descriptors, memory).",
            "**`asyncio.Semaphore(n)` is a counter of slots.** Create it once and share it; `async with slots:` around the call waits for a free slot and gives it back on exit, even on errors. A semaphore created inside each call limits nothing.",
            "**Hold the slot only around the scarce part.** Parsing the menu, logging and writing to your own cache do not need a partner connection; keep them outside `async with`.",
            "**One failure must not fail the batch.** Catch the expected error per item and return it as data, or use `asyncio.gather(..., return_exceptions=True)` and sort results from exceptions afterwards. `gather` returns results in the order of its arguments.",
            "**Pick the limit from the other side.** Start from the documented limit (20 open calls here) minus what other workers use, and watch latency: when it rises with concurrency, the other side is saturated.",
        ]),

        h2("Apply it in the project"),
        code("python", `
async def refresh_menus(restaurant_ids, partners, limit=10):
    slots = asyncio.Semaphore(limit)

    async def fetch_one(restaurant_id):
        async with slots:
            return await partners.menu(restaurant_id)

    async def fetch_or_error(restaurant_id):
        try:
            return {"ok": await fetch_one(restaurant_id)}
        except PartnerError as error:
            return {"error": str(error)}

    results = await asyncio.gather(*(fetch_or_error(rid) for rid in restaurant_ids))
    return dict(zip(restaurant_ids, results))`, "app/menu_refresh.py"),
        p("The worker runs two replicas, so each uses `limit=10` to stay under the gateway's 20. With an httpx client, the same limit also belongs in `httpx.Limits(max_connections=10)`, so a forgotten semaphore elsewhere cannot open more."),
        callout("info", "Semaphore or a queue?",
            "A semaphore fits a batch whose size you know and whose results you collect at the end. When items arrive continuously or the batch is too large to start as tasks at once (millions of rows), use a bounded queue with a fixed number of workers: the next lesson."),

        h2("Verify"),
        code("bash", `
python -m app.menu_refresh --dry-run
# 300 restaurants, limit 10: 30 rounds, max open 10, 12.1 s
# errors: r004 HTTP 503, r009 HTTP 503
# 298 menus updated
grep -c " 429 " /var/log/partner-gw/access.log   # 0 since the change`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`return_exceptions=True` and then forgetting to look.** The results list mixes values and exception objects; code that treats every item as a menu crashes later or saves an exception as a menu. Split them right after `gather` and log the failures.",
            "**A slot held during retries and backoff.** Sleeping inside `async with slots:` keeps a connection-sized slot busy doing nothing. Release the slot between attempts.",
            "**Unbounded work hidden one level down.** Each restaurant call that itself fans out to 30 dish-image requests turns a limit of 10 into 300. Share one semaphore (or one client with `max_connections`) for the scarce resource.",
        ]),

        p("Now write `refresh_menus`. The editor starts with its key lines missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat v1 and v2 on purpose. Run refreshes the restaurants on a simulated clock against a gateway that answers 429 above 20 open calls."),
        challenge("chal_coding_pas_142"),
    ],
});
