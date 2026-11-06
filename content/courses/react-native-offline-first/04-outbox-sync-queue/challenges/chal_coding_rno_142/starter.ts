import { readFileSync } from "node:fs";

// Rice Rocket courier app: every courier action (pick up, complete with cash collected) is first
// written to the local `outbox` table, then flushOutbox sends it. The app calls flushOutbox every
// few seconds while it is open and again when the network comes back.
//   store.pending()              unsent entries, oldest first
//   store.remove(id)             sent: delete it          store.update(entry)   save attempts/time
//   store.markFailed(entry, why) the api refused it for good: show it to the courier
//   api.send(action, key?)       one HTTP request; `key` goes in the Idempotency-Key header (the api
//                                answers a repeated key with the first answer and does nothing again)
//                                -> { status, retryAfter? } or "network-error" (no answer at all)
interface OutboxEntry { id: string; deliveryId: string; kind: string; payload: string; attempts: number; nextAttemptAt: number }
interface Action { kind: string; deliveryId: string; payload: string }
type Answer = { status: number; retryAfter?: number } | "network-error";
interface Store { pending(): OutboxEntry[]; remove(id: string): void; update(entry: OutboxEntry): void; markFailed(entry: OutboxEntry, why: string): void }
interface Api { send(action: Action, idempotencyKey?: string): Answer }

const MAX_BACKOFF_MS = 60_000;

function flushOutbox(store: Store, api: Api, now: number): void {
    // A delivery's actions must reach the api in order: once one waits, the later ones wait too.
    const waiting = new Set<string>();
    for (const entry of store.pending()) {
        // [ ] Skip entries that are not due or wait behind an earlier one
        // [ ] Send the action so a repeat is recognised
        if (answer === "network-error") return; // offline: the next flush tries again
        if (answer.status < 300) {
            store.remove(entry.id);
            continue;
        }
        // [ ] Temporary failure: wait longer each time, as asked
        // [ ] Refused for good: report it, hold its delivery
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// The api: pickup needs status "assigned", complete needs "picked_up" (else 409); complete adds
// the cash collected to the ledger. Faults are applied per request number (1-based):
//   "network"  no answer, nothing saved         "lost"  saved, but the answer never arrives
//   "503"      saved nothing, 503               "429"  saved nothing, 429 with Retry-After 30
interface Case { actions: [string, string, string?][]; faults?: Record<string, string>; flushEveryMs?: number; untilMs?: number }
const input = JSON.parse(readFileSync(0, "utf8")) as Case;

let outbox: OutboxEntry[] = input.actions.map(([kind, deliveryId, payload], i) => ({ id: `act-${i + 1}`, deliveryId, kind, payload: payload ?? "", attempts: 0, nextAttemptAt: 0 }));
const failed: string[] = [];
const status = new Map<string, string>();
for (const [, d] of input.actions) status.set(d, "assigned");
const ledger: string[] = [];
const applied: string[] = [];
const seenKeys = new Map<string, Answer>();
const requests: string[] = [];
let n = 0;
let clock = 0;

const api: Api = {
    send(action, key) {
        n++;
        requests.push(`${clock / 1000}s ${action.kind} ${action.deliveryId}${key ? "" : " (no key)"}`);
        const fault = input.faults?.[String(n)];
        if (fault === "network") return "network-error";
        if (fault === "503") return { status: 503 };
        if (fault === "429") return { status: 429, retryAfter: 30 };
        let answer: Answer;
        if (key && seenKeys.has(key)) answer = seenKeys.get(key)!;
        else {
            const need = action.kind === "pickup" ? "assigned" : "picked_up";
            const s = status.get(action.deliveryId);
            if (action.kind === "complete" && s === "delivered") {
                ledger.push(`${action.deliveryId} ${action.payload}`); // a naive repeat: cash counted again
                answer = { status: 200 };
            } else if (s !== need) answer = { status: 409 };
            else {
                status.set(action.deliveryId, action.kind === "pickup" ? "picked_up" : "delivered");
                if (action.kind === "complete") ledger.push(`${action.deliveryId} ${action.payload}`);
                applied.push(`${action.kind} ${action.deliveryId}`);
                answer = { status: 200 };
            }
            if (key) seenKeys.set(key, answer);
        }
        return fault === "lost" ? "network-error" : answer;
    },
};
const store: Store = {
    pending: () => outbox.map((e) => ({ ...e })),
    remove: (id) => { outbox = outbox.filter((e) => e.id !== id); },
    update: (entry) => { outbox = outbox.map((e) => (e.id === entry.id ? { ...entry } : e)); },
    markFailed: (entry, why) => { outbox = outbox.filter((e) => e.id !== entry.id); failed.push(`${entry.id} ${entry.kind} ${entry.deliveryId}: ${why}`); },
};
for (clock = 0; clock <= (input.untilMs ?? 60_000); clock += input.flushEveryMs ?? 5_000) flushOutbox(store, api, clock);
console.log(JSON.stringify({
    applied, ledger, failed,
    left: outbox.map((e) => `${e.id} attempts=${e.attempts} next=${e.nextAttemptAt / 1000}s`),
    requests,
}));
