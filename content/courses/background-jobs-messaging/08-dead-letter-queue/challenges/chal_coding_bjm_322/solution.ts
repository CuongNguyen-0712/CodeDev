import { readFileSync } from "node:fs";

// Dead-letter queue & redrive. The certificate-renderer queue of CodeDev now parks messages that keep
// failing in a dead-letter queue (DLQ). After a fix is deployed, the on-call engineer must be able to
// move selected dead messages back to the main queue (redrive) without flooding it, without creating
// duplicates and without replaying messages the current code cannot read, and to purge old ones.
// Implement tick, redrive and purge. The clock counts minutes. Do not change the rest of the file.

type Config = { maxAttempts: number; redrivePerTick: number; supportedSchemas: number[] };
type Message = {
    id: string;
    schema: number;
    body: string;
    attempts: number;
    firstFailedAt: number | null;
    lastFailedAt: number | null;
    lastError: string | null;
};
type DeadLetter = { id: string; schema: number; body: string; attempts: number; firstFailedAt: number; lastFailedAt: number; lastError: string };
type State = {
    now: number;
    config: Config;
    main: Message[]; // index 0 = head
    dlq: DeadLetter[]; // oldest dead letter first
    redrivePending: string[]; // ids waiting to be moved back, in order
    fixed: Set<string>; // errors fixed by a deploy
};
type RedriveCommand = { op: "redrive"; ids?: string[]; error?: string };

// ---------------------------------------------------------------- handler (do not change)
// "ok" succeeds. "flaky:N" fails with "Timeout" on attempts 1..N, then succeeds.
// Any other body is the name of the error it fails with, until a deploy fixes that error.
function handle(state: State, msg: Message): void {
    if (msg.body === "ok") return;
    const flaky = /^flaky:(\d+)$/.exec(msg.body);
    if (flaky) {
        if (msg.attempts <= Number(flaky[1])) throw new Error("Timeout");
        return;
    }
    if (state.fixed.has(msg.body)) return;
    throw new Error(msg.body);
}

// ---------------------------------------------------------------- your code
const MINUTES_PER_DAY = 1440;

/** One minute: advance the clock, move redriven messages back, deliver one message. Returns the events. */
function tick(state: State): string[] {
    const events: string[] = [];
    state.now += 1;

    // 1. redrive, rate-limited: at most redrivePerTick pending ids are handled per minute
    const batch = state.redrivePending.splice(0, state.config.redrivePerTick);
    for (const id of batch) {
        const index = state.dlq.findIndex((d) => d.id === id);
        if (index < 0) continue;
        if (state.main.some((m) => m.id === id)) {
            events.push(`${id}: already in the main queue, left in the DLQ`);
            continue;
        }
        const [dead] = state.dlq.splice(index, 1);
        state.main.push({ id: dead.id, schema: dead.schema, body: dead.body, attempts: 0, firstFailedAt: null, lastFailedAt: null, lastError: null });
        events.push(`redriven ${id}`);
    }

    // 2. one delivery from the head
    const msg = state.main.shift();
    if (!msg) return events;
    msg.attempts += 1;
    try {
        handle(state, msg);
        events.push(`processed ${msg.id}`);
    } catch (err) {
        const error = (err as Error).message;
        msg.firstFailedAt ??= state.now;
        msg.lastFailedAt = state.now;
        msg.lastError = error;
        if (msg.attempts >= state.config.maxAttempts) {
            state.dlq.push({
                id: msg.id,
                schema: msg.schema,
                body: msg.body,
                attempts: msg.attempts,
                firstFailedAt: msg.firstFailedAt,
                lastFailedAt: msg.lastFailedAt,
                lastError: error,
            });
            events.push(`dead-lettered ${msg.id} after ${msg.attempts} attempts: ${error}`);
        } else {
            state.main.push(msg);
            events.push(`failed ${msg.id} attempt ${msg.attempts}: ${error}`);
        }
    }
    return events;
}

