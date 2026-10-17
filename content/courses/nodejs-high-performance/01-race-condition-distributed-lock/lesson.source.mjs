// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-1-1",
    title: "Payment race conditions & distributed locks",
    slug: { _type: "slug", current: "payment-race-conditions-distributed-locks" },
    description:
        "Two payments hit the same e-wallet at the same moment and both get approved. Reproduce the double spend, see why a single-threaded Node.js process still races, then fix it with atomic updates and a Redis lock you write yourself.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, payments team of an e-wallet",
        problem:
            "Friday, 21:04. A customer with 100,000 in wallet-42 double-taps \"Pay\" on an 80,000 checkout. The two POST /payments requests reach the API 3 ms apart. Both are approved, the merchant is paid 160,000, and the wallet ends at 20,000 instead of rejecting the second payment. Finance wants to know how money that did not exist was spent - and wants it to never happen again.",
    },

    environmentSetup: {
        dockerImage: "redis:7-alpine",
        starterAssetKey: "courses/nodejs-high-performance/01-race-condition-distributed-lock/starter-template.zip",
        setupSteps: [
            { label: "Unzip the starter project and start Redis", command: "docker compose up -d" },
            { label: "Install dependencies (Node.js 20+)", command: "npm install" },
            { label: "Start the wallet API with the lock off", command: "npm start" },
            { label: "In a second terminal, fire two concurrent payments of 80,000", command: "npm run attack" },
            { label: "After implementing src/lock.js, restart with the lock on", command: "npm run start:locked" },
            { label: "Attack again with 10 concurrent payments", command: "npm run attack -- 10" },
        ],
    },

    content: [
        h2("1. The incident"),
        p("Nothing crashed, no error was logged and every response was a clean `200 OK`. The bug only shows up in the ledger: two approvals for 80,000 each against a wallet that held 100,000. This is the hardest kind of bug to catch in review - each request, read on its own, is correct."),
        p("The payment handler from the starter project looks reasonable:"),
        code("javascript", `
async function debit(walletId, amount) {
    const wallet = await repo.findById(walletId);
    if (wallet.balance < amount) {
        return { status: 409, body: { error: "INSUFFICIENT_FUNDS" } };
    }

    await repo.save({ ...wallet, balance: wallet.balance - amount });
    return { status: 200, body: { ok: true, balance: wallet.balance - amount } };
}`, "src/server.js"),
        p("Run the lab (see **Local lab** above). With the lock off, `npm run attack` prints something like:"),
        code("bash", `
approved 2 x 80000 = 160000, wallet balance now 20000
DOUBLE SPEND: more money approved than the wallet held.`),
        callout("warning", "A correctness bug, not a performance bug",
            "Adding servers, caches or retries makes this worse, not better: retries and double taps are exactly what creates concurrent requests for the same wallet."),

        h2("2. Why a single thread still races"),
        p("Node.js runs your JavaScript on one thread, so two lines never execute at the same instant. But every `await` hands control back to the event loop. While request A waits for the database, request B runs - and reads the same balance A just read."),
        image("race-timeline", {
            alt: "Timeline of two concurrent payments: both read balance 100,000, both pass the check, both write 20,000; one debit is lost.",
            caption: "Both requests read before either writes. The second write silently overwrites the first.",
        }),
        p("Two patterns cause almost every race of this kind:"),
        bullets([
            "**Check-then-act**: the decision (`balance >= amount`) is based on a value that can change before you act on it.",
            "**Read-modify-write**: the new value is computed in application memory and written back, overwriting whatever happened in between.",
        ]),
        p("The window between the read and the write is the **critical section**. Correctness requires that, for one wallet, only one request is ever inside it."),
        challenge("chal_quiz_nhp_101"),

        h2("3. Atomicity: one indivisible step"),
        p("An operation is **atomic** when nobody can observe or interleave with its intermediate states. There are three common ways to make the debit atomic, from most to least preferred."),

        h3("Option A - let the database do the check"),
        p("Move the check into the write. The database evaluates the condition and applies the update as one step, so there is no window at all:"),
        code("sql", `
UPDATE wallets
SET balance = balance - $1
WHERE id = $2 AND balance >= $1
RETURNING balance;`),
        p("No row returned means insufficient funds (or no such wallet). This is the cheapest and most robust fix whenever the whole decision fits in one statement."),

        h3("Option B - lock the row inside a transaction"),
        p("When the decision needs more logic (limits, fraud rules, several tables), `SELECT ... FOR UPDATE` inside a transaction makes other transactions wait for the row until you commit."),
        code("sql", `
BEGIN;
SELECT balance FROM wallets WHERE id = $1 FOR UPDATE;
-- application checks limits, fraud rules ...
UPDATE wallets SET balance = balance - $2 WHERE id = $1;
COMMIT;`),

        h3("Option C - a lock in the application"),
        p("Sometimes the critical section is not inside one database: a call to a payment provider, a cache plus a database, a file. Then you serialize the requests yourself with a lock keyed by the resource, for example `withLock(walletId, fn)`."),
        p("A lock only protects the work that finishes **before the lock is released**. `withLock` releases the lock when the promise returned by `fn` settles - so everything in the critical section must be part of that promise."),
        code("javascript", `
// Wrong: fn returns before the write happens. The lock is released
// while the read/write chain is still running in the background.
await locks.withLock(key, async () => {
    loadProfile(id).then((profile) => saveProfile(applyChanges(profile)));
});

// Right: every step is awaited inside fn, so the lock is held until the write is done.
await locks.withLock(key, async () => {
    const profile = await loadProfile(id);
    await saveProfile(applyChanges(profile));
});`),
        callout("error", "Floating promises break atomicity",
            "A promise that is created but neither awaited nor returned is a 'floating' promise. Inside a lock it silently escapes the critical section. In TypeScript projects, enable the @typescript-eslint/no-floating-promises lint rule; in plain JavaScript, review every .then() inside a lock or transaction callback."),
        challenge("chal_fix_nhp_102"),

        h2("4. From one process to many: a Redis lock"),
        p("An in-memory lock works for one Node.js process. In production the API runs as several instances behind a load balancer, and the two taps can land on different instances. The lock has to live somewhere every instance can see: Redis is the usual choice."),
        p("Acquiring is a single atomic command:"),
        code("bash", `
SET lock:wallet:wallet-42 3f1c9a... NX PX 5000   # OK    -> acquired
SET lock:wallet:wallet-42 9b2e41... NX PX 5000   # (nil) -> someone else holds it`),
        bullets([
            "`NX` - only set the key if it does not exist: exactly one caller wins.",
            "`PX 5000` - the key expires after 5 seconds, so a crashed holder cannot block the wallet forever.",
            "The value is a **random token** unique to this acquisition. You will see why in a moment.",
        ]),
        image("redis-lock-flow", {
            alt: "Two API instances race to SET NX PX the same key; one gets OK and runs the debit, the other gets nil and returns 409.",
            caption: "One winner per key. The loser fails fast with 409 PAYMENT_IN_PROGRESS instead of waiting.",
        }),
        p("The TTL is a safety net, and it has a price. Think about what happens when a holder is slower than its TTL."),
        challenge("chal_quiz_nhp_103"),

        h3("Release only what you own"),
        p("A plain `DEL` deletes the key no matter who holds it now. Release must check the token and delete in one atomic step - in Redis that means a small Lua script, which runs without interruption:"),
        code("lua", `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0`, "release.lua"),
        p("With ioredis, run it with `redis.eval(RELEASE_SCRIPT, 1, key, token)`: it returns `1` when you still owned the lock and `0` when it had already expired or been taken over."),
        callout("tip", "Shape of a good lock API",
            "acquire(key, ttlMs) returns a token or null - never throws for 'already held'. release(key, token) returns a boolean. Always release in a finally block, and treat a false release as a signal that your critical section ran longer than the TTL."),
        challenge("chal_coding_nhp_104", "Generate the token inside acquire (once per call), not once per lock object. Release must go through the atomic compare-and-delete, never a plain delete."),
        p("Now implement the same thing for real in `src/lock.js` of the starter project, restart with `npm run start:locked` and attack with 10 concurrent payments: exactly one 80,000 payment is approved, the rest get `409`."),

        h2("5. When the TTL is shorter than the work"),
        p("A lock with a TTL is a **lease**, not a guarantee. A long GC pause, a slow provider call or a network partition can outlast it. The holder wakes up still believing it owns the lock and writes anyway."),
        image("ttl-expiry-hazard", {
            alt: "Holder A pauses past its TTL, B acquires the lock, then A resumes and writes stale data over B's update.",
            caption: "Token checks protect the lock key. They do not stop A from writing to the database after its lease expired.",
        }),
        p("Defend in depth:"),
        numbered([
            "**Keep the database guard.** Even with a Redis lock, write with the conditional `UPDATE ... WHERE balance >= $1`. The lock reduces contention; the database keeps the invariant.",
            "**Fencing tokens.** Give each acquisition a monotonically increasing number (for example `INCR lock:wallet:42:fence`) and have the storage reject writes carrying a number older than the last one it accepted.",
            "**Idempotency keys.** The client sends an `Idempotency-Key` header per checkout. The server stores the first result under that key and returns it for every retry or double tap - the second request never becomes a second payment.",
        ]),
        callout("info", "What about Redlock?",
            "Redlock acquires the lock on a majority of independent Redis nodes to survive a node failure. It still relies on timing assumptions, so it does not remove the need for fencing tokens or a database-level guard on money."),

        h2("6. Checklist"),
        bullets([
            "Find every check-then-act and read-modify-write on shared state; each `await` inside it is a window for another request.",
            "Prefer a single conditional statement in the database; use `SELECT ... FOR UPDATE` when the decision needs more logic.",
            "Inside lock or transaction callbacks, await or return every promise - no floating `.then()`.",
            "Distributed lock: `SET key <random token> NX PX <ttl>`, release with an atomic compare-and-delete, always in `finally`.",
            "Choose a TTL well above the p99 of the critical section and log when release returns false.",
            "Money still needs a database guard, and client retries need idempotency keys.",
        ]),
    ],
});
