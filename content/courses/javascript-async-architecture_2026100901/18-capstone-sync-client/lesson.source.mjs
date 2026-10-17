// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-6-3",
    title: "Capstone: a resilient offline-first sync client",
    slug: { _type: "slug", current: "capstone-resilient-offline-first-sync-client" },
    description:
        "Technicians edit jobs in basements and tunnels; the app has to keep every edit and deliver it exactly once, in order. Design an outbox that persists mutations, coalesces edits, syncs records concurrently but each one in order, separates transient from permanent failures, relies on idempotent mutation ids - and build its core.",
    estimatedTime: 35,

    scenario: {
        role: "Frontend lead, field-service web app (installable PWA for HVAC technicians)",
        problem:
            "Offline mode v1 shipped two weeks ago: edits go into an in-memory array that is replayed one by one when the browser fires \"online\". The bug list: edits disappear when a technician closes the app in a basement; dispatch sees jobs jump from \"done\" back to \"on-site\"; one job with a validation error stopped all syncing for a whole afternoon; and a customer was billed twice for parts after a retry. The product owner wants offline mode v2 before the winter season.",
    },

    content: [
        h2("1. Offline mode v1, and why each bug happened"),
        p("This is v1, simplified. Each line is reasonable on its own:"),
        code("javascript", `
const queue = [];                                // lives in memory only

export function saveJob(jobId, patch) {
    applyLocally(jobId, patch);                  // optimistic UI
    queue.push({ jobId, patch });
    if (navigator.onLine) replay();
}

async function replay() {
    while (queue.length > 0) {
        const { jobId, patch } = queue[0];
        try {
            await api.patchJob(jobId, patch);    // no id: the server cannot spot a duplicate
            queue.shift();
        } catch {
            await sleep(5000);                   // retry the same item forever
        }
    }
}

window.addEventListener("online", replay);       // a second replay() can start while one runs`, "sync-v1.js"),
        p("Every bug on the list maps to one missing property:"),
        bullets([
            "**Lost edits** - the queue is not persisted. Closing the tab, an OS memory kill or an update deletes it.",
            "**\"done\" jumps back to \"on-site\"** - two `online` events start two `replay()` loops. Both send edits of the same job at the same time, and the server applies them in whatever order they arrive.",
            "**One bad job blocks everything** - a 422 is retried forever at the head of a single queue, so nothing behind it is ever sent (head-of-line blocking).",
            "**Billed twice** - the server applied a request whose response was lost, and the retry applied it again. Without an id, a retry is indistinguishable from a new edit.",
        ]),
        p("v2 needs: a persistent outbox, per-record ordering with bounded concurrency across records, failure classification, idempotent mutation ids and a single flush at a time. You have built most of the pieces in this course; the capstone is about putting them together without losing their guarantees."),

        h2("2. The outbox: persist first, sync later"),
        p("The rule of offline-first apps: a user's edit is **committed locally** before anything touches the network. The local record and the outbox entry are written in the same IndexedDB transaction, so the app can never show an edit that will not be synced, or sync one it does not show."),
        code("javascript", `
import { openDB } from "idb"; // a thin promise wrapper over IndexedDB

const db = await openDB("field-app", 1, {
    upgrade(db) {
        db.createObjectStore("jobs", { keyPath: "id" });
        db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
    },
});

export async function saveJob(job, patch) {
    const mutation = { id: crypto.randomUUID(), recordId: job.id, patch, createdAt: Date.now() };
    const tx = db.transaction(["jobs", "outbox"], "readwrite");
    await Promise.all([
        tx.objectStore("jobs").put({ ...job, ...patch }),   // what the UI shows
        tx.objectStore("outbox").add(mutation),             // what still has to reach the server
        tx.done,                                            // both or neither
    ]);
    return mutation;
}`, "outbox.js"),
        bullets([
            "The mutation **id is created once, on the device, when the edit happens** - not when it is sent. Every retry of this edit carries the same id.",
            "The outbox store's auto-increment key keeps entries in the order the technician made them.",
            "Call `navigator.storage.persist()` once (for example after login) so the browser does not evict the database under storage pressure.",
        ]),

        h3("Coalescing edits"),
        p("A technician changes a job's status three times while underground. Sending three requests is wasteful, but merging them is only safe under one condition: the entry being merged into **has never been sent**. From the moment a mutation goes out - whether or not a response ever comes back - its id and payload are frozen, and new edits for the same record become a new entry behind it. Section 5 shows what goes wrong otherwise."),
        callout("info", "Merging is a product decision too",
            "A shallow merge ({ ...old, ...new }) is right for 'last value wins' fields like status or notes. Additive operations - add a part, append a photo, increment a counter - must not be merged into a single value; keep them as separate mutations or as a list."),

        h2("3. Ordering per record, concurrency across records"),
        p("Two edits of the same job must reach the server in order, one at a time - otherwise \"on-site\" can overtake \"done\". Edits of different jobs are independent, so they can be sent in parallel. That gives the sync client its shape: **one lane per record**, and a shared limit on how many lanes run at once (the same idea as the worker pool from lesson 2.3)."),
        image("sync-client-architecture", {
            alt: "Edits from the job form are written to an IndexedDB outbox, where unsent edits of the same job are merged. The sync client reads the outbox in order and runs one lane per job: job-17 and job-18 are in flight, job-21 waits for a free slot because maxInFlight is 2, and job-30 is held after a 503. Calls go to the jobs API, which deduplicates by mutation id. Successful mutations are removed, transient failures stay for the next flush, permanent failures are parked under Needs attention. Triggers - online, tab visible, backoff timer, Sync now - start a flush, and the client reports its status back to the UI.",
            caption: "One lane per record keeps edits of a job in order; maxInFlight bounds the lanes; each outcome has exactly one place to go.",
        }),
        p("Two details make or break this:"),
        bullets([
            "**A lane stops at its first transient failure.** If m6 for job-30 got a 503, a later edit m7 for job-30 must not be sent in the same flush - that would apply the later edit first. Other lanes continue normally.",
            "**Only one flush at a time.** `online`, `visibilitychange`, a timer and a \"Sync now\" button can all fire within the same second. A second `flush()` call joins the running flush instead of starting a parallel one - the single-flight idea, applied on the client.",
        ]),

        h2("4. Classifying failures and building the client"),
        p("Each call ends in one of three ways, and each needs a different place to go. The hard part is deciding which failures are worth another attempt."),
        challenge("chal_quiz_js_631"),
        p("The classification lives at the edge, in the function that talks HTTP, so the sync client only has to read one flag:"),
        code("javascript", `
async function sendMutation({ id, recordId, patch }) {
    const res = await fetch("/api/jobs/" + encodeURIComponent(recordId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": id },
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return;

    const transient = res.status >= 500 || res.status === 408 || res.status === 429;
    throw Object.assign(new Error(res.status + " " + res.statusText), { retryable: transient });
}`, "sendMutation.js"),
        callout("tip", "Unknown means transient",
            "A failed fetch throws a TypeError, and AbortSignal.timeout throws a TimeoutError - neither has a status, and neither carries a retryable flag. Treat any error that is not explicitly permanent as transient. The cost of being wrong is one extra attempt; the cost of the opposite mistake is a technician's lost work."),
        p("Permanent failures are not deleted silently. They are **parked**: moved to a \"Needs attention\" list with the error, shown on the job, and sent to error tracking. Transient failures wait for the next flush, and the delay between flushes uses the backoff with jitter from lesson 3.3 - the retry policy lives outside the flush, which only makes one pass."),
        p("Now build the core. The tests drive your client with a fake `send` on a virtual clock - the deterministic testing technique from lesson 6.1 - so you can see exactly which calls were made, in which order and how many at once."),
        challenge("chal_coding_js_632", "Track, per entry, whether it is in flight and whether it was ever attempted. After every settled call, scan the outbox from the start and start every entry whose record is not busy and not held back, while the in-flight count is below maxInFlight. Resolve when nothing is in flight. Keep the running flush's promise in a variable and return it to concurrent callers."),

        h2("5. Idempotent mutation ids on the server"),
        p("The client guarantees **at-least-once** delivery: an edit is retried until the server confirms it. The server turns that into **exactly-once effects** by remembering which mutation ids it has applied. The check and the update must be one atomic step, or two retries arriving together can both pass the check:"),
        code("sql", `
WITH first_time AS (
    INSERT INTO processed_mutations (mutation_id, job_id)
    VALUES ($1, $2)
    ON CONFLICT (mutation_id) DO NOTHING
    RETURNING job_id
)
UPDATE jobs
SET status = $3, updated_at = now()
WHERE id = (SELECT job_id FROM first_time);   -- no row when the id was seen before`),
        p("A duplicate inserts nothing, updates nothing, and the API answers `200` as if it had just succeeded - which, from the client's point of view, it has. The Node.js High Performance course covers server-side idempotency keys in depth (stored responses, key expiry, concurrent duplicates); for the client, the contract is simply: same edit, same id, forever."),
        p("That contract has a consequence that is easy to break with an innocent optimisation:"),
        challenge("chal_quiz_js_633"),

        h2("6. Wiring it up: triggers, cancellation and status"),
        p("The sync client from the challenge does one pass. The app decides **when** to run it and **what to tell the user**:"),
        code("javascript", `
const client = createSyncClient({ send: sendMutation, maxInFlight: 4 });
let retryTimer = null;
let delay = 1_000;

async function sync(reason) {
    clearTimeout(retryTimer);
    if (!navigator.onLine) return setStatus({ kind: "offline", pending: await outboxCount() });

    setStatus({ kind: "syncing", reason });
    const summary = await client.flush();       // concurrent callers share this flush

    for (const { id, error } of summary.failed) await parkMutation(id, error);

    if (summary.pending.length === 0) {
        delay = 1_000;
        return setStatus({ kind: "synced", needsAttention: await parkedCount() });
    }
    const wait = withJitter(delay);             // backoff + jitter from lesson 3.3
    delay = Math.min(delay * 2, 60_000);
    retryTimer = setTimeout(() => sync("retry"), wait);
    setStatus({ kind: "waiting", pending: summary.pending.length, retryInMs: wait });
}

window.addEventListener("online", () => sync("online"));
window.addEventListener("offline", () => setStatus({ kind: "offline" }));
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync("visible");
});
syncNowButton.addEventListener("click", () => sync("manual"));`, "syncController.js"),
        bullets([
            "`navigator.onLine === true` only means \"some network interface is up\" - a captive portal or a dead cell tower still looks online. Treat it as a hint to try, never as proof; the failure classification handles the rest.",
            "The status is a small state machine (lesson 6.2): `offline`, `syncing`, `waiting`, `synced`, plus a separate count for parked mutations. The UI shows a badge (\"3 edits waiting - retrying in 8 s\") instead of a spinner that lies.",
            "On logout, abort in-flight calls (pass an `AbortSignal` into `send`) and clear the outbox only after the user confirms they will lose unsynced edits.",
            "Chromium's Background Sync API can wake a service worker to flush after the tab is closed. Use it as an extra trigger where available; the outbox design does not depend on it.",
        ]),
        callout("success", "What v2 changed for the technicians",
            "Edits survive reloads and app kills because they are committed to IndexedDB first. Each job's edits arrive in order, a broken job only parks its own edits, retries no longer double-bill because the server deduplicates by mutation id, and the status badge tells the technician exactly how many edits are still on the device."),

        h2("7. Checklist"),
        bullets([
            "Write the local change and the outbox entry in one IndexedDB transaction; request persistent storage.",
            "Give every mutation a client-generated id when the edit is made; send it as `Idempotency-Key` on every attempt.",
            "Coalesce only into entries that were never sent; a sent mutation's id and payload are frozen.",
            "One lane per record (strict order, one call at a time), bounded concurrency across records.",
            "A transient failure holds back its record's later edits; other records keep syncing.",
            "Classify at the HTTP edge: explicit permanent errors are parked and shown, everything else is retried with backoff and jitter.",
            "One flush at a time: concurrent triggers join the running flush.",
            "Server: insert the mutation id and apply the change atomically; duplicates answer success without side effects.",
            "Report sync status as explicit states, including how many edits are still on the device and which need attention.",
        ]),
    ],
});
