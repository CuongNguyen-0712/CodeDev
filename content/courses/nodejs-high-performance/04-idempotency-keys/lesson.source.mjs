// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-2-1",
    title: "Idempotent payment APIs with Idempotency-Key",
    slug: { _type: "slug", current: "idempotent-payment-apis-idempotency-key" },
    description:
        "A timed-out checkout is retried and the customer is charged twice. Learn why retries are unavoidable, then make POST /payments safe to repeat with an Idempotency-Key: store the first response, replay it, reject reused keys and handle duplicates that arrive while the first request is still running.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, checkout team of an e-commerce marketplace",
        problem:
            "Black Friday, 20:12. The payment provider slows down to 9 seconds per charge while the API gateway times out at 8. The mobile app sees 504 Gateway Timeout, shows \"Something went wrong, try again\", and its HTTP client also retries automatically. 1,840 orders are charged two or three times. Every charge succeeded at the provider - the API simply had no way to know that a retry was the same payment.",
    },

    content: [
        h2("1. The incident"),
        p("Nothing was wrong with the charge logic. Each `POST /payments` did exactly what it was asked: validate the cart, call the provider, insert a payment row, return `201`. The problem is that the client asked three times."),
        code("javascript", `
app.post("/payments", async (req, res) => {
    const { orderId, walletId, amount, currency } = req.body;
    const charge = await provider.charge({ walletId, amount, currency });
    const payment = await payments.insert({ orderId, chargeId: charge.id, amount, currency });
    res.status(201).json(payment);
});`, "src/routes/payments.js"),
        p("When the gateway gave up after 8 seconds, the charge was still running and later succeeded. The client only saw a timeout. From its point of view the outcome is **unknown**: maybe nothing happened, maybe the payment went through. The only safe move for the client is to try again - and the only safe move for the server is to make trying again harmless."),
        callout("warning", "Retries are not optional",
            "Mobile networks drop responses, load balancers time out, HTTP clients and SDKs retry on their own, and users double-tap. You cannot stop duplicate requests from arriving. You can only make the endpoint idempotent: running it twice has the same effect as running it once."),

        h2("2. The Idempotency-Key contract"),
        p("`GET`, `PUT` and `DELETE` are idempotent by definition. `POST /payments` is not: every call creates a new charge. The standard fix, used by Stripe, Adyen and most payment APIs, is a request header chosen by the client:"),
        code("http", `
POST /payments HTTP/1.1
Content-Type: application/json
Idempotency-Key: 5f0c2a7e-3b1d-4e8a-9c61-2d7f4b8e1a90

{ "orderId": "ord_1029", "walletId": "wallet-42", "amount": 80000, "currency": "VND" }`),
        p("The contract is simple to state:"),
        bullets([
            "The client generates one key per **payment intent** and sends the same key on every retry of that request.",
            "The server executes the request at most once per key and returns the **same response** to every retry.",
            "A key is scoped to the caller (merchant or user), so two clients can never collide.",
        ]),
        p("Getting the first rule wrong defeats the whole mechanism, so think carefully about where the key is created."),
        challenge("chal_quiz_nhp_201"),

        h2("3. Store the first response, replay it"),
        p("The server needs a record per key that survives restarts and is visible to every API instance. In PostgreSQL that is a small table with a composite primary key:"),
        code("sql", `
CREATE TABLE idempotency_keys (
    merchant_id     text        NOT NULL,
    key             text        NOT NULL,
    request_hash    text        NOT NULL,          -- fingerprint of method + path + body
    status          text        NOT NULL,          -- 'in_flight' | 'completed'
    response_status int,
    response_body   jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, key)
);`),
        p("The request flow has four outcomes, decided before any money moves:"),
        image("idempotency-key-flow", {
            alt: "A client request with an Idempotency-Key is looked up first. Not found: reserve and charge. In flight: 409. Completed with the same hash: replay the stored response. Different hash: 422.",
            caption: "Only the 'key not found' branch ever reaches the payment provider.",
        }),
        p("Reserving the key is an `INSERT ... ON CONFLICT DO NOTHING`. The primary key guarantees that only one request, on any instance, gets a row back:"),
        code("javascript", `
async function reserveKey(db, merchantId, key, requestHash) {
    const { rowCount } = await db.query(
        \`INSERT INTO idempotency_keys (merchant_id, key, request_hash, status)
         VALUES ($1, $2, $3, 'in_flight')
         ON CONFLICT (merchant_id, key) DO NOTHING\`,
        [merchantId, key, requestHash],
    );
    return rowCount === 1; // true: we own the key and may charge
}

async function completeKey(db, merchantId, key, status, body) {
    await db.query(
        \`UPDATE idempotency_keys
         SET status = 'completed', response_status = $3, response_body = $4
         WHERE merchant_id = $1 AND key = $2\`,
        [merchantId, key, status, body],
    );
}`, "src/idempotency/pgStore.js"),
        p("When the reservation fails, load the existing row and decide. A replayed response should be byte-for-byte what the first caller would have received, including the status code - many APIs also add a header such as `Idempotent-Replayed: true` so clients and logs can tell the difference."),
        callout("tip", "Pass the key downstream",
            "Most payment providers accept their own idempotency key. Send a key derived from yours (for example `pay:<merchant>:<key>`) on the provider call. If your process crashes after the provider charged but before you stored the response, the next attempt gets the original charge back instead of a second one."),

        h2("4. Duplicates in flight and reused keys"),
        p("The double tap from the incident does not arrive as a polite retry after the first response. It arrives **while the first request is still charging**. At that moment there is no stored response to replay yet - only the `in_flight` reservation. There are two reasonable answers:"),
        bullets([
            "**Reject fast**: reply `409 Conflict` (Stripe's choice) with a `Retry-After` header. The client retries a moment later and receives the replayed response.",
            "**Wait**: hold the duplicate until the first request completes, then replay. Friendlier for clients, but it ties up a connection per duplicate and needs a timeout.",
        ]),
        p("Either way, the duplicate must never start a second charge - so the reservation has to happen **before** the first `await` of the expensive work, not after it."),
        h3("Same key, different request"),
        p("A key reused with a different body is a client bug - for example, the app reused the key from a previous checkout. Silently replaying the old response would tell the customer that a 95,000 payment succeeded when only an 80,000 one did. Store a fingerprint of the request and compare it on every lookup:"),
        code("javascript", `
import { createHash } from "node:crypto";

function requestFingerprint(req) {
    // Canonical JSON for a flat body: sorted keys, so { a, b } and { b, a } hash the same.
    // (Nested bodies need a recursive canonicalizer such as RFC 8785 / JCS.)
    const body = JSON.stringify(req.body, Object.keys(req.body).sort());
    return createHash("sha256").update(\`\${req.method} \${req.path} \${body}\`).digest("hex");
}

// lookup: row.request_hash !== requestFingerprint(req)
//   -> 422 Unprocessable Entity { error: "IDEMPOTENCY_KEY_REUSED" }`),
        h3("When the work fails"),
        p("Decide which outcomes are final. A declined card or `INSUFFICIENT_FUNDS` is a real answer: store it and replay it. A crash or a provider `503` **before anything was charged** is not: delete the reservation so the client's retry can run the payment again. Otherwise the key is stuck `in_flight` and the customer can never pay with it."),
        challenge("chal_coding_nhp_202", "Reserve the key synchronously, before you await fn(). Check the fingerprint before the in-flight state, and when fn() throws remove only the reservation you created."),

        h2("5. Where to keep the keys"),
        p("The in-memory store from the challenge is the right logic in the wrong place: it only protects one process. In production the keys must be shared by every instance."),
        h3("Option A - the database, in the same transaction"),
        p("Reserve the key, write the payment and mark the key completed inside one transaction. The unique constraint makes the reservation race-free, and the transaction means a crash can never leave a payment without its key - or a completed key without its payment."),
        code("sql", `
BEGIN;
INSERT INTO idempotency_keys (merchant_id, key, request_hash, status)
VALUES ($1, $2, $3, 'in_flight');                 -- unique violation -> duplicate
INSERT INTO payments (order_id, charge_id, amount, currency) VALUES (...);
UPDATE idempotency_keys
SET status = 'completed', response_status = 201, response_body = $4
WHERE merchant_id = $1 AND key = $2;
COMMIT;`),
        p("The external provider call cannot be part of that transaction, which is why you also pass the key to the provider and why a row stuck `in_flight` for longer than the provider timeout needs a recovery job that asks the provider what happened."),
        h3("Option B - Redis"),
        p("`SET idem:<merchant>:<key> <hash> NX PX 86400000` reserves a key in well under a millisecond and expires it automatically. It is a good fit for very high request rates, but remember what it does not give you: Redis is not in your database transaction, and a failover can lose recently written keys. For money, keep a database constraint (for example a unique `order_id` on payments) as the last line of defence."),
        h3("TTL"),
        p("Keys cannot live forever, but they must outlive every retry the client may still make: the app's retry policy, a user reopening the checkout screen, an offline queue that flushes the next morning. 24 hours is a common default. Delete expired rows with a scheduled job (`DELETE ... WHERE created_at < now() - interval '24 hours'`)."),
        challenge("chal_quiz_nhp_203"),

        h2("6. Checklist"),
        bullets([
            "Every non-idempotent endpoint that moves money accepts an `Idempotency-Key` header, scoped to the caller.",
            "Clients generate the key once per payment intent and reuse it for every retry; never per HTTP attempt.",
            "Reserve the key atomically (unique constraint or `SET NX`) before doing any work; store the final response and replay it with the same status.",
            "Duplicates in flight get `409` (or wait); a key reused with a different fingerprint gets `422`.",
            "Release the reservation when the work fails before anything was committed; store deterministic failures as final answers.",
            "Pass the key to the payment provider, keep a database-level guard on money, and expire keys only after the client's retry window.",
        ]),
    ],
});
