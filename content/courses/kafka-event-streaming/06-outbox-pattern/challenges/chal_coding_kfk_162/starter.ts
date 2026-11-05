import { readFileSync } from "node:fs";

// Rice Rocket order api: the outbox relay.
//
// The api writes an order and its events in ONE PostgreSQL transaction:
//   INSERT INTO orders (...) VALUES (...);
//   INSERT INTO outbox (aggregate_id, event_id, type, payload) VALUES ($1, $2, 'OrderPlaced', $3);
// so an event exists exactly when its order change was committed. The relay below runs once per
// second. Each pass it must:
//   - read at most batchSize unsent rows (sent_at IS NULL), oldest first (ORDER BY id);
//   - publish them to orders.v1 in that order, keyed by aggregate_id (the order id), with the payload
//     as the value and the headers event-id and event-type;
//   - only after the broker acknowledged the batch, mark exactly those rows as sent;
//   - let a broker failure propagate: the rows stay unsent and the next pass sends them again.
// It returns the number of rows it sent. The db layer maps the snake_case columns to the camelCase
// fields of OutboxRow and understands the two statements below.
//
// Do not change the types or the test runner.

type OutboxRow = { id: number; aggregateId: string; eventId: string; type: string; payload: string };
type Db = { query(sql: string, params: unknown[]): OutboxRow[] };
type Producer = { send(topic: string, messages: Message[]): void };

/** One pass of the relay: publish up to batchSize unsent outbox rows, then mark them sent. */
function relayOnce(db: Db, producer: Producer, batchSize: number): number {
    // [ ] The unsent rows, oldest first, at most batchSize
    if (rows.length === 0) return 0;
    // [ ] Publish the rows to orders.v1, keyed by order
    // [ ] Mark exactly these rows as sent
    return rows.length;
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
// Input: { orders: [{ id, events: [type...], atPass, committed }], batchSize, passes,
//          brokerDownPasses?, crashBeforePublishPasses?, crashAfterPublishPasses? }
// Each pass: the api commits the orders of that pass (a rolled-back transaction writes nothing, its
// outbox rows included), then the relay runs once. A broker outage makes send throw. A crash kills
// the relay process inside send: before the batch reaches the broker, or right after the broker
// acknowledged it (so the rows are never marked). Without ORDER BY, PostgreSQL returns rows in no
// guaranteed order; this database returns them in an arbitrary but fixed order (a hash of event_id).
// Output: { published, missing, duplicates, outOfOrder, rolledBackEvents, unsent } where an order is
// out of order when its events (first copy of each event id) are not on one partition in sequence.
type OrderCase = { id: string; events: string[]; atPass: number; committed: boolean };
type Case = {
    orders: OrderCase[]; batchSize: number; passes: number;
    brokerDownPasses?: number[]; crashBeforePublishPasses?: number[]; crashAfterPublishPasses?: number[];
};
type StoredRow = OutboxRow & { sentAt: number | null };

const input: Case = JSON.parse(readFileSync(0, "utf8"));
const broker = new Broker();
broker.createTopic("orders.v1", 6);
const table: StoredRow[] = [];
let pass = 0;

const SELECT_RE = /^\s*SELECT\s+id,\s*aggregate_id,\s*event_id,\s*type,\s*payload\s+FROM\s+outbox\s+WHERE\s+sent_at\s+IS\s+NULL(\s+ORDER\s+BY\s+id(\s+ASC)?)?\s+LIMIT\s+\$1\s*$/i;
const UPDATE_RE = /^\s*UPDATE\s+outbox\s+SET\s+sent_at\s*=\s*now\(\)\s+WHERE\s+id\s*=\s*ANY\(\$1\)\s*$/i;
const hashOf = (s: string): number => murmur2(new TextEncoder().encode(s)) & 0x7fffffff;
const db: Db = {
    query(sql, params) {
        const select = sql.match(SELECT_RE);
        if (select) {
            const unsent = table.filter((r) => r.sentAt === null);
            if (!select[1]) unsent.sort((a, b) => hashOf(a.eventId) - hashOf(b.eventId));
            return unsent.slice(0, Number(params[0])).map(({ id, aggregateId, eventId, type, payload }) => ({ id, aggregateId, eventId, type, payload }));
        }
        if (UPDATE_RE.test(sql)) {
            const ids = new Set(params[0] as number[]);
            for (const r of table) if (ids.has(r.id)) r.sentAt = pass;
            return [];
        }
        throw new Error(`unsupported query: ${sql}`);
    },
};
const producer: Producer = {
    send(topic, messages) {
        if (input.brokerDownPasses?.includes(pass)) throw new Error("broker unreachable: no acknowledgement within the request timeout");
        if (input.crashBeforePublishPasses?.includes(pass)) throw new Error("relay process killed before the batch was sent");
        for (const m of messages) broker.append(topic, m);
        if (input.crashAfterPublishPasses?.includes(pass)) throw new Error("relay process killed after the broker acknowledged the batch");
    },
};

const committedEvents: { orderId: string; eventId: string; seq: number }[] = [];
const rolledBack = new Set<string>();
for (pass = 1; pass <= input.passes; pass++) {
    for (const order of input.orders.filter((o) => o.atPass === pass)) {
        if (!order.committed) { rolledBack.add(order.id); continue; }
        order.events.forEach((type, i) => {
            const eventId = `${order.id}:${i + 1}`;
            table.push({ id: table.length + 1, aggregateId: order.id, eventId, type, payload: JSON.stringify({ eventId, type, orderId: order.id }), sentAt: null });
            committedEvents.push({ orderId: order.id, eventId, seq: i + 1 });
        });
    }
    try {
        relayOnce(db, producer, input.batchSize);
    } catch {
        // The relay failed or died; the next pass starts it again.
    }
}

const firstCopy = new Map<string, { partition: number; offset: number; orderId: string }>();
const copies = new Map<string, number>();
let published = 0;
for (let p = 0; p < 6; p++) {
    for (const r of broker.read("orders.v1", p, 0)) {
        published++;
        const event = JSON.parse(r.value) as { eventId: string; orderId: string };
        copies.set(event.eventId, (copies.get(event.eventId) ?? 0) + 1);
        if (!firstCopy.has(event.eventId)) firstCopy.set(event.eventId, { partition: p, offset: r.offset, orderId: event.orderId });
    }
}
const outOfOrder = new Set<string>();
const byOrder = new Map<string, { seq: number; partition: number; offset: number }[]>();
for (const e of committedEvents) {
    const c = firstCopy.get(e.eventId);
    if (c) byOrder.set(e.orderId, [...(byOrder.get(e.orderId) ?? []), { seq: e.seq, partition: c.partition, offset: c.offset }]);
}
for (const [orderId, list] of byOrder) {
    list.sort((a, b) => a.seq - b.seq);
    if (list.some((x, i) => x.partition !== list[0].partition || (i > 0 && x.offset < list[i - 1].offset))) outOfOrder.add(orderId);
}
console.log(JSON.stringify({
    published,
    missing: committedEvents.filter((e) => !copies.has(e.eventId)).map((e) => e.eventId),
    duplicates: [...copies].filter(([, n]) => n > 1).map(([id]) => id).sort(),
    outOfOrder: [...outOfOrder].sort(),
    rolledBackEvents: [...firstCopy.values()].filter((c) => rolledBack.has(c.orderId)).map((c) => c.orderId),
    unsent: table.filter((r) => r.sentAt === null).length,
}));
