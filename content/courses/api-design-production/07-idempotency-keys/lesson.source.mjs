// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-adp-3-1",
    title: "Idempotency keys: safe retries for POST",
    slug: { _type: "slug", current: "idempotency-keys-safe-retries-post" },
    description:
        "A learner was charged twice for one course because the mobile app retried POST /payments after a timeout, with an Idempotency-Key header the API never read. Learn what an idempotency key promises and when you do not need one, how to store keys in PostgreSQL with a unique key that decides who runs, why the same key with a different body is 422 and a concurrent repeat is 409, why 5xx results are not stored, and how to build it as a NestJS interceptor you can test with a fake clock.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev payments API",
        problem:
            "Support ticket #4471: a learner bought API Design for Production once and was charged 149,000 VND twice. The payment provider's dashboard shows two successful charges 10 seconds apart; the API created two orders. The mobile app gives up on a request after 10 seconds and retries POST /payments once, reusing the same Idempotency-Key header, exactly as the client team was told to do. The first request was slow, not lost: the provider took 12.4 seconds to answer, so the API finished the first charge while the retry was already charging again. Nothing in the API reads the Idempotency-Key header.",
    },

    content: [
        h2("1. The incident: one purchase, two charges"),
        p("The ticket came with a screenshot of the learner's bank app: two debits of 149,000 VND from CodeDev, ten seconds apart. The API access log for that learner tells the rest:"),
        code("text", `
14:02:07.112  POST /payments  user=u_17  idempotency-key=pay-7f3a  -> 201  12412 ms  order=ord_5521
14:02:17.130  POST /payments  user=u_17  idempotency-key=pay-7f3a  -> 201   1904 ms  order=ord_5522`, "api access log"),
        p("Read the timeline. At 14:02:07 the app sends the purchase. The payments handler calls the provider, which is slow today. At 14:02:17 the app's 10-second timeout fires; the app cannot know whether the charge happened, so it retries with the **same key**. The API does not look at the key, treats the retry as a new purchase and charges again. Two seconds later both requests answer `201 Created`. The app shows one success; the learner pays twice."),
        p("The client did its part. A timeout means \"I do not know what happened\", and a client that retries a `POST` must send something that lets the server recognise the repeat. The bug is on the server: it accepted the header and ignored it. This lesson makes that header mean something."),

        h2("2. Reproduce it and read the evidence"),
        p("On a local API with the fake payment provider set to answer after 12 seconds, send the same purchase twice with the same key, the second one while the first is still running:"),
        code("bash", `
KEY=pay-$(uuidgen)
BODY='{"courseId":"api-design-production","amount":149000,"currency":"VND","method":"card"}'
for i in 1 2; do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\\n" -X POST https://api.codedev.test/payments \\
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
    -H "Idempotency-Key: $KEY" -d "$BODY" &
  sleep 10
done; wait

201 12.43s
201 2.41s`, "terminal"),
        p("Two `201` answers for one key. The database confirms it; this query is the check you will rerun after the fix:"),
        code("sql", `
SELECT user_id, course_id, count(*) AS charges, min(created_at), max(created_at)
FROM payments
WHERE status = 'succeeded'
GROUP BY user_id, course_id
HAVING count(*) > 1;

 user_id | course_id             | charges | min                 | max
---------+-----------------------+---------+---------------------+---------------------
 u_17    | api-design-production |       2 | 2026-10-21 14:02:19 | 2026-10-21 14:02:19`),

        h2("3. What an idempotency key promises, and when you do not need one"),
        p("RFC 9110 calls a method idempotent when sending the same request many times has the same intended effect as sending it once. `PUT` and `DELETE` are idempotent by definition; `POST` is not. An **idempotency key** makes one particular `POST` idempotent: the client generates a unique value once per user action (a UUID), sends it in the `Idempotency-Key` header on every attempt of that action, and the server promises:"),
        bullets([
            "**Same key, same request: the same response.** The first request runs the handler and the server stores its response. Every repeat gets the stored response, and the handler does not run again.",
            "**Same key, different request: an error.** A key identifies one request. If the body differs, the client has a bug (it reused a key for another purchase), and replaying an old response would hide it. Answer `422`.",
            "**Same key while the first request is still running: an error, for now.** The response does not exist yet. Answer `409 Conflict` and let the client retry a little later, when it will get the stored response.",
            "**Keys belong to a user and expire.** Scope them per authenticated user, so one learner's key can never return another learner's payment, and delete them after a period (24 hours is common) that is longer than any client will keep retrying.",
        ]),
        callout("info", "The header is a draft, check its status",
            "The Idempotency-Key header is described in an IETF HTTPAPI working group draft (draft-ietf-httpapi-idempotency-key-header), not in a published RFC at the time of writing; check its current status on datatracker.ietf.org before you cite it. The draft's suggestions are the ones used here: 400 when a required key is missing, 422 when a key is reused with a different payload, 409 while the first request is still being processed. Several payment APIs use the same header with the same behaviour, and a server that does not implement it simply ignores it - which is exactly what happened in this incident."),
        h3("When not to use one"),
        bullets([
            "**The method is already idempotent.** `PUT /courses/42/lessons/7` with the full lesson and `DELETE /enrollments/9` give the same result when repeated. A key adds storage and nothing else.",
            "**The data has a natural key.** A learner can enroll in a course only once. A unique constraint on `enrollments (user_id, course_id)` plus `INSERT ... ON CONFLICT DO NOTHING` makes `POST /enrollments` safe to retry with no extra table. Prefer that whenever the business rule already says \"only one\".",
            "**Repeats are legitimate.** Topping up 100,000 VND of points twice in a minute can be intended, and gifting the same course to two friends is two purchases. There is no natural key to tell a retry from a second purchase - that is the case for idempotency keys, and it is why `POST /payments` needs one.",
        ]),
        h3("Why 5xx results are not stored"),
        p("A stored response is final: every retry gets it for the next 24 hours. That is right for `201` and for a `402 card_declined` (the same card will be declined again, and the learner should see the same answer). It is wrong for `500` or `503`: the failure may be temporary, and storing it would turn one bad second into a day of failures for that purchase. So the rule is: on a 5xx, delete the record and let the retry run the handler again."),
        p("That rule is only safe when the work inside the handler is itself safe to repeat. If the handler charged the card and then crashed before saving the order, the retry charges again. Two defences: pass a key derived from yours to the payment provider (most payment providers accept an idempotency key of their own; check your provider's documentation), and write the order and the stored response in one database transaction so they cannot disagree."),

        h2("4. Store keys in PostgreSQL: the unique key decides who runs"),
        p("One row per key, per user. The primary key on `(user_id, idempotency_key)` is the whole concurrency story: two requests can both try to insert the same row, and PostgreSQL lets exactly one of them succeed."),
        code("sql", `
CREATE TABLE idempotency_keys (
    user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    idempotency_key  text        NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
    request_hash     text        NOT NULL,      -- sha256 of the canonical request body
    state            text        NOT NULL CHECK (state IN ('in_progress', 'completed')),
    response_status  smallint,
    response_body    jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, idempotency_key)
);
CREATE INDEX idempotency_keys_created_at_idx ON idempotency_keys (created_at);`, "migration.sql"),
        p("**Claim** the key before doing any work. The insert succeeds for a new key, and also takes over a completed key that has expired; for every other existing row it does nothing and returns no row:"),
        code("sql", `
-- $1 user_id, $2 idempotency_key, $3 request_hash. Run it in its own short transaction.
INSERT INTO idempotency_keys AS k (user_id, idempotency_key, request_hash, state)
VALUES ($1, $2, $3, 'in_progress')
ON CONFLICT (user_id, idempotency_key) DO UPDATE
    SET request_hash = EXCLUDED.request_hash, state = 'in_progress',
        response_status = NULL, response_body = NULL, created_at = now()
    WHERE k.state = 'completed' AND k.created_at <= now() - interval '24 hours'
RETURNING true AS claimed;

-- no row returned: someone else holds the key; read it and decide
SELECT request_hash, state, response_status, response_body
FROM idempotency_keys
WHERE user_id = $1 AND idempotency_key = $2;`, "claim.sql"),
        p("Then decide from the row you read: a different `request_hash` is `422`, `in_progress` is `409`, `completed` is a replay. If the `SELECT` finds nothing, the owner just released the key after a 5xx: run the claim again. After the handler, **complete** or **release** the row:"),
        code("sql", `
-- handler returned 2xx or 4xx
UPDATE idempotency_keys
SET state = 'completed', response_status = $3, response_body = $4
WHERE user_id = $1 AND idempotency_key = $2 AND state = 'in_progress';

-- handler failed with 5xx: forget the attempt so a retry can run
DELETE FROM idempotency_keys
WHERE user_id = $1 AND idempotency_key = $2 AND state = 'in_progress';

-- nightly job: expired keys
DELETE FROM idempotency_keys
WHERE state = 'completed' AND created_at < now() - interval '24 hours';`, "complete.sql"),
        callout("warning", "Keep the claim out of the long transaction",
            "Commit the claim before the handler starts. If the INSERT stays inside a transaction that also waits 12 seconds for the provider, the second request does not get 409: its INSERT blocks on the unique index until the first transaction commits, and your API holds a connection and a lock for the whole charge."),

        challenge("chal_quiz_adp_311"),

        h2("5. Worked example: a NestJS interceptor"),
        p("An interceptor runs after the auth guard (so `req.user` is known) and around the handler (so it can skip it or store its result). The fingerprint is a hash of a **canonical** form of the body: the mobile app and the web app may serialise the same object with keys in a different order, and that must not look like a different request."),
        code("typescript", `
// payments/canonical-json.ts
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return \`[\${value.map(canonicalJson).join(",")}]\`;
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const fields = Object.keys(record).sort()
            .map((key) => \`\${JSON.stringify(key)}:\${canonicalJson(record[key])}\`);
        return \`{\${fields.join(",")}}\`;
    }
    return JSON.stringify(value) ?? "null";
}`, "canonical-json.ts"),
        code("typescript", `
// payments/idempotency.interceptor.ts
import {
    BadRequestException, CallHandler, ConflictException, ExecutionContext, HttpException,
    Injectable, NestInterceptor, UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { Observable, catchError, mergeMap, of } from "rxjs";
import { canonicalJson } from "./canonical-json";
import { IdempotencyStore } from "./idempotency.store";   // the SQL from section 4

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
    constructor(private readonly store: IdempotencyStore) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
        const req = context.switchToHttp().getRequest<Request & { user: { id: string } }>();
        const res = context.switchToHttp().getResponse<Response>();
        const key = req.header("Idempotency-Key");
        if (!key || key.length > 255) {
            throw new BadRequestException({ code: "idempotency_key_missing", message: "Send an Idempotency-Key header of 1-255 characters." });
        }
        const userId = req.user.id;
        const hash = createHash("sha256").update(canonicalJson(req.body)).digest("hex");
        const claim = await this.store.claim(userId, key, hash);

        if (claim.kind === "mismatch") {
            throw new UnprocessableEntityException({ code: "idempotency_key_reused", message: "This key was used with a different request body." });
        }
        if (claim.kind === "in_progress") {
            throw new ConflictException({ code: "idempotency_key_in_progress", message: "A request with this key is still being processed. Retry later." });
        }
        if (claim.kind === "replay") {
            res.status(claim.status).setHeader("Idempotent-Replayed", "true");
            return of(claim.body);
        }
        // claim.kind === "claimed": this request owns the key and runs the handler
        return next.handle().pipe(
            mergeMap(async (body) => {
                await this.store.complete(userId, key, res.statusCode, body);
                return body;
            }),
            catchError(async (error: unknown) => {
                if (error instanceof HttpException && error.getStatus() < 500) {
                    await this.store.complete(userId, key, error.getStatus(), error.getResponse());
                } else {
                    await this.store.release(userId, key);
                }
                throw error;
            }),
        );
    }
}`, "idempotency.interceptor.ts"),
        code("typescript", `
// payments/payments.controller.ts
@Post()
@UseInterceptors(IdempotencyInterceptor)
create(
    @CurrentUser() user: User,
    @Headers("idempotency-key") key: string,
    @Body() dto: CreatePaymentDto,
) {
    // the provider gets a key of its own, so a retry after a crash cannot charge twice either
    return this.payments.create(user.id, dto, { providerKey: \`\${user.id}:\${key}\` });
}`, "payments.controller.ts"),
        p("Three details are deliberate. The hash covers `req.body` as received, before the validation pipe transforms it, because the client's bytes are what a retry repeats. `Idempotent-Replayed: true` is not part of the draft; it is a header of our own that makes replays visible in logs and in the app's network inspector. And the errors use the course's error contract from lesson 3, so the app reads `code` the same way as for every other error."),

        h2("6. How to verify it"),
        bullets([
            "**An end-to-end test with a slow fake provider.** Start two `POST /payments` with the same key at once, with the fake provider delayed by 500 ms. Expect one `201` and one `409`, then a third request after both finished gets `201` with `Idempotent-Replayed: true` - and assert the fake provider was called exactly once.",
            "**The duplicate query from section 2.** Run it in staging after the release and keep it as a daily alert: any row is a second charge.",
            "**Unit tests with a fake clock.** Expiry, 5xx release and per-user scoping are rules about time and identity; a fake clock tests them in milliseconds, as in the exercise below.",
            "**Log the decision.** One log field per request (`idempotency=claimed|replayed|in_progress|mismatch`) shows in a dashboard how often clients retry and whether any of them reuse keys wrongly.",
        ]),

        h2("7. Build the guard"),
        p("The exercise strips the interceptor down to its decisions, with an in-memory map instead of the table and a fake clock instead of `now()`. `begin` is the claim: it answers run, replay or reject when a request arrives. `finish` is complete or release. The test runner replays timelines like the incident - a slow handler, a retry during it, a retry after it - and counts how many times the handler ran, which in production would be the number of charges."),
        challenge("chal_coding_adp_312"),

        h2("8. Common mistakes"),
        bullets([
            "**Look up, then charge, then insert.** A `SELECT` before the work is not a lock: two requests 40 ms apart both find nothing. Spot it: the insert into the key table happens after the side effect. Claim first, with a unique key.",
            "**Keys not scoped per user.** A table keyed by `idempotency_key` alone lets two clients that happen to send the same value see each other's responses - a data leak, not just a bug. Spot it: the primary key or the map key does not contain the user id.",
            "**Comparing raw JSON strings.** `JSON.stringify(body)` depends on key order, so the same purchase from two app versions gets a `422`. Spot it: a test that sends the same payload with its keys reordered fails. Hash a canonical form instead.",
            "**Storing 5xx responses.** A provider outage of one second becomes a stored `503` that every retry gets for a day. Spot it: after a 5xx, a retry with the same key never reaches the handler.",
            "**A key stuck in progress forever.** If the process dies between claim and complete, the row stays `in_progress` and every retry gets `409`. Spot it: rows in `in_progress` older than your longest request. Add a lease (a `locked_until` column a later claim may take over) once you see it in production.",
        ]),

        h2("9. Summary"),
        bullets([
            "An idempotency key turns one `POST` into a request that is safe to retry: same key and same body replay the stored response, a different body is `422`, a repeat while the first is running is `409`. Use a natural unique key instead when the business rule already allows only one.",
            "Claim the key with a unique `(user_id, idempotency_key)` row before doing the work, in its own short transaction; compare a hash of the canonical body; expire keys after a fixed time.",
            "Store 2xx and 4xx results, never 5xx, and make the work inside the handler safe to repeat too: pass a key to the payment provider and verify with a test that counts the provider calls.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 9110, HTTP Semantics: section 9.2.2 (Idempotent Methods), 15.5.10 (409 Conflict), 15.5.21 (422 Unprocessable Content) - rfc-editor.org/rfc/rfc9110",
            "IETF HTTPAPI working group: The Idempotency-Key HTTP Header Field (draft-ietf-httpapi-idempotency-key-header) - check the current version and status on datatracker.ietf.org",
            "PostgreSQL documentation: INSERT, section ON CONFLICT Clause",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add a lease to the claim: a locked_until column set to now() + 30 seconds, and an ON CONFLICT condition that lets a new claim take over an in_progress row whose lease has passed. Then write the end-to-end test from section 6 against your NestJS app with a fake provider and check that the provider is called once."),
    ],
});
