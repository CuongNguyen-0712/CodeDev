// Harness: Build the outbox sync client
// A fake `send` records every call and keeps it pending on a virtual clock. The harness
// settles calls in order of finish time (ties: the call made first), letting promise
// callbacks run between steps, so the outcome is the same on every machine.
//   input.maxInFlight
//   input.outcomes  { [mutationId]: ["ok" | "retry" | "fail" | "network", ...] }  one per attempt, default "ok"
//                   retry   -> Error("503 Service Unavailable") with retryable: true
//                   fail    -> Error("422 Unprocessable Entity") with retryable: false
//                   network -> TypeError("Failed to fetch") with no retryable flag
//   input.durations { [mutationId]: ms }  default 10
//   input.steps     { op: "enqueue", id, recordId, patch }
//                   { op: "flush", twice?: true, during?: [{ at, id, recordId, patch }] }  (enqueue at virtual time `at`)
// Output: the call log, the highest number of concurrent calls, whether one record ever had
// two calls in flight, and each flush's summary.
async function __harness(input) {
    const outcomes = input.outcomes || {};
    const durations = input.durations || {};
    let now = 0;
    let seq = 0;
    const pendingCalls = [];
    const calls = [];
    const attempts = {};
    const activeByRecord = {};
    let active = 0;
    let maxConcurrent = 0;
    let sameRecordOverlap = false;

    function send(mutation) {
        const { id, recordId, patch } = mutation || {};
        calls.push(`${id} ${recordId} ${JSON.stringify(patch)}`);
        attempts[id] = (attempts[id] || 0) + 1;
        const outcome = (outcomes[id] || [])[attempts[id] - 1] || "ok";

        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        activeByRecord[recordId] = (activeByRecord[recordId] || 0) + 1;
        if (activeByRecord[recordId] > 1) sameRecordOverlap = true;

        return new Promise((resolve, reject) => {
            pendingCalls.push({
                end: now + (durations[id] === undefined ? 10 : durations[id]),
                seq: seq++,
                settle() {
                    active -= 1;
                    activeByRecord[recordId] -= 1;
                    if (outcome === "ok") resolve({ ok: true, id });
                    else if (outcome === "retry") reject(Object.assign(new Error("503 Service Unavailable"), { retryable: true }));
                    else if (outcome === "fail") reject(Object.assign(new Error("422 Unprocessable Entity"), { retryable: false }));
                    else reject(new TypeError("Failed to fetch"));
                },
            });
        });
    }

    const client = createSyncClient({ send, maxInFlight: input.maxInFlight });
    const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));
    const flushes = [];

    for (const step of input.steps || []) {
        if (step.op === "enqueue") {
            client.enqueue({ id: step.id, recordId: step.recordId, patch: step.patch });
            continue;
        }

        const during = (step.during || []).slice().sort((a, b) => a.at - b.at);
        const results = [];
        const track = (promise, index) => Promise.resolve(promise).then(
            (value) => { results[index] = { value }; },
            (error) => { results[index] = { value: `flush rejected: ${error && error.message}` }; },
        );
        track(client.flush(), 0);
        if (step.twice) track(client.flush(), 1);
        const settled = () => results[0] && (!step.twice || results[1]);

        for (let guard = 0; guard < 200 && !settled(); guard++) {
            await macrotask();
            if (settled()) break;
            pendingCalls.sort((a, b) => a.end - b.end || a.seq - b.seq);
            const nextCall = pendingCalls[0];
            const nextEdit = during[0];
            if (nextEdit && (!nextCall || nextEdit.at <= nextCall.end)) {
                during.shift();
                now = Math.max(now, nextEdit.at);
                client.enqueue({ id: nextEdit.id, recordId: nextEdit.recordId, patch: nextEdit.patch });
            } else if (nextCall) {
                pendingCalls.shift();
                now = nextCall.end;
                nextCall.settle();
            } else if (guard > 5) {
                break; // nothing in flight, nothing to do: the flush is stuck
            }
        }

        if (!results[0]) flushes.push("flush never settled");
        else if (step.twice && (!results[1] || JSON.stringify(results[1].value) !== JSON.stringify(results[0].value))) {
            flushes.push("second flush() call returned a different result");
        } else flushes.push(results[0].value);
    }

    return { calls, maxConcurrent, sameRecordOverlap, flushes };
}
