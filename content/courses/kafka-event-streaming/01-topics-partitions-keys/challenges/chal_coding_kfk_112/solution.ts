import { readFileSync } from "node:fs";

// Rice Rocket order events -> Kafka. The api calls toMessage(event) for every order event and
// produces the result; consumers (courier-matcher, notifications, analytics) read orders.v1 with
// one consumer per partition, so only events in the same partition keep their order.
//
// Requirements:
//   - ORDERS_TOPIC: the topic orders.v1 with 12 partitions, replication factor 3 and
//     min.insync.replicas 2 (a production topic that survives one broker down).
//   - toMessage(event): the topic, a key that keeps every event of one order in one partition
//     and in order, the event as JSON in the value, and two headers consumers read before parsing:
//     "event-type" (the event's type) and "schema-version" ("1").
//   - A big restaurant chain sends most lunch orders; its orders must not pile onto one partition.
//
// Do not change the types or the test runner.

type EventType = "OrderPlaced" | "OrderAccepted" | "CourierAssigned" | "OrderDelivered" | "OrderCancelled";
type OrderEvent = { eventId: string; type: EventType; orderId: string; restaurantId: string; at: string };
type TopicSpec = { topic: string; numPartitions: number; replicationFactor: number; configEntries: { name: string; value: string }[] };
type Outgoing = { topic: string; message: { key: string | null; value: string; headers: Record<string, string> } };

// @piece topic-config: Name, partitions and replication of the orders topic
const ORDERS_TOPIC: TopicSpec = {
    topic: "orders.v1",
    numPartitions: 12,
    replicationFactor: 3,
    configEntries: [{ name: "min.insync.replicas", value: "2" }],
};
// @end

function toMessage(event: OrderEvent): Outgoing {
    // @piece pick-key: The key that keeps one order's events in order
    const key = event.orderId;
    // @end
    // @piece event-headers: Headers a consumer reads before parsing the value
    const headers = { "event-type": event.type, "schema-version": "1" };
    // @end
    return { topic: ORDERS_TOPIC.topic, message: { key, value: JSON.stringify(event), headers } };
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
// Input: { checks: string[], events: OrderEvent[], order?: string }. Creates the topic from
// ORDERS_TOPIC, produces every event through toMessage, then reports the requested checks:
//   topic          { name, partitions, replicationFactor, minInsyncReplicas }
//   split_orders   orders whose events landed in more than one partition (sorted)
//   replay         the event types of `order` as a group reads them: partition by partition,
//                  each partition in offset order (partitions are consumed independently)
//   hot_partition  true when one partition holds more than 25% of the records
//   headers        the headers of the last record produced
type Input = { checks: string[]; events: OrderEvent[]; order?: string };
const input: Input = JSON.parse(readFileSync(0, "utf8"));
const broker = new Broker();
const out: Record<string, unknown> = {};
try {
    broker.createTopic(ORDERS_TOPIC.topic, ORDERS_TOPIC.numPartitions);
    let last: Record_ | null = null;
    for (const e of input.events) {
        const { topic, message } = toMessage(e);
        last = broker.append(topic, message);
    }
    const n = broker.partitions(ORDERS_TOPIC.topic);
    const all: Record_[][] = Array.from({ length: n }, (_, p) => broker.read(ORDERS_TOPIC.topic, p, 0));
    const eventOf = (r: Record_): OrderEvent => JSON.parse(r.value);
    for (const check of input.checks) {
        if (check === "topic") {
            const minIsr = ORDERS_TOPIC.configEntries.find((c) => c.name === "min.insync.replicas");
            out.topic = { name: ORDERS_TOPIC.topic, partitions: n, replicationFactor: ORDERS_TOPIC.replicationFactor, minInsyncReplicas: minIsr ? Number(minIsr.value) : 1 };
        } else if (check === "split_orders") {
            const where = new Map<string, Set<number>>();
            all.forEach((records, p) => records.forEach((r) => {
                const id = eventOf(r).orderId;
                where.set(id, (where.get(id) ?? new Set<number>()).add(p));
            }));
            out.split_orders = [...where].filter(([, ps]) => ps.size > 1).map(([id]) => id).sort();
        } else if (check === "replay") {
            out.replay = all.flat().map(eventOf).filter((e) => e.orderId === input.order).map((e) => e.type);
        } else if (check === "hot_partition") {
            const total = input.events.length;
            out.hot_partition = all.some((records) => records.length > total * 0.25);
        } else if (check === "headers") {
            out.headers = last ? last.headers ?? null : null;
        } else out[check] = `unknown check ${check}`;
    }
    console.log(JSON.stringify(out));
} catch (error) {
    console.log(JSON.stringify({ error: (error as Error).message }));
}
