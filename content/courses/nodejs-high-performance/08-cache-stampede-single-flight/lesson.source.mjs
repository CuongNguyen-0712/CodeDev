// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-3-2",
    title: "Caching without stampedes: single-flight & TTL jitter",
    slug: { _type: "slug", current: "caching-without-stampedes-single-flight-ttl-jitter" },
    description:
        "A cache that works perfectly 59 seconds out of 60 takes the database down in the 60th. See why a hot key's expiry triggers a thundering herd, coalesce misses with single-flight, spread expiries with TTL jitter, serve stale while revalidating, and stop caching errors by accident.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, catalog and checkout team of an e-commerce site",
        problem:
            "Flash sale, 20:00:00. The product page for the discounted phone is served from Redis with a 60-second TTL and takes 3,000 requests per second. Every minute, on the minute, the database CPU spikes to 100% and the page times out for about four seconds. The spikes started the day the sale was announced. Meanwhile checkout has its own problem: after a two-second FX provider blip, payments in EUR failed for ten minutes straight.",
    },

    content: [
        h2("1. The incident"),
        p("The cache hit ratio dashboard says 99.9%. That is the trap: a hit ratio is an average over time, and the misses that hurt are not spread evenly. Look at the exact moment the hot key expires."),
        p("The product endpoint uses the standard **cache-aside** pattern: read from the cache, and on a miss load from the database and write the result back."),
        code("javascript", `
async function getProduct(id) {
    const key = \`product:\${id}\`;
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const product = await db.loadProduct(id);          // ~400 ms under load
    await redis.set(key, JSON.stringify(product), { EX: 60 });
    return product;
}`, "productService.js"),
        p("Cache-aside is simple and fails safe - if Redis is empty, you still serve correct data. Its weakness is concurrency: nothing stops many requests from missing at the same time."),
        challenge("chal_quiz_nhp_311"),

        h2("2. Anatomy of a stampede"),
        p("A **cache stampede** (or thundering herd) needs three ingredients: a hot key, a slow recomputation, and a miss that many requests observe at the same time. The number of duplicate loads is roughly **request rate x load time**: 3,000 rps x 0.4 s is about 1,200 identical queries."),
        p("It feeds on itself. The duplicate queries compete for the same connection pool and CPU, so each one takes longer, so the window stays open longer, so more requests miss. A 400 ms query can become a 9-second one."),
        image("stampede-vs-single-flight", {
            alt: "Left: five requests miss in Redis and each sends its own query to a red, overloaded database. Right: the same requests go through a single-flight box that sends one query and shares the result.",
            caption: "Without coalescing, the miss is multiplied by the request rate. With single-flight, each process sends one query per key.",
        }),
        callout("info", "Where stampedes come from",
            "Hot keys expiring, a cache restart or flush (every key is cold at once), a deploy that changes the key format, and many keys written at the same moment with the same TTL - for example a warm-up job that caches the whole catalog at 03:00 with EX 3600."),

        h2("3. Single-flight: coalesce concurrent misses"),
        p("The most effective fix is to make sure that, per process, only **one** load per key is running at a time. Every other caller that misses while that load is in flight waits for the same promise instead of starting its own. Go's standard library calls this `singleflight`; it is also called request coalescing."),
        p("In Node.js this is natural: a promise can have any number of waiters. You keep a map from key to the in-flight promise and remove the entry when it settles:"),
        bullets([
            "**Per key**: a load for product A never makes product B wait.",
            "**Errors are shared too**: if the load fails, every waiter gets the same rejection - one failed query, not 1,200.",
            "**Forget on settle**: single-flight is not a cache. Once the promise settles the key is removed, and the result lives in Redis with its TTL.",
        ]),
        code("javascript", `
const loadProductOnce = singleFlight((id) => db.loadProduct(id));

async function getProduct(id) {
    const cached = await redis.get(\`product:\${id}\`);
    if (cached) return JSON.parse(cached);

    const product = await loadProductOnce(id);   // 1 query per id per process
    await redis.set(\`product:\${id}\`, JSON.stringify(product), { EX: ttlWithJitter(60) });
    return product;
}`),
        challenge("chal_coding_nhp_312", "A Map from key to promise is enough. Store the promise before anyone can await it, and remove the entry in a handler that runs on success and on failure."),
        callout("tip", "Across processes",
            "Single-flight in memory reduces the herd from about 1,200 queries to one per instance - 8 queries for 8 instances, which is usually fine. If even that is too much (an extremely expensive aggregation), add a short Redis lock: SET rebuild:<key> <token> NX PX 5000; the winner rebuilds, the others serve the stale value or retry after a few milliseconds."),

        h2("4. Spread the expiries: TTL jitter"),
        p("Keys written together expire together. A warm-up job that caches 50,000 products with `EX 3600` schedules 50,000 misses for exactly one hour later. Add a random component to every TTL so expiries are spread out:"),
        code("javascript", `
// 60 s +/- 10%: keys written in the same second expire across a 12-second window
function ttlWithJitter(baseSeconds, spread = 0.1) {
    const delta = baseSeconds * spread;
    return Math.round(baseSeconds - delta + Math.random() * 2 * delta);
}`, "ttl.js"),
        p("Jitter does not help a single hot key - it still expires at some moment - but it prevents many keys from turning into a synchronized wave. Use single-flight for the hot key and jitter for the herd of keys."),

        h2("5. Stale-while-revalidate and errors"),
        h3("Serve stale, refresh in the background"),
        p("For data that can be a few seconds old (product descriptions, prices shown on a listing page, FX rates with a tolerance), store a **soft** expiry inside the value and a longer hard TTL on the key. After the soft expiry the first request triggers a background refresh, and everyone - including that request - keeps getting the stale value until the refresh lands. Users never wait for the database."),
        code("javascript", `
async function getProductSWR(id) {
    const key = \`product:\${id}\`;
    const entry = JSON.parse((await redis.get(key)) || "null");

    if (entry && Date.now() < entry.softExpiresAt) return entry.value;   // fresh
    if (entry) {                                                         // stale: refresh once, answer now
        refreshOnce(id).catch((err) => log.warn({ err, id }, "product refresh failed"));
        return entry.value;
    }
    return refreshOnce(id);                                              // cold: must wait
}

// refreshOnce = singleFlight(async (id) => { load, then SET with softExpiresAt = now + 60 s, EX 600 })`),
        p("The hard TTL bounds how stale the data can get, and a failed refresh simply leaves the old value in place."),
        h3("Never cache an error by accident"),
        p("Caching the **promise** instead of the value is a good trick: concurrent callers share one request even before it resolves. But a promise can reject, and a rejected promise stored in a cache keeps rejecting for every caller until the entry expires. A two-second outage becomes a TTL-long outage."),
        bullets([
            "Evict the entry when its promise rejects - and only if the cache still holds that same entry.",
            "If you want to protect a failing dependency, cache the failure **deliberately**, with a much shorter TTL than successes (negative caching, for example 1-5 seconds).",
            "Never swallow the error into `null` or a default: the caller can no longer tell a missing rate from a broken provider.",
        ]),
        challenge("chal_fix_nhp_313"),
        callout("warning", "The same bug, three disguises",
            "A memoized async function, a lazily created database client (const client = connect() cached at module level) and a promise cache all share it: if the first attempt rejects, every later caller gets the same rejection forever. Check each one for what happens on failure."),

        h2("6. Checklist"),
        bullets([
            "Find your hot keys and estimate the herd: request rate x load time = duplicate loads on every expiry.",
            "Wrap expensive loaders in single-flight per key; add a short Redis lock only when one load per instance is still too many.",
            "Add jitter to every TTL, especially for keys written in batches.",
            "Use stale-while-revalidate (soft expiry + hard TTL) where slightly old data is acceptable.",
            "When caching promises, evict on rejection; cache failures only deliberately and briefly.",
            "Alert on database load at cache-expiry boundaries, not just on the overall hit ratio.",
        ]),
    ],
});
