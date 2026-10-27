import { readFileSync } from "node:fs";

// CodeDev grading queue. Workers receive "grade submission" messages, run the hidden tests and then
// acknowledge the message. Last week a 70-second grading job ran twice: the queue hid it for 60 seconds,
// a second worker received it at 60 s, and the first worker's ack at 70 s deleted a message that the
// second worker was still grading.
//
// Implement the queue side of visibility timeouts, like SQS (all times are fake-clock milliseconds):
//   - send(id, body, now): the message is visible from `now`. Message ids are unique.
//   - receive(now): among the visible messages (visible at or before `now`), take the one that became
//     visible earliest (ties: the one sent first). Add 1 to its receive count, give this delivery the
//     receipt handle "<id>#<receiveCount>" and hide the message until now + visibilityTimeoutMs.
//     Return { messageId, body, receiptHandle, receiveCount }, or null when no message is visible.
//   - ack(receiptHandle, now): delete the message and return true only when the handle is current: it is
//     the latest handle issued for a message that still exists. A handle from an earlier delivery (the
//     message was received again since), of a deleted message, or that was never issued returns false and
//     changes nothing. A current handle stays valid after the timeout passed, until the message is received again.
//   - extendVisibility(receiptHandle, timeoutMs, now): the heartbeat. Only for a current handle whose
//     message is still hidden (now < the time it becomes visible): hide it until now + timeoutMs and return
//     true. timeoutMs 0 makes it visible at once (release). Return false and change nothing when the handle
//     is not current, the message is already visible again, or timeoutMs is not a whole number from 0 to
//     43_200_000 (12 hours).
// Do not change the types or anything below the "do not change" line.

type Delivery = { messageId: string; body: string; receiptHandle: string; receiveCount: number };

type Stored = { id: string; body: string; seq: number; visibleAt: number; receiveCount: number; receipt: string | null };

const MAX_VISIBILITY_MS = 43_200_000; // 12 hours, the SQS maximum

class VisibilityQueue {
    private readonly messages = new Map<string, Stored>();
    private sent = 0;

    constructor(private readonly visibilityTimeoutMs: number) {}

    send(messageId: string, body: string, now: number): void {
        this.messages.set(messageId, { id: messageId, body, seq: this.sent++, visibleAt: now, receiveCount: 0, receipt: null });
    }

    receive(now: number): Delivery | null {
        let next: Stored | undefined;
        for (const m of this.messages.values()) {
            if (m.visibleAt > now) continue;
            if (!next || m.visibleAt < next.visibleAt || (m.visibleAt === next.visibleAt && m.seq < next.seq)) next = m;
        }
        if (!next) return null;
        next.receiveCount++;
        next.receipt = `${next.id}#${next.receiveCount}`; // every earlier handle stops being current
        next.visibleAt = now + this.visibilityTimeoutMs;
        return { messageId: next.id, body: next.body, receiptHandle: next.receipt, receiveCount: next.receiveCount };
    }

    /** The message this handle belongs to, only while the handle is the latest one issued. */
    private current(receiptHandle: string): Stored | undefined {
        const m = this.messages.get(receiptHandle.slice(0, receiptHandle.lastIndexOf("#")));
        return m !== undefined && m.receipt === receiptHandle ? m : undefined;
    }

    ack(receiptHandle: string, now: number): boolean {
        const m = this.current(receiptHandle);
        if (!m) return false;
        this.messages.delete(m.id);
        return true;
    }