/** Selects dead letters by ids or by last error and queues them for redrive. Returns the events. */
function redrive(state: State, cmd: RedriveCommand): string[] {
    const byIds = Array.isArray(cmd.ids) && cmd.ids.length > 0;
    const byError = typeof cmd.error === "string" && cmd.error.length > 0;
    if (byIds === byError) return ["rejected: give either ids or error"];

    const selected = byIds ? (cmd.ids as string[]) : state.dlq.filter((d) => d.lastError === cmd.error).map((d) => d.id);
    if (selected.length === 0) return [`no dead letters with error ${cmd.error}`];

    const events: string[] = [];
    for (const id of selected) {
        const dead = state.dlq.find((d) => d.id === id);
        if (!dead) events.push(`${id}: not in the DLQ`);
        else if (!state.config.supportedSchemas.includes(dead.schema)) events.push(`${id}: schema v${dead.schema} is not supported, not redriven`);
        else if (state.redrivePending.includes(id)) events.push(`${id}: already queued for redrive`);
        else {
            state.redrivePending.push(id);
            events.push(`${id}: queued for redrive`);
        }
    }
    return events;
}

/** Deletes dead letters whose last failure is at least `olderThanDays` days old. Returns the events. */
function purge(state: State, olderThanDays: number): string[] {
    if (!Number.isInteger(olderThanDays) || olderThanDays < 1) return ["rejected: olderThanDays must be a whole number of at least 1"];
    const limit = olderThanDays * MINUTES_PER_DAY;
    const events: string[] = [];
    state.dlq = state.dlq.filter((d) => {
        if (state.now - d.lastFailedAt < limit) return true;
        events.push(`purged ${d.id}`);
        state.redrivePending = state.redrivePending.filter((id) => id !== d.id);
        return false;
    });
    return events;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { config, commands }. Commands: send {id, schema, body}, tick {minutes?}, redrive {ids | error},
// deploy {fix}, purge {olderThanDays}. Prints, after each command, its events and the state.
// Consecutive sends are printed as one entry. At most 30 events and 30 main-queue ids are listed.
type Command =
    | { op: "send"; id: string; schema: number; body: string }
    | { op: "tick"; minutes?: number }
    | RedriveCommand
    | { op: "deploy"; fix: string }
    | { op: "purge"; olderThanDays: number };

const input = JSON.parse(readFileSync(0, "utf8")) as { config: Config; commands: Command[] };
const state: State = { now: 0, config: input.config, main: [], dlq: [], redrivePending: [], fixed: new Set() };
const clip = (items: string[]): string[] => (items.length > 30 ? [...items.slice(0, 30), `... and ${items.length - 30} more`] : items);
const report: object[] = [];
let sends = 0;
const flushSends = (): void => {
    if (sends === 0) return;
    report.push({ t: state.now, cmd: `send x${sends}`, main: clip(state.main.map((m) => `${m.id}#${m.attempts}`)) });
    sends = 0;
};
for (const cmd of input.commands) {
    if (cmd.op === "send") {
        state.main.push({ id: cmd.id, schema: cmd.schema, body: cmd.body, attempts: 0, firstFailedAt: null, lastFailedAt: null, lastError: null });
        sends++;
        continue;
    }
    flushSends();
    let events: string[] = [];
    let label: string = cmd.op;
    if (cmd.op === "tick") {
        const minutes = cmd.minutes ?? 1;
        label = `tick ${minutes}`;
        for (let i = 0; i < minutes; i++) events.push(...tick(state));
    } else if (cmd.op === "redrive") {
        label = cmd.ids ? `redrive ids ${cmd.ids.join(",")}` : `redrive error ${cmd.error ?? "(none)"}`;
        events = redrive(state, cmd);
    } else if (cmd.op === "deploy") {
        label = `deploy fix ${cmd.fix}`;
        state.fixed.add(cmd.fix);
    } else if (cmd.op === "purge") {
        label = `purge ${cmd.olderThanDays} days`;
        events = purge(state, cmd.olderThanDays);
    } else {
        events = ["unknown command"];
    }
    report.push({
        t: state.now,
        cmd: label,
        events: clip(events),
        main: clip(state.main.map((m) => `${m.id}#${m.attempts}`)),
        dlq: state.dlq.map((d) => `${d.id} v${d.schema} attempts=${d.attempts} first=${d.firstFailedAt} last=${d.lastFailedAt} error=${d.lastError}`),
        redrivePending: [...state.redrivePending],
    });
}
flushSends();
console.log(JSON.stringify(report, null, 2));
