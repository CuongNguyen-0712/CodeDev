import { readFileSync } from "node:fs";

// Rice Rocket notifications consumer: group "notifications" on topic "orders.v1" (6 partitions,
// keyed by order id). For each order event with status "picked_up" it pushes
// "Your order <orderId> is on the way" to the customer through Rice Rocket's push gateway.
// The pod can be OOM-killed at any moment; Kubernetes restarts it and runConsumer starts again
// from the committed offsets.
//   consumer.poll(max)                  the next records (each partition in offset order)
//   consumer.commit(partition, offset)  offset = the NEXT record to read after a restart
//   push.send({ userId, text, idempotencyKey })
//                                       the gateway drops a send whose idempotencyKey it already
//                                       accepted in the last 24 hours; without a key it always sends
interface OrderEvent { eventId: string; orderId: string; customerId: string; status: string }
interface ConsumerApi { poll(max: number): Record_[]; commit(partition: number, offset: number): void }
interface PushGateway { send(push: { userId: string; text: string; idempotencyKey?: string }): void }

function runConsumer(consumer: ConsumerApi, push: PushGateway): void {
    const seen = new Set<string>(); // event ids pushed since this pod started
    for (;;) {
        // @piece fetch-batch: Fetch the next batch
        const batch = consumer.poll(50);
        // @end
        if (batch.length === 0) return;
        const next = new Map<number, number>();
        for (const record of batch) {
            const event = JSON.parse(record.value) as OrderEvent;
            // @piece send-push: Push "on the way" so a re-run cannot send it twice
            if (event.status === "picked_up") {
                push.send({ userId: event.customerId, text: `Your order ${event.orderId} is on the way`, idempotencyKey: event.eventId });
            }
            // @end
            // @piece mark-done: Remember how far each partition got
            next.set(record.partition, record.offset + 1);
            // @end
        }
        // @piece commit-batch: Commit once the batch's pushes went out
        for (const [partition, offset] of next) consumer.commit(partition, offset);
        // @end
    }
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
// Input: { orders, cancelled?, crashes?, max? }. For each order i (key order-i) two events go to
// orders.v1: "created", then "picked_up" (or "cancelled" for the ids listed in `cancelled`).
// crashes: [{ "at": "push", "n": 3 }]   the pod is killed right after the gateway accepted the
//                                         3rd send call (counted over the whole test)
//          [{ "at": "commit", "n": 2 }] the pod is killed during the 2nd commit call, before it lands
// After a kill the consumer restarts from the committed offsets (start of the partition if none).
// Output: { pushes, duplicates, missing, committedAtEnd, restarts }: pushes delivered to phones,
// orders pushed more than once, picked-up orders never pushed, whether every partition's committed
// offset reached its end.
class Killed extends Error {}
const TOPIC = "orders.v1";

const input = JSON.parse(readFileSync(0, "utf8")) as {
    orders: number; cancelled?: number[]; crashes?: { at: "push" | "commit"; n: number }[];
};
const broker = new Broker();
broker.createTopic(TOPIC, 6);
for (let i = 1; i <= input.orders; i++) {
    const base = { orderId: `order-${i}`, customerId: `cust-${100 + i}` };
    broker.append(TOPIC, { key: base.orderId, value: JSON.stringify({ ...base, eventId: `evt-${i}-1`, status: "created" }) });
    const status = (input.cancelled ?? []).includes(i) ? "cancelled" : "picked_up";
    broker.append(TOPIC, { key: base.orderId, value: JSON.stringify({ ...base, eventId: `evt-${i}-2`, status }) });
}

const crashes = input.crashes ?? [];
let pushCalls = 0;
let commitCalls = 0;
let polls = 0;
const keys = new Set<string>();
const delivered: string[] = [];
const gateway: PushGateway = {
    send(msg) {
        pushCalls++;
        if (msg.idempotencyKey === undefined || !keys.has(msg.idempotencyKey)) {
            if (msg.idempotencyKey !== undefined) keys.add(msg.idempotencyKey);
            delivered.push(msg.text.replace(/^Your order (\S+) is on the way$/, "$1"));
        }
        if (crashes.some((c) => c.at === "push" && c.n === pushCalls)) throw new Killed();
    },
};

let restarts = 0;
for (;;) {
    const position = new Map<number, number>();
    for (let p = 0; p < 6; p++) position.set(p, broker.committedOffset("notifications", TOPIC, p) ?? 0);
    const consumer: ConsumerApi = {
        poll(max) {
            if (++polls > 300) return []; // a consumer that never moves forward
            const out: Record_[] = [];
            for (const [p, from] of position) {
                const records = broker.read(TOPIC, p, from, max - out.length);
                position.set(p, from + records.length);
                out.push(...records);
                if (out.length >= max) break;
            }
            return out;
        },
        commit(partition, offset) {
            commitCalls++;
            if (crashes.some((c) => c.at === "commit" && c.n === commitCalls)) throw new Killed();
            broker.commit("notifications", TOPIC, partition, offset);
        },
    };
    try {
        runConsumer(consumer, gateway);
        break;
    } catch (error) {
        if (!(error instanceof Killed) || ++restarts > 20) throw error;
    }
}

const counts = new Map<string, number>();
for (const id of delivered) counts.set(id, (counts.get(id) ?? 0) + 1);
const pickedUp: string[] = [];
for (let i = 1; i <= input.orders; i++) if (!(input.cancelled ?? []).includes(i)) pickedUp.push(`order-${i}`);
let committedAtEnd = true;
for (let p = 0; p < 6; p++) {
    if (broker.committedOffset("notifications", TOPIC, p) !== broker.endOffset(TOPIC, p) && broker.endOffset(TOPIC, p) > 0) committedAtEnd = false;
}
const byNumber = (a: string, b: string) => Number(a.slice(6)) - Number(b.slice(6));
console.log(JSON.stringify({
    pushes: delivered.length,
    duplicates: [...counts].filter(([, n]) => n > 1).map(([id]) => id).sort(byNumber),
    missing: pickedUp.filter((id) => !counts.has(id)),
    committedAtEnd,
    restarts,
}));
