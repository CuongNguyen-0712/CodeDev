import { readFileSync } from "node:fs";

// Rice Rocket courier-matcher: one worker per pod in the consumer group "courier-matcher", reading
// topic "orders.v1" (6 partitions, keyed by order id). The group calls the worker like this:
//   onRevoke(partitions)  before a rebalance takes partitions away (eager protocol: all of them)
//   onAssign(partitions)  after a rebalance hands this pod its partitions
//   poll(max)             fetch up to `max` records of each owned partition and handle them in order
// handle(record) matches a courier for the order and returns true. It returns false when a
// rebalance has started in the middle of a batch: stop at once, that record was NOT handled, and
// the group revokes the partitions right after.
// Offsets are committed only in onRevoke, which also runs when the pod shuts down cleanly. A
// committed offset is the next record to read: the last handled offset + 1.
const GROUP = "courier-matcher";
const TOPIC = "orders.v1";

interface Worker {
    onAssign(partitions: number[]): void;
    onRevoke(partitions: number[]): void;
    poll(max: number): void;
}

function createWorker(broker: Broker, handle: (record: Record_) => boolean): Worker {
    const position = new Map<number, number>(); // next offset to fetch, per owned partition
    const done = new Map<number, number>(); // offset after the last handled record, per owned partition

    return {
        onAssign(partitions) {
            // [ ] Where each new partition starts reading
        },
        poll(max) {
            for (const [p, from] of position) {
                const batch = broker.read(TOPIC, p, from, max);
                position.set(p, from + batch.length);
                // [ ] Handle the batch in order, stop if a rebalance starts
            }
        },
        onRevoke(partitions) {
            // [ ] Save the progress of the partitions being taken away
            // [ ] Stop reading the partitions given away
        },
    };
}

// ---------------------------------------------------------------- in-memory broker (do not change)
// A small model of documented Kafka behaviour shared by the kafka-event-streaming challenges:
// topics with numbered partitions, an append-only log per partition, the default partitioner
// (murmur2 of the key bytes, positive, modulo the partition count; no key -> round robin here),
// committed offsets per consumer group and partition, and range assignment within a group.
type Headers = Record<string, string>;
interface Message { key: string | null; value: string; headers?: Headers }
interface Record_ extends Message { topic: string; partition: number; offset: number }

function murmur2(data: Uint8Array): number {
    const m = 0x5bd1e995;
    let h = (0x9747b28c ^ data.length) | 0;
    let i = 0;
    for (; i + 4 <= data.length; i += 4) {
        let k = (data[i] & 0xff) | ((data[i + 1] & 0xff) << 8) | ((data[i + 2] & 0xff) << 16) | ((data[i + 3] & 0xff) << 24);
        k = Math.imul(k, m);
        k ^= k >>> 24;
        k = Math.imul(k, m);
        h = Math.imul(h, m) ^ k;
    }
    const rest = data.length - i;
    if (rest === 3) h ^= (data[i + 2] & 0xff) << 16;
    if (rest >= 2) h ^= (data[i + 1] & 0xff) << 8;
    if (rest >= 1) { h ^= data[i] & 0xff; h = Math.imul(h, m); }
    h ^= h >>> 13;
    h = Math.imul(h, m);
    h ^= h >>> 15;
    return h | 0;
}

/** Partition of a keyed record, as Kafka's default partitioner computes it. */
function partitionFor(key: string, partitions: number): number {
    return (murmur2(new TextEncoder().encode(key)) & 0x7fffffff) % partitions;
}

class Broker {
    private logs = new Map<string, Record_[][]>();
    private committed = new Map<string, number>();
    private roundRobin = 0;

    createTopic(topic: string, partitions: number): void {
        if (this.logs.has(topic)) throw new Error(`TopicExistsException: ${topic}`);
        if (!Number.isInteger(partitions) || partitions < 1) throw new Error(`InvalidPartitionsException: ${partitions}`);
        this.logs.set(topic, Array.from({ length: partitions }, () => []));
    }

    partitions(topic: string): number {
        const log = this.logs.get(topic);
        if (!log) throw new Error(`UnknownTopicOrPartitionException: ${topic}`);
        return log.length;
    }

    /** Appends one message; an explicit partition wins over the key. Returns the stored record. */
    append(topic: string, message: Message, partition?: number): Record_ {
        const log = this.logs.get(topic);
        if (!log) throw new Error(`UnknownTopicOrPartitionException: ${topic}`);
        const p = partition ?? (message.key === null ? this.roundRobin++ % log.length : partitionFor(message.key, log.length));
        if (p < 0 || p >= log.length) throw new Error(`UnknownTopicOrPartitionException: ${topic}-${p}`);
        const record: Record_ = { ...message, topic, partition: p, offset: log[p].length };
        log[p].push(record);
        return record;
    }

    /** Records of one partition from `offset` on (at most `max`). */
    read(topic: string, partition: number, offset: number, max = Infinity): Record_[] {
        const log = this.logs.get(topic);
        if (!log || !log[partition]) throw new Error(`UnknownTopicOrPartitionException: ${topic}-${partition}`);
        return log[partition].slice(offset, offset + max);
    }

