// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-2-1",
    title: "An outbox queue with retries and backoff",
    slug: { _type: "slug", current: "react-native-outbox-sync-queue" },
    description:
        "The courier app's first sync loop double-counted cash after lost answers, hammered the api during an outage and sent a completion before the pickup it depended on. Learn the outbox pattern on the phone: ordered per delivery, keyed for safe repeats, retried with capped exponential backoff that respects Retry-After, and failing loudly when the api refuses for good.",
    estimatedTime: 16,

    scenario: {
        role: "Mobile developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Courier actions now land in a local outbox table. The loop that sends them works on a good network, but the finance team found duplicate cash entries, the api team saw 40 requests per second from one phone during an incident, and some deliveries ended as \"completion refused\".",
    },

    content: [
        h2("Situation"),
        p("The first flush loop and what three teams reported:"),
        code("ts", `
export async function flushOutbox() {
  for (const entry of await outbox.pending()) {
    try {
      await api.send({ kind: entry.kind, deliveryId: entry.deliveryId, payload: entry.payload });
      await outbox.remove(entry.id);
    } catch {
      await outbox.bumpAttempts(entry.id); // retried on the next flush, 5 s later
    }
  }
}`, "src/sync/flushOutbox.ts"),
        code("text", `
finance   d-8812  cash 185000 VND booked twice (12:41:09 and 12:41:31)
api       503 incident 14:02-14:09: phone c-204 sent 4,800 requests, one every 5 s per entry, no backoff
support   d-9120  "complete" rejected 409 (delivery not picked up): the pickup was still retrying behind it`, "incident notes"),

        h2("The core you need"),
        bullets([
            "**The outbox is the courier's source of truth until acknowledged.** Each action is a row written in the same SQLite transaction as the local change; only a positive answer from the api removes it.",
            "**Order matters per entity, not globally.** \"pickup A\" must reach the api before \"complete A\", but delivery B does not need to wait for A. When an entry has to wait (not due, or failed), every later entry of the same delivery waits too.",
            "**Repeats must be harmless.** The row id goes in an `Idempotency-Key` header on every attempt. If the api saved the action but the answer was lost, the retry gets the first answer back instead of a second cash entry.",
            "**Classify the answer.** 2xx: done. 408, 429, 5xx: temporary, retry later. Other 4xx: the api will never accept it as is (validation, 409 state conflict): stop retrying, show it to the courier, and hold that delivery's later actions. No answer at all: the phone is offline; stop this flush.",
            "**Back off, with a cap, and listen to the server.** Delay = min(1 s x 2^(attempts-1), 60 s), and never less than `Retry-After`. Production code adds jitter so a thousand phones coming out of the same outage do not retry in the same second.",
            "**Flush on triggers, not in a tight loop.** Every few seconds while the app is in the foreground, when NetInfo reports a change, and when the app returns to the foreground. NetInfo here only wakes the loop; it never decides whether to send.",
        ]),

        h2("Apply it in the project"),
        code("ts", `
const MAX_BACKOFF_MS = 60_000;

export async function flushOutbox(now = Date.now()) {
  const waiting = new Set<string>();
  for (const entry of await outbox.pending()) {           // ORDER BY created_at
    if (waiting.has(entry.deliveryId) || entry.nextAttemptAt > now) {
      waiting.add(entry.deliveryId);
      continue;
    }
    const answer = await api.send(entry, { idempotencyKey: entry.id, timeoutMs: 15_000 });
    if (answer === "network-error") return;
    if (answer.status < 300) { await outbox.remove(entry.id); continue; }
    if (answer.status === 408 || answer.status === 429 || answer.status >= 500) {
      const attempts = entry.attempts + 1;
      const backoff = Math.min(1000 * 2 ** (attempts - 1), MAX_BACKOFF_MS);
      const wait = Math.max(backoff * (0.5 + Math.random() / 2), (answer.retryAfter ?? 0) * 1000);
      await outbox.update(entry.id, { attempts, nextAttemptAt: now + wait });
      waiting.add(entry.deliveryId);
      continue;
    }
    await outbox.markFailed(entry.id, \`HTTP \${answer.status}\`);
    waiting.add(entry.deliveryId);
  }
}`, "src/sync/flushOutbox.ts"),
        code("ts", `
useEffect(() => {
  const timer = setInterval(() => flushOutbox(), 5_000);
  const net = NetInfo.addEventListener(() => flushOutbox());           // a wake-up, not a gate
  const app = AppState.addEventListener("change", (s) => s === "active" && flushOutbox());
  return () => { clearInterval(timer); net(); app.remove(); };
}, []);`, "app/_layout.tsx"),
        callout("info", "One flush at a time",
            "Three triggers can fire together. Guard `flushOutbox` with an in-flight flag (or a promise you return to later callers) so two loops never send the same entry at once; the idempotency key would save the data, but not the api's rate limit."),

        h2("Verify"),
        code("bash", `
# simulate a lost answer: the staging api's fault proxy drops the response after saving
curl -X POST https://staging.ricerocket.vn/_faults -d '{"path":"/deliveries/*/complete","mode":"drop-response","times":1}'
# complete a delivery in the app: first attempt times out, the retry 5 s later gets 200
# finance export for that delivery shows ONE cash entry
# then a 503 window:
curl -X POST https://staging.ricerocket.vn/_faults -d '{"path":"/deliveries/*","mode":"503","seconds":120}'
# api access log for the phone: retries at roughly 1, 2, 4, 8, 16, 32, 60, 60 s`, "terminal"),
        p("The `_faults` endpoint is Rice Rocket's staging-only fault proxy; any proxy that can drop responses or return 503 (Toxiproxy, a mock server) works the same way."),

        h2("Pitfalls"),
        bullets([
            "**Retrying refusals forever.** A 400 or 409 retried every minute never succeeds and blocks the courier's next actions for that delivery. Check the outbox table for entries with many attempts and a 4xx status.",
            "**One global queue.** Stopping everything behind one stuck entry freezes the courier's whole day. Hold per delivery; let other deliveries move.",
            "**Deleting the row before the answer.** Removing the entry when the request starts loses the action if the app dies mid-request. Remove it only after a 2xx.",
        ]),

        p("Now write the flush. The editor starts from `flushOutbox` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first version's mistakes on purpose. Run replays a basement outage, a lost answer, a 503 storm and a 429 against a simulated api, and prints what it saved, the cash ledger and every request."),
        challenge("chal_coding_rno_142"),
    ],
});
