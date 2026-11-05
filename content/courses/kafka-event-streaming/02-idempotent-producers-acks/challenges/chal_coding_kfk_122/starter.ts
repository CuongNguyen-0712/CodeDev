import { readFileSync } from "node:fs";

// Rice Rocket's order producer settings. Last month's config (acks 1, retries without idempotence)
// lost an OrderPlaced when a partition leader died, and wrote another one twice after an ack timed
// out, so two couriers were offered the same order. Fix producerConfig() so that:
//   - an event counts as sent only once enough in-sync replicas have it (the topic has
//     replication factor 3 and min.insync.replicas 2);
//   - a send that fails or times out is retried for up to two minutes, and a resend never stores
//     the event twice;
//   - events of one partition keep their order, even when an earlier request is retried.
// Field names map to the producer properties: acks (0, 1 or -1 = "all"), idempotent
// (enable.idempotence), retries, deliveryTimeoutMs (delivery.timeout.ms) and maxInFlight
// (max.in.flight.requests.per.connection).
//
// Do not change the types or the test runner.

type ProducerConfig = { acks: 0 | 1 | -1; idempotent: boolean; retries: number; deliveryTimeoutMs: number; maxInFlight: number };

function producerConfig(): ProducerConfig {
    return {
        // [ ] How many replicas must have an event before it counts
        // [ ] Let the broker drop an event that is sent twice
        // [ ] How often and for how long a failed send is retried
        // [ ] Unacknowledged requests per connection
    };
}


// ---------------------------------------------------------------- test runner (do not change)
// One partition of orders.v1 (replication factor 3, min.insync.replicas 2) and one producer with
// producerConfig(). Each scenario replays a documented failure and reports what the partition
// finally holds ("stored", in offset order) and the errors the application saw.
//   config         "ok" or the configuration error the client raises at startup
//   leader-crash   the leader appends `at`, then dies before a follower copies it; the new
//                  leader never had it (an old leader that rejoins truncates to the new log)
//   lost-ack       `at` is written and replicated, but its acknowledgement is lost and the
//                  request times out
//   reorder        all `events` are sent at once (up to maxInFlight requests); the first
//                  request fails with a retriable error and the later ones succeed
//   isr-shrink     one follower is down; the other drops out of the ISR just before `at` and
//                  is back in sync 10 s later. min_copies_at_ack = the fewest replicas that
//                  held an event when the producer was told it was written
type Scenario = "leader-crash" | "lost-ack" | "reorder" | "isr-shrink";
type Input = { checks: Array<"config" | Scenario>; events: string[]; at?: string };

const MIN_INSYNC = 2;
const REQUEST_TIMEOUT_MS = 30000;

function validate(c: ProducerConfig): string | null {
    if (![0, 1, -1].includes(c.acks)) return `acks must be 0, 1 or -1 (all), got ${c.acks}`;
    if (!Number.isInteger(c.maxInFlight) || c.maxInFlight < 1) return "maxInFlight must be at least 1";
    if (c.deliveryTimeoutMs < REQUEST_TIMEOUT_MS) return "deliveryTimeoutMs must be at least linger.ms + request.timeout.ms (30000)";
    if (c.idempotent && c.acks !== -1) return "the idempotent producer requires acks=all (-1)";
    if (c.idempotent && c.maxInFlight > 5) return "the idempotent producer requires maxInFlight <= 5";
    if (c.idempotent && c.retries < 1) return "the idempotent producer requires retries > 0";
    return null;
}

function play(c: ProducerConfig, scenario: Scenario, events: string[], at: string | undefined) {
    const stored: string[] = [];
    const errors: string[] = [];
    const canRetry = c.retries > 0;
    if (scenario === "leader-crash") {
        for (const e of events) {
            if (e !== at) { stored.push(e); continue; }
            // acks 0/1: the producer already moved on; the event dies with the old leader.
            if (c.acks !== -1) continue;
            // acks all: no acknowledgement came back, so the producer retries on the new leader.
            if (canRetry) stored.push(e); else errors.push(`${e}: NotLeaderOrFollower`);
        }
        return { stored, errors };
    }
    if (scenario === "lost-ack") {
        for (const e of events) {
            stored.push(e);
            if (e !== at || c.acks === 0) continue;
            if (!canRetry) { errors.push(`${e}: TimeoutException`); continue; }
            // The resend carries the same producer id and sequence number when idempotent.
            if (!c.idempotent) stored.push(e);
        }
        return { stored, errors };
    }
    if (scenario === "reorder") {
        const [first, ...rest] = events;
        const window = Math.min(c.maxInFlight, events.length);
        if (!canRetry) return { stored: rest, errors: [`${first}: NotLeaderOrFollower`] };
        // Idempotent: the broker rejects later sequence numbers until `first` arrives, and the
        // producer resends them in order. Without it, requests already in flight land first.
        if (c.idempotent || window === 1) return { stored: [...events], errors };
        return { stored: [...rest.slice(0, window - 1), first, ...rest.slice(window - 1)], errors };
    }
    // isr-shrink
    let minCopies = Infinity;
    for (const e of events) {
        const inSync = e === at ? 1 : 2;
        if (c.acks === -1 && inSync < MIN_INSYNC) {
            // NotEnoughReplicas is retriable: the write succeeds once the follower is back (10 s).
            if (canRetry && c.deliveryTimeoutMs > 10000) { stored.push(e); minCopies = Math.min(minCopies, MIN_INSYNC); } else errors.push(`${e}: NotEnoughReplicas`);
            continue;
        }
        stored.push(e);
        if (c.acks !== 0) minCopies = Math.min(minCopies, c.acks === 1 ? 1 : inSync);
    }
    return { stored, errors, min_copies_at_ack: minCopies === Infinity ? null : minCopies };
}

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const config = producerConfig();
const problem = validate(config);
const out: Record<string, unknown> = {};
for (const check of input.checks) {
    if (check === "config") out.config = problem ?? "ok";
    else out[check] = problem ? { error: problem } : play(config, check, input.events, input.at);
}
console.log(JSON.stringify(out));