    endOffset(topic: string, partition: number): number {
        return this.read(topic, partition, 0).length;
    }

    /** The committed offset is the NEXT offset to read (last processed + 1), as in Kafka. */
    commit(group: string, topic: string, partition: number, offset: number): void {
        this.committed.set(`${group}/${topic}/${partition}`, offset);
    }

    committedOffset(group: string, topic: string, partition: number): number | null {
        return this.committed.get(`${group}/${topic}/${partition}`) ?? null;
    }
}

/** Range assignment of one topic's partitions to the sorted member ids of a group. */
function rangeAssign(members: string[], partitions: number): Map<string, number[]> {
    const sorted = [...members].sort();
    const out = new Map<string, number[]>(sorted.map((m) => [m, []]));
    const per = Math.floor(partitions / sorted.length);
    const extra = partitions % sorted.length;
    let next = 0;
    sorted.forEach((m, i) => {
        const count = per + (i < extra ? 1 : 0);
        for (let k = 0; k < count; k++) out.get(m)!.push(next++);
    });
    return out;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { records, steps }. `records` order events go to orders.v1 first (keys order-1, order-2, ...),
// then the steps run in order:
//   { "join": "pod-a" }      a pod starts; the group rebalances
//   { "leave": "pod-a" }     a pod shuts down cleanly (its onRevoke runs); the group rebalances
//   { "kick": "pod-a" }      the coordinator drops a pod that exceeded max.poll.interval.ms: its
//                            onRevoke never runs; the group rebalances
//   { "poll": "pod-a", "max": 3, "stopAfter": 2 }   one poll; after `stopAfter` handled records a
//                            rebalance interrupts the batch (the next step is always a rebalance)
//   { "drain": true }        every pod polls until no record is left
// Rebalances are eager: each remaining pod's onRevoke gets all its partitions, then onAssign gets
// the range assignment. After the last step every pod shuts down cleanly.
// Output: { assignment (of the last rebalance), handled, duplicates, lost, committed } where
// records are written "partition:offset".
interface Step { join?: string; leave?: string; kick?: string; poll?: string; max?: number; stopAfter?: number; drain?: boolean }

const input = JSON.parse(readFileSync(0, "utf8")) as { records: number; steps: Step[] };
const broker = new Broker();
broker.createTopic(TOPIC, 6);
for (let i = 1; i <= input.records; i++) broker.append(TOPIC, { key: `order-${i}`, value: JSON.stringify({ orderId: `order-${i}` }) });

const handled: string[] = [];
let budget = Infinity;
function handle(record: Record_): boolean {
    if (budget <= 0) return false;
    budget--;
    handled.push(`${record.partition}:${record.offset}`);
    return true;
}

const workers = new Map<string, Worker>();
const owned = new Map<string, number[]>();
let assignment: Record<string, number[]> = {};
function rebalance(): void {
    for (const [member, worker] of workers) worker.onRevoke(owned.get(member) ?? []);
    assignment = {};
    for (const [member, partitions] of rangeAssign([...workers.keys()], broker.partitions(TOPIC))) {
        owned.set(member, partitions);
        assignment[member] = partitions;
        workers.get(member)!.onAssign(partitions);
    }
}

for (const step of input.steps) {
    if (step.join) {
        workers.set(step.join, createWorker(broker, handle));
        owned.set(step.join, []);
        rebalance();
    } else if (step.leave) {
        workers.get(step.leave)!.onRevoke(owned.get(step.leave) ?? []);
        workers.delete(step.leave);
        owned.delete(step.leave);
        rebalance();
    } else if (step.kick) {
        workers.delete(step.kick);
        owned.delete(step.kick);
        rebalance();
    } else if (step.poll) {
        budget = step.stopAfter ?? Infinity;
        workers.get(step.poll)!.poll(step.max ?? 500);
        budget = Infinity;
    } else if (step.drain) {
        for (let round = 0; round < 1000; round++) {
            const before = handled.length;
            for (const worker of workers.values()) worker.poll(500);
            if (handled.length === before) break;
        }
    }
}
for (const [member, worker] of workers) worker.onRevoke(owned.get(member) ?? []);

const order = (a: string, b: string) => {
    const [pa, oa] = a.split(":").map(Number);
    const [pb, ob] = b.split(":").map(Number);
    return pa - pb || oa - ob;
};
const counts = new Map<string, number>();
for (const r of handled) counts.set(r, (counts.get(r) ?? 0) + 1);
const all: string[] = [];
const committed: Record<string, number | null> = {};
for (let p = 0; p < broker.partitions(TOPIC); p++) {
    for (let o = 0; o < broker.endOffset(TOPIC, p); o++) all.push(`${p}:${o}`);
    committed[p] = broker.committedOffset(GROUP, TOPIC, p);
}
console.log(JSON.stringify({
    assignment,
    handled: handled.length,
    duplicates: [...counts].filter(([, n]) => n > 1).map(([r]) => r).sort(order),
    lost: all.filter((r) => !counts.has(r)),
    committed,
}));
