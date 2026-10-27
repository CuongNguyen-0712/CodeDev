import { readFileSync } from "node:fs";

// CodeDev leaderboard consumer. The progress service publishes one event per learner action
// (lesson_completed, challenge_passed ...) through its outbox. Every event carries the learner id as
// its key and a per-learner sequence number: the first event of a learner has seq 1, the next one
// seq 2, and so on. The broker may deliver a learner's events out of order or twice.
//
// A pool of workers processes the events. KeyedDispatcher decides which event a free worker
// starts next. Rules:
//
//   receive(msg)   an event was delivered (at clock.now()). Return
//     "rejected"   when msg.key is not a non-empty string or msg.seq is not an integer >= 1
//                  (the event goes to the dead-letter queue; nothing else changes);
//     "dropped"    when its seq is lower than the key's next expected seq, or the same seq is
//                  already held: a duplicate, or a late event whose gap was already given up;
//     "held"       otherwise: keep it until it can be processed.
//   The next expected seq of a key starts at 1.
//
//   take()  return the event a free worker should start now, or null. An event can start when its
//     seq equals its key's next expected seq and no other event of the same key is being processed.
//     Among those, return the one that was received first. A taken event is no longer held, and
//     its key's next expected seq becomes seq + 1 right away (so a redelivered copy is dropped).
//     A key that is busy or waiting for a missing seq must never stop other keys.
//
//   complete(msg)  a worker finished msg; another event of its key may start now.
//
//   A key has a gap while it holds events and the lowest held seq is greater than its next
//   expected seq. The gap's timer starts at the clock time the gap appears (in receive or take) and
//   stops when the gap disappears.
//   expireGaps()  for every key whose gap has existed for gapTimeoutMs or more (now - since >=
//     gapTimeoutMs): give up on the missing seqs - return { key, from: next expected seq,
//     to: lowest held seq - 1 } and make the lowest held seq the next expected one.
//   nextGapDeadline()  the earliest clock time at which a current gap times out, or null if no
//     key has a gap. The runner uses it to know when to wake up.
//
// Use only the injected clock. Do not change the types or the test runner.

type Clock = { now(): number };
type Message = { at: number; key: string; seq: number; ms: number };
type Gap = { key: string; from: number; to: number };

class KeyedDispatcher {
    constructor(clock: Clock, gapTimeoutMs: number) {}

    receive(msg: Message): "held" | "dropped" | "rejected" {
        return "held";
    }

    take(): Message | null {
        return null;
    }

    complete(msg: Message): void {}

    expireGaps(): Gap[] {
        return [];
    }

    nextGapDeadline(): number | null {
        return null;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "workers": n, "gapTimeoutMs": ms, "messages": [{ "at", "key", "seq", "ms" }], "summary"?: true }.
// "at" is the delivery time, "ms" how long processing takes. At each clock time the runner
// (1) completes the events that finish now, (2) delivers the events that arrive now, in input order,
// (3) calls expireGaps(), (4) calls take() while a worker is free.
// It prints one line per finished, dropped, rejected event and per gap, then the processing order
// per key. With "summary": true only the per-key order and the totals are printed.
type Test = { workers: number; gapTimeoutMs: number; messages: Message[]; summary?: boolean };

const test: Test = JSON.parse(readFileSync(0, "utf8"));
let now = 0;
const dispatcher = new KeyedDispatcher({ now: () => now }, test.gapTimeoutMs);
const arrivals = test.messages.map((m, i) => ({ m, i })).sort((a, b) => a.m.at - b.m.at || a.i - b.i).map((x) => x.m);
const inFlight: { msg: Message; startedAt: number; doneAt: number }[] = [];
const order = new Map<string, number[]>();
const skipped = new Map<string, string[]>();
const totals = { processed: 0, dropped: 0, rejected: 0, gaps: 0 };
const log = (line: string) => { if (!test.summary) console.log(line); };
const name = (m: Message) => `${m.key}#${m.seq}`;
let nextArrival = 0;
let finishedAt = 0;
let steps = 0;

while (true) {
    const times: number[] = inFlight.map((f) => f.doneAt);
    if (nextArrival < arrivals.length) times.push(arrivals[nextArrival].at);
    const deadline = dispatcher.nextGapDeadline();
    if (deadline !== null) times.push(Math.max(deadline, now));
    if (times.length === 0) break;
    if (++steps > 100000) { console.log("runner stopped: no progress"); break; }
    now = Math.min(...times);

    for (const f of inFlight.filter((x) => x.doneAt === now)) {
        inFlight.splice(inFlight.indexOf(f), 1);
        dispatcher.complete(f.msg);
        totals.processed++;
        finishedAt = now;
        if (!order.has(f.msg.key)) order.set(f.msg.key, []);
        order.get(f.msg.key)!.push(f.msg.seq);
        log(`t=${now} ${name(f.msg)} done (started ${f.startedAt})`);
    }
    while (nextArrival < arrivals.length && arrivals[nextArrival].at === now) {
        const msg = arrivals[nextArrival++];
        const result = dispatcher.receive(msg);
        if (result === "dropped") { totals.dropped++; log(`t=${now} ${name(msg)} dropped`); }
        if (result === "rejected") { totals.rejected++; log(`t=${now} rejected ${JSON.stringify(msg)}`); }
    }
    const gaps = dispatcher.expireGaps().slice().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const gap of gaps) {
        totals.gaps++;
        const missing = gap.from === gap.to ? `#${gap.from}` : `#${gap.from}-#${gap.to}`;
        if (!skipped.has(gap.key)) skipped.set(gap.key, []);
        skipped.get(gap.key)!.push(missing);
        log(`t=${now} gap ${gap.key}: gave up waiting for ${missing}`);
    }
    while (inFlight.length < test.workers) {
        const msg = dispatcher.take();
        if (!msg) break;
        inFlight.push({ msg, startedAt: now, doneAt: now + msg.ms });
    }
}
for (const key of [...order.keys()].sort()) {
    const gaps = skipped.get(key);
    console.log(`${key}: ${order.get(key)!.join(" ")}${gaps ? ` | skipped ${gaps.join(" ")}` : ""}`);
}
console.log(`processed ${totals.processed}, dropped ${totals.dropped}, rejected ${totals.rejected}, gaps ${totals.gaps}, finished at t=${finishedAt}`);