    extendVisibility(receiptHandle: string, timeoutMs: number, now: number): boolean {
        const m = this.current(receiptHandle);
        if (!m || now >= m.visibleAt) return false; // not in flight any more
        if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_VISIBILITY_MS) return false;
        m.visibleAt = now + timeoutMs; // counted from now, not from the old deadline
        return true;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Simulated workers on a fake clock. An idle worker polls (receive) every pollMs. With a message it works
// for the message's workMs, then acks. With heartbeatMs > 0 it calls extendVisibility(handle, extendMs)
// every heartbeatMs while it works. A scripted crash stops the worker afterMs into that delivery: it never
// acks, and polls again pollMs later. "calls" are extra ack/extend calls made by a client at a given time.
// At each instant: messages due are sent, then the calls, then the workers in input order.
type Input = {
    visibilityTimeoutMs: number;
    untilMs: number;
    messages: Array<{ id: string; at: number; workMs: number }>;
    workers: Array<{ name: string; pollMs: number; heartbeatMs?: number; extendMs?: number }>;
    crashes?: Array<{ message: string; delivery: number; afterMs: number }>;
    calls?: Array<{ at: number; ack?: string; extend?: string; timeoutMs?: number }>;
};
type Job = { handle: string; messageId: string; finishAt: number; crashAt: number; heartbeatAt: number };

function main(): void {
    const input: Input = JSON.parse(readFileSync(0, "utf8"));
    const queue = new VisibilityQueue(input.visibilityTimeoutMs);
    const work = new Map(input.messages.map((m) => [m.id, m.workMs]));
    const toSend = [...input.messages].sort((a, b) => a.at - b.at);
    const calls = [...(input.calls ?? [])].sort((a, b) => a.at - b.at);
    const workers = input.workers.map((w) => ({ ...w, nextAt: 0, job: null as Job | null }));
    const deliveries: Record<string, number> = {};
    const deleted = new Set<string>();
    const rejectedAcks: string[] = [];
    const log: string[] = [];
    for (const m of input.messages) deliveries[m.id] = 0;

    for (;;) {
        const times = [
            ...toSend.slice(0, 1).map((m) => m.at),
            ...calls.slice(0, 1).map((c) => c.at),
            ...workers.map((w) => w.nextAt),
        ];
        const now = Math.min(...times);
        if (!Number.isFinite(now) || now > input.untilMs) break;
        while (toSend.length > 0 && toSend[0].at === now) {
            const m = toSend.shift()!;
            queue.send(m.id, `grade ${m.id}`, now);
        }
        while (calls.length > 0 && calls[0].at === now) {
            const c = calls.shift()!;
            if (c.ack !== undefined) {
                const ok = queue.ack(c.ack, now);
                log.push(`t=${now} client ack ${c.ack} ${ok ? "ok" : "rejected"}`);
                if (ok) deleted.add(c.ack.slice(0, c.ack.lastIndexOf("#")));
            } else if (c.extend !== undefined) {
                const ok = queue.extendVisibility(c.extend, c.timeoutMs ?? 0, now);
                log.push(`t=${now} client extend ${c.extend} ${c.timeoutMs ?? 0} ${ok ? "ok" : "rejected"}`);
            }
        }
        for (const w of workers) {
            if (w.nextAt !== now) continue;
            const job = w.job;
            if (job === null) {
                const d = queue.receive(now);
                if (d === null) {
                    w.nextAt = now + w.pollMs;
                    continue;
                }
                deliveries[d.messageId] = (deliveries[d.messageId] ?? 0) + 1;
                log.push(`t=${now} ${w.name} received ${d.receiptHandle} (receive count ${d.receiveCount})`);
                const crash = (input.crashes ?? []).find((c) => c.message === d.messageId && c.delivery === d.receiveCount);
                const hb = w.heartbeatMs ?? 0;
                w.job = {
                    handle: d.receiptHandle,
                    messageId: d.messageId,
                    finishAt: now + (work.get(d.messageId) ?? 0),
                    crashAt: crash ? now + crash.afterMs : Infinity,
                    heartbeatAt: hb > 0 ? now + hb : Infinity,
                };
            } else if (job.crashAt <= Math.min(job.finishAt, job.heartbeatAt)) {
                log.push(`t=${now} ${w.name} crashed working on ${job.handle}`);
                w.job = null;
                w.nextAt = now + w.pollMs;
                continue;
            } else if (job.finishAt <= job.heartbeatAt) {
                const ok = queue.ack(job.handle, now);
                log.push(`t=${now} ${w.name} ack ${job.handle} ${ok ? "ok" : "rejected"}`);
                if (ok) deleted.add(job.messageId);
                else rejectedAcks.push(`t=${now} ${w.name} ${job.handle}`);
                w.job = null;
                continue; // polls again at the same instant
            } else {
                const ok = queue.extendVisibility(job.handle, w.extendMs ?? 0, now);
                if (!ok) log.push(`t=${now} ${w.name} extend ${job.handle} rejected`);
                job.heartbeatAt += w.heartbeatMs ?? 0;
            }
            const next = w.job;
            if (next !== null) w.nextAt = Math.min(next.finishAt, next.crashAt, next.heartbeatAt);
        }
    }
    const remaining = input.messages.map((m) => m.id).filter((id) => !deleted.has(id));
    console.log(JSON.stringify({ deliveries, rejectedAcks, remaining, log }));
}
main();
