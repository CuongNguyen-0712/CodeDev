import { readFileSync } from "node:fs";

// Rice Rocket courier-matcher: what happens to an OrderPlaced event when matching it fails.
//
// The consumer calls onRecord for every record of orders.v1 and of the two retry topics. A record of a
// retry topic is handed over only once its wait is over (30 s or 5 min after it was written there).
// onRecord must never block the partition: when deps.handle throws a Failure, the record is published
// to the topic routeFailure picks, and the consumer moves on to the next offset.
//
// routeFailure:
//   - validation and schema errors cannot be fixed by waiting: the record goes to the dead-letter
//     topic at once;
//   - timeout and unavailable errors are retried: the 1st failure goes to orders.v1.retry.30s, the
//     2nd to orders.v1.retry.5m, the 3rd to the dead-letter topic;
//   - headers travel with the record: x-attempts (failures so far, this one included), x-error
//     ("<kind>: <message>" of the last failure), and, kept from the FIRST failure,
//     x-original-topic, x-original-partition, x-original-offset and x-first-failed-at (ms).
//
// Do not change the constants, the types or the test runner.

const RETRY_TOPICS = ["orders.v1.retry.30s", "orders.v1.retry.5m"];
const DEAD_LETTER_TOPIC = "orders.v1.dlt";

type FailureKind = "validation" | "schema" | "timeout" | "unavailable";
type Failure = { kind: FailureKind; message: string };
type Deps = { handle(record: Record_): void; publish(topic: string, message: Message): void };

/** Called by the consumer for every record of orders.v1 and of the retry topics. */
function onRecord(record: Record_, nowMs: number, deps: Deps): void {
    // [ ] Run the handler; a failure sends the record on
}

/** The topic a failed record goes to next, with the headers that travel with it. */
function routeFailure(record: Record_, failure: Failure, nowMs: number): { topic: string; headers: Headers } {
    const previous: Headers = record.headers ?? {};
    // [ ] How many times the record has failed, this time included
    // [ ] Where and when the record failed the first time
    const headers: Headers = { ...previous, ...origin, "x-attempts": String(attempts), "x-error": `${failure.kind}: ${failure.message}` };
    // [ ] Failures that no retry can fix
    // [ ] Retryable failures: the next retry topic, then the DLT
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
// Input: { orders: [{ id, address }], mapsDownUntilMs, horizonMs? }. Every order is produced to
// orders.v1 at t = 0 (key = order id). The consumer runs once per simulated second: for each topic
// and partition it reads the next records in offset order. A retry-topic record waits until
// (time it was written + 30 s or 5 min); the partition pauses behind it. When onRecord throws, the
// consumer does not commit: it stays on that offset and tries it again a second later.
// The handler fails with validation when the address is missing, and with unavailable while the
// maps API is down (t < mapsDownUntilMs); otherwise the order is matched to a courier.
// Output: { matched: { id: second matched or null }, dlt: [...], pendingRetries, blockedSeconds }.
type Order = { id: string; address: string | null };
type Case = { orders: Order[]; mapsDownUntilMs: number; horizonMs?: number };
const DELAY_MS: Record<string, number> = { "orders.v1": 0, "orders.v1.retry.30s": 30_000, "orders.v1.retry.5m": 300_000 };

const input: Case = JSON.parse(readFileSync(0, "utf8"));
const broker = new Broker();
for (const topic of Object.keys(DELAY_MS)) broker.createTopic(topic, 6);
broker.createTopic(DEAD_LETTER_TOPIC, 1);
const writtenAt = new Map<string, number>();
const stamp = (r: Record_, t: number): void => { writtenAt.set(`${r.topic}/${r.partition}/${r.offset}`, t); };
for (const order of input.orders) stamp(broker.append("orders.v1", { key: order.id, value: JSON.stringify(order) }), 0);

const matched = new Map<string, number>();
const position = new Map<string, number>();
let now = 0;
let blockedSeconds = 0;
const deps: Deps = {
    handle(record) {
        const order = JSON.parse(record.value) as Order;
        if (!order.address) throw { kind: "validation", message: "address is required" } satisfies Failure;
        if (now < input.mapsDownUntilMs) throw { kind: "unavailable", message: "maps API answered 503" } satisfies Failure;
        if (!matched.has(order.id)) matched.set(order.id, now / 1000);
    },
    publish(topic, message) {
        stamp(broker.append(topic, message), now);
    },
};

const horizon = input.horizonMs ?? 900_000;
for (now = 0; now <= horizon; now += 1000) {
    for (const topic of Object.keys(DELAY_MS)) {
        for (let p = 0; p < 6; p++) {
            const key = `${topic}/${p}`;
            for (let n = 0; n < 100; n++) {
                const offset = position.get(key) ?? 0;
                const [record] = broker.read(topic, p, offset, 1);
                if (!record || now < (writtenAt.get(`${topic}/${p}/${offset}`) ?? 0) + DELAY_MS[topic]) break;
                try {
                    onRecord(record, now, deps);
                } catch {
                    blockedSeconds++;
                    break;
                }
                position.set(key, offset + 1);
            }
        }
    }
}

let pendingRetries = 0;
for (const topic of RETRY_TOPICS) {
    for (let p = 0; p < 6; p++) pendingRetries += broker.endOffset(topic, p) - (position.get(`${topic}/${p}`) ?? 0);
}
const dlt = broker.read(DEAD_LETTER_TOPIC, 0, 0).map((r) => {
    const h = r.headers ?? {};
    return {
        id: r.key,
        attempts: h["x-attempts"] ?? null,
        error: h["x-error"] ?? null,
        from: `${h["x-original-topic"]}-${h["x-original-partition"]}@${h["x-original-offset"]}`,
        firstFailedAt: h["x-first-failed-at"] ?? null,
    };
}).sort((a, b) => String(a.id).localeCompare(String(b.id)));
console.log(JSON.stringify({
    matched: Object.fromEntries(input.orders.map((o) => [o.id, matched.get(o.id) ?? null])),
    dlt,
    pendingRetries,
    blockedSeconds,
}));
