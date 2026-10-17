// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-1-3",
    title: "Optimistic concurrency: versions & compare-and-swap",
    slug: { _type: "slug", current: "optimistic-concurrency-versions-compare-and-swap" },
    description:
        "Two back-office editors save the same product minutes apart and a promo price silently comes back. Add a version column, turn every write into a compare-and-swap, retry conflicts correctly, carry versions over HTTP with ETag and If-Match, and learn when a lock is the better tool.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, catalog & inventory team of an e-commerce marketplace",
        problem:
            "Monday, 09:58. Editor A opens product 42 to end a weekend promo and raise the price from 49.00 back to 79.00. At the same time editor B opens it to correct the stock from 40 to 400. A saves at 10:02. B saves at 10:05 - and B's form still holds the old price, so the product is back at 49.00. Nobody sees an error, every request returns 200, and 2,300 units sell at the promo price before finance notices. Meanwhile checkout's stock reservation, which already uses a version check, rejects orders with CONFLICT although there is plenty of stock.",
    },

    content: [
        h2("1. The incident"),
        p("The product editor loads the product, lets the user change any field, and saves the whole form back:"),
        code("javascript", `
app.put("/products/:id", async (req, res) => {
    const { name, price, stock } = req.body; // everything the form showed
    await db.query(
        "UPDATE products SET name = $1, price = $2, stock = $3 WHERE id = $4",
        [name, price, stock, req.params.id]
    );
    res.json({ ok: true });
});`, "routes/products.js"),
        p("Each request is correct on its own. Together they are a **lost update**: B's save was based on what B read at 09:58, and it overwrote A's change from 10:02 without anyone knowing that A's change existed. This is the same read-modify-write race as in lesson 1.1, but the window between the read and the write is now **minutes long and spans two HTTP requests**."),
        callout("warning", "Partial updates only shrink the window",
            "Sending only the changed fields (PATCH) would have saved the price here, but two people editing the same field - or a field computed from another one - still race. You need to detect that the row changed since it was read."),

        h2("2. Why a lock does not fit here"),
        p("The obvious fix from lesson 1.1 is to lock. That works when the read and the write happen inside one short transaction or one request. Here they do not:"),
        bullets([
            "`SELECT ... FOR UPDATE` holds the lock only until the transaction ends, and a transaction cannot stay open while a person thinks for five minutes in a browser tab.",
            "Holding a database connection per open edit form would exhaust the pool with a few dozen editors.",
            "A distributed lock with a 10-minute TTL blocks everyone else from the product, expires while the editor is at lunch, and still needs the fencing protection discussed in lesson 1.1.",
        ]),
        p("The alternative is **optimistic concurrency control**: do not prevent concurrent edits, detect them at write time. Assume conflicts are rare, let everyone read freely, and make each write conditional on the row still being exactly what the writer saw."),

        h2("3. A version column and compare-and-swap"),
        p("Give the row a version number that every write increments:"),
        code("sql", `
ALTER TABLE products ADD COLUMN version integer NOT NULL DEFAULT 1;`),
        p("Readers get the version together with the data. Writers send the version they read, and the `WHERE` clause turns the update into a **compare-and-swap**: it only applies if the version is still the one the writer saw, and it bumps the version in the same atomic statement:"),
        code("sql", `
UPDATE products
SET price = $1, version = version + 1
WHERE id = $2 AND version = $3      -- $3 = the version the writer read
RETURNING version;`),
        p("Before looking at the timeline, decide what it means when this statement reports that it updated nothing:"),
        challenge("chal_quiz_nhp_121"),
        image("version-conflict-timeline", {
            alt: "Timeline: editors A and B both read product 42 at version 7. A's UPDATE with version = 7 matches one row and creates version 8. B's UPDATE with version = 7 matches zero rows, so B re-reads version 8, re-applies its change and writes version 9.",
            caption: "The second writer is not silently overwritten - its UPDATE matches no row, and the application decides what happens next.",
        }),
        p("In node-postgres, the result tells you which case you are in:"),
        code("javascript", `
const result = await db.query(
    "UPDATE products SET price = $1, version = version + 1 WHERE id = $2 AND version = $3 RETURNING version",
    [price, id, expectedVersion]
);

if (result.rowCount === 1) {
    return { version: result.rows[0].version }; // our write won
}
// rowCount === 0: the row is gone, or someone else wrote first`),
        callout("info", "Version column, timestamp or xmin?",
            "An integer version is explicit and portable. updated_at timestamps also work but can collide when two writes land in the same millisecond, or when clocks and precision differ between app and DB. PostgreSQL's hidden xmin column changes on every write and can serve as a version without a migration, but it is an implementation detail that tools and replicas do not always preserve. ORMs support the pattern directly: Sequelize models with version: true, TypeORM's @VersionColumn, Hibernate's @Version."),

        h2("4. Handling a conflict: re-read, then retry or report"),
        p("A conflict means **your snapshot is stale**. What to do next depends on who made the change you are applying:"),
        bullets([
            "**Automatic, re-computable changes** - reserving stock, incrementing a counter, appending to a list, merging a settings document. The code can recompute the change from fresh data, so retry it.",
            "**Decisions a person made on a stale screen** - editing a price, a description, an address. Applying them to data the person never saw is exactly the lost update you were trying to prevent. Return a conflict and let the user review the new version.",
        ]),
        p("For the automatic case, each attempt must be a full read-decide-write cycle:"),
        numbered([
            "Read the row **again** - the version and the data. The previous snapshot can never succeed: its version is gone for good.",
            "Re-run the business rules against the fresh data. Stock that was available on the first read may be gone now; that is an `OUT_OF_STOCK`, not a conflict, and must not be retried.",
            "Write with the compare-and-swap. If it matches, you are done.",
            "Bound the attempts (3 to 5 is typical) and add a small randomized delay between them, so writers that collided do not collide again in lockstep. When the attempts run out, fail with a clear `CONFLICT` (HTTP 409).",
        ]),
        callout("error", "Two retry loops that look fine in review",
            "A loop that reads once and retries the write is guaranteed to fail every retry - it keeps sending the dead version. A loop with no attempt limit turns a hot row into an infinite loop that burns CPU and database round trips. Both pass a single-user test."),
        challenge("chal_fix_nhp_122"),

        h2("5. Carrying the version over HTTP: ETag and If-Match"),
        p("For the back-office editor the version has to survive the trip to the browser and back. HTTP has standard headers for exactly this. The server sends the version as an **entity tag** when the resource is read:"),
        code("javascript", `
app.get("/products/:id", async (req, res) => {
    const product = await products.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "NOT_FOUND" });

    res.set("ETag", \`"\${product.version}"\`); // ETag: "7" - entity tags are quoted strings
    res.json(product);
});`),
        p("The client keeps the tag and sends it back with the write as `If-Match: \"7\"` - \"apply this only if the resource is still version 7\". The server's contract for the write:"),
        bullets([
            "**428 Precondition Required** when `If-Match` is missing. Refusing unconditional writes forces every client, including old scripts, to opt into conflict detection.",
            "**412 Precondition Failed** when the version in `If-Match` is not the current one. The client should re-fetch, show the user what changed, and let them save again.",
            "**200 OK** with the new `ETag` when the conditional update matched, so the client can keep editing without another GET.",
            "**404 Not Found** when the resource does not exist at all.",
        ]),
        p("The comparison that matters is the one in the database. Checking `If-Match` against a fresh read in Node.js and then writing unconditionally leaves a gap: another writer can commit between your check and your update. Pass the client's version into the `WHERE version = $n` clause and treat zero updated rows as a `412`."),
        challenge("chal_coding_nhp_123", "Parse the number out of the quoted If-Match value and use that number - not the version you read yourself - in updateIfVersion. A null result means you lost a race (412) unless the product no longer exists (404)."),
        callout("tip", "Weak and strong tags",
            "An ETag prefixed with W/ (for example W/\"7\") is a weak validator, meant for caching. If-Match uses strong comparison, so weak tags never match it. For concurrency control, always issue strong tags derived from the version, never from a hash of a response that can be re-serialized differently."),

        h2("6. Optimistic or pessimistic?"),
        p("Optimistic control trades waiting for retrying. That is a good deal only while conflicts stay rare. Before reading on, think about what happens when they do not:"),
        challenge("chal_quiz_nhp_124"),
        p("A **hot row** - one product in a flash sale, one shared wallet, one counter - is written so often that most optimistic attempts conflict. Each loser repeats a read and a failed write, so database load grows with contention while useful throughput falls. For hot rows, pick a tool that does not waste attempts:"),
        bullets([
            "**One atomic statement** when the rule fits in SQL - the same move as lesson 1.1. No version, no retry, no window: `UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1`.",
            "**A pessimistic row lock** when the decision needs application logic: `SELECT ... FOR UPDATE` inside a short transaction makes the other writers wait their turn instead of failing. Keep the transaction tiny - no HTTP calls inside it.",
            "**Spread the hot row** when even waiting is too slow: shard a counter into N rows and sum them, or append events to a ledger and aggregate asynchronously.",
            "**Queue the writes** through a single consumer per key when ordering matters more than latency.",
        ]),
        code("sql", `
BEGIN;
SELECT stock FROM products WHERE id = $1 FOR UPDATE;   -- waits if another checkout holds the row
-- application checks reservation rules, per-customer limits ...
UPDATE products SET stock = stock - $2 WHERE id = $1;
COMMIT;`),
        p("A rough rule: optimistic for **long think times and rare conflicts** (editors, admin tools, offline-first mobile sync, configuration documents); atomic statements or pessimistic locks for **short, hot, must-succeed writes** (stock in a sale, balances, counters). Both can live in the same table: the catalog editor uses versions, checkout uses the conditional decrement."),
        callout("info", "Measure the conflict rate",
            "Count compare-and-swap conflicts and exhausted retries per endpoint. A conflict rate of a fraction of a percent means optimistic control is working; double-digit percentages mean the row is hot and you should switch strategy for that path."),

        h2("7. Checklist"),
        bullets([
            "Every row that people or jobs edit concurrently has a `version` column (or an ORM version field) that each write increments.",
            "Every write is a compare-and-swap: `WHERE id = $1 AND version = $2`, and zero updated rows is handled as a conflict, never ignored.",
            "Retries start from a fresh read, re-run the business rules, are bounded and use a small random delay; business errors are not retried.",
            "Edits made by a person are not auto-retried: return `409`/`412` and show the newer version.",
            "Over HTTP, `GET` returns a strong `ETag` with the version; writes require `If-Match` (`428` without it) and return `412` when it no longer matches.",
            "The version the client sent goes into the SQL `WHERE` clause - never compare in application code and then write unconditionally.",
            "Hot rows get an atomic statement, a short `SELECT ... FOR UPDATE` transaction, sharding or a queue instead of optimistic retries.",
        ]),
    ],
});
