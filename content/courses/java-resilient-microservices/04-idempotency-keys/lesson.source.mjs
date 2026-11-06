// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-jrm-2-1",
    title: "Idempotency keys for payment callbacks",
    slug: { _type: "slug", current: "java-idempotency-keys-payments" },
    description:
        "Rice Rocket charged customers twice when the app retried a payment on a flaky network, and processed one refund callback twice because the provider delivered it twice at the same time. Learn how an idempotency key turns retries and duplicate deliveries into one effect: claim the key first, compare the request, answer duplicates, keep only final answers, and expire keys.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "payment-service takes POST /payments from the courier and customer apps, which retry when the network drops, and callbacks from the payment provider, which delivers each event at least once. Support found 37 double charges in a month and a refund that was booked twice.",
    },

    content: [
        h2("Situation"),
        code("text", `
# customer app on 3G: the first request reached the server, the answer did not reach the phone
10:41:07.212 POST /payments order=ORD-88213 amount=185000          -> 201 charge=ch_7Fp9 (answer lost)
10:41:10.004 POST /payments order=ORD-88213 amount=185000 (retry)  -> 201 charge=ch_7Fq2

# provider callback delivered twice, 3 ms apart, to two pods
02:10:33.101 pod-a POST /payments/callback event=evt_1QxB charge.refunded ch_7Fp9 -> refund booked
02:10:33.104 pod-b POST /payments/callback event=evt_1QxB charge.refunded ch_7Fp9 -> refund booked`, "payment-service logs"),
        bullets([
            "Neither duplicate is a bug in the app or the provider: networks lose answers, and at-least-once delivery means sometimes twice.",
            "The fix belongs on the receiving side: one key per intended operation, and the server makes the second request with that key a no-op.",
        ]),

        h2("The core you need"),
        bullets([
            "**The client chooses the key, once per operation.** The app generates a UUID when the user taps Pay and sends it as `Idempotency-Key` on every retry of that payment; the provider's event id plays the same role for callbacks. (The header is being standardised in an IETF draft; payment providers have used it for years.)",
            "**Claim the key before doing the work.** Insert `(key, request hash, IN_PROGRESS)` first, with a unique constraint on the key, so two concurrent duplicates cannot both start: the second insert fails.",
            "**Answer duplicates by state.** Still running: 409, try again later. Finished: return the kept answer without doing the work. Same key with a different body: 422, the client reused a key by mistake.",
            "**Keep only final answers.** A 201 or a 402 (card declined) will be the same on retry, so keep it. A 5xx means the work did not happen (or must be retried): drop the key so the retry runs again.",
            "**Expire keys.** Keep them as long as a client may still retry (24 hours is common), then delete them; a retention job keeps the table small.",
        ]),

        h2("Apply it in the project"),
        code("sql", `
CREATE TABLE idempotency_keys (
    key           text PRIMARY KEY,
    request_hash  text        NOT NULL,
    status        int,                         -- NULL while the request is running
    response_body jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON idempotency_keys (created_at);    -- for the 24 h clean-up`, "payment-service/src/main/resources/db/migration/V12__idempotency_keys.sql"),
        code("java", `
@Component
class IdempotencyFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        String key = req.getHeader("Idempotency-Key");
        if (key == null || !req.getMethod().equals("POST")) { chain.doFilter(req, res); return; }
        CachedBodyRequest body = new CachedBodyRequest(req);
        String hash = sha256(body.bytes());
        int claimed = jdbc.update("""
            INSERT INTO idempotency_keys (key, request_hash) VALUES (?, ?)
            ON CONFLICT (key) DO NOTHING""", key, hash);
        if (claimed == 0) { answerDuplicate(key, hash, res); return; }   // 422, 409 or the kept answer
        ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(res);
        try {
            chain.doFilter(body, wrapped);
        } finally {
            if (wrapped.getStatus() >= 500) jdbc.update("DELETE FROM idempotency_keys WHERE key = ?", key);
            else jdbc.update("UPDATE idempotency_keys SET status = ?, response_body = ?::jsonb WHERE key = ?",
                             wrapped.getStatus(), new String(wrapped.getContentAsByteArray(), UTF_8), key);
            wrapped.copyBodyToResponse();
        }
    }
}`, "payment-service/src/main/java/com/ricerocket/payment/web/IdempotencyFilter.java"),
        callout("info", "The provider needs the key too",
            "payment-service's own call to the provider must carry an idempotency key as well (the order id works), otherwise a timeout-and-retry inside payment-service charges twice even though the app's request was deduplicated. Lesson 1's retries are only safe with it."),

        h2("Verify"),
        code("bash", `
K=$(uuidgen)
for i in 1 2; do curl -s -o /dev/null -w '%{http_code} ' -X POST localhost:8082/payments \\
  -H "Idempotency-Key: $K" -H 'content-type: application/json' -d '{"orderId":"ORD-9001","amount":185000}'; done
# 201 201
curl -s -o /dev/null -w '%{http_code}\\n' -X POST localhost:8082/payments -H "Idempotency-Key: $K" \\
  -H 'content-type: application/json' -d '{"orderId":"ORD-9001","amount":1}'
# 422
psql -c "select count(*) from charges where order_id = 'ORD-9001'"      # 1`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Check-then-insert instead of insert-first.** `SELECT` then `INSERT` lets two concurrent duplicates both see \"no key\" and both charge. The unique constraint on the key is what serialises them; look for double charges with timestamps milliseconds apart.",
            "**Keeping 5xx answers.** A kept 503 is replayed to every retry, so a payment that failed during a short outage can never succeed with the same key. Only final answers belong in the table.",
            "**Comparing bodies carelessly.** Hash a canonical form (or the fields that define the operation) and compare hashes with `equals`; a key reused for another order must fail with 422, not replay the first order's answer.",
        ]),

        p("Now write the store's decisions. The editor holds `Main.java` with payment-service's idempotency store, its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the double-charge bugs on purpose. The test runner replays timed requests, including duplicates that arrive while the first is still running, and counts the charges."),
        challenge("chal_coding_jrm_142"),
    ],
});
