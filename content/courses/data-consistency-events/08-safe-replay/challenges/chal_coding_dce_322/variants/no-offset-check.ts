import { readFileSync } from "node:fs";

// CodeDev leaderboard read model. The progress service publishes "points awarded" events to a
// partitioned topic; each event has its partition p and its offset o in that partition (offsets
// grow inside a partition and say nothing across partitions). points may be negative (points
// revoked after a plagiarism review).
//
// The read model is kept in versions ("v1", "v2", ...): each version has its own scores and its
// own last applied offset per partition. Readers use the active version (initially "v1"). Live
// consumption, replays from an offset and a full rebuild of a new version all call apply(), so
// apply() must make every event count at most once per version, whoever delivers it and however
// often.
//
// Write LeaderboardStore. All of its state lives in the FakeDb: after a crash the runner creates a
// new LeaderboardStore on the same database, and anything kept only in memory is gone.
//
//   apply(version, event)
//     "rejected"  when p or o is not an integer >= 0, learner is not a non-empty string or points
//                 is not an integer. No transaction, nothing changes.
//     Otherwise make exactly ONE db.tx call. Inside it, read the last applied offset of
//     (version, p): if the event's offset is at or below it, return "skipped" and write nothing;
//     else add points to the learner's score in that version and store o as the last applied
//     offset of (version, p) - both in this same transaction - and return "applied".
//   switchTo(version)
//     Make version the active one, in one transaction, but only if it has caught up: for every
//     partition the active version has applied, the target's last applied offset exists and is
//     at least as high. Return true (switched, or already active) or false (nothing changes).
//   active()             the active version.
//   scores(version)      { learner: score } of that version ({} if it has nothing).
//   offsets(version)     { "<p>": last applied offset } of that version ({} if it has nothing).
//
// Do not change FakeDb, the types or the test runner.

class Crash extends Error {}

type Tx = {
    get<T = unknown>(table: string, key: string): T | undefined;
    put(table: string, key: string, value: unknown): void;
    rows<T = unknown>(table: string): [string, T][];
};

// In-memory database. tx(fn) runs fn on a private copy and commits it only when fn returns
// without throwing. Values are copied in and out (JSON), so changing an object you read does
// not change the database until you put() it inside a transaction.
class FakeDb {
    private tables = new Map<string, Map<string, string>>();
    private armed = false;
    private down = false;

    tx<T>(fn: (tx: Tx) => T): T {
        if (this.down) throw new Crash("the process is down");
        const draft = new Map<string, Map<string, string>>();
        for (const [name, table] of this.tables) draft.set(name, new Map(table));
        let open = true;
        const check = () => { if (!open) throw new Error("transaction already finished"); };
        const tx: Tx = {
            get<T>(table: string, key: string): T | undefined {
                check();
                const value = draft.get(table)?.get(key);
                return value === undefined ? undefined : (JSON.parse(value) as T);
            },
            put(table: string, key: string, value: unknown): void {
                check();
                if (!draft.has(table)) draft.set(table, new Map());
                draft.get(table)!.set(key, JSON.stringify(value));
            },
            rows<T>(table: string): [string, T][] {
                check();
                return [...(draft.get(table) ?? new Map<string, string>())].map(([k, v]) => [k, JSON.parse(v) as T]);
            },
        };
        try {
            const result = fn(tx);
            this.tables = draft;
            if (this.armed) {
                // a crash scripted by the test: this commit is durable, nothing after it happens
                this.armed = false;
                this.down = true;
                throw new Crash("crash after commit");
            }
            return result;
        } finally {
            open = false;
        }
    }

    // runner only
    armCrash(): void { this.armed = true; }
    disarm(): void { this.armed = false; }
    isDown(): boolean { return this.down; }
    restart(): void { this.down = false; this.armed = false; }
}

type PointsEvent = { p: number; o: number; learner: string; points: number };

class LeaderboardStore {
    private readonly db: FakeDb;

    constructor(db: FakeDb) {
        this.db = db;
    }

    apply(version: string, event: PointsEvent): "applied" | "skipped" | "rejected" {
        const { p, o, learner, points } = event;
        if (!Number.isInteger(p) || p < 0 || !Number.isInteger(o) || o < 0) return "rejected";
        if (typeof learner !== "string" || learner === "" || !Number.isInteger(points)) return "rejected";
        // The offset check and both writes in ONE transaction: a crash or a second deliverer
        // can never see the score without the offset that explains it.
        return this.db.tx((tx): "applied" | "skipped" => {
            const offsetKey = `${version}/${p}`;
            const last = tx.get<number>("offsets", offsetKey);
            const scoreKey = `${version}/${learner}`;
            tx.put("scores", scoreKey, (tx.get<number>("scores", scoreKey) ?? 0) + points);
            tx.put("offsets", offsetKey, o);
            return "applied";
        });
    }

    switchTo(version: string): boolean {
        return this.db.tx((tx) => {
            const current = tx.get<string>("meta", "active") ?? "v1";
            if (version === current) return true;
            for (const [key, offset] of tx.rows<number>("offsets")) {
                if (!key.startsWith(`${current}/`)) continue;
                const target = tx.get<number>("offsets", `${version}/${key.slice(current.length + 1)}`);
                if (target === undefined || target < offset) return false;
            }
            tx.put("meta", "active", version);
            return true;
        });
    }

    active(): string {
        return this.db.tx((tx) => tx.get<string>("meta", "active") ?? "v1");
    }

    scores(version: string): Record<string, number> {
        return this.read("scores", version);
    }

    offsets(version: string): Record<string, number> {
        return this.read("offsets", version);
    }

    private read(table: string, version: string): Record<string, number> {
        const prefix = `${version}/`;
        const out: Record<string, number> = {};
        for (const [key, value] of this.db.tx((tx) => tx.rows<number>(table))) {
            if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
        }
        return out;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "log": [{ "p", "o", "learner", "points" }], "ops": [...] }. The log is the topic in the
// order the broker delivers it. Ops, in order:
//   { "op": "live", "n": k, "crashAt"?: { "p", "o" } }  the live consumer delivers its next k events
//       to the active version, then commits its position. With crashAt, the process crashes right
//       after the first commit made while applying that event; the runner restarts (new
//       LeaderboardStore, same db) and the live consumer goes back to its last committed position.
//   { "op": "replay", "version": "v1", "p": 0, "from": 3 }  every event of partition p with offset
//       >= from, from the whole topic, into that version.
//   { "op": "rebuild", "version": "v2", "n"?: k }  the rebuild job feeds the next k events of the
//       topic (all the rest without n) into that version, starting at the beginning of the topic.
//   { "op": "switch", "to": "v2" }
// Prints one line per op, then the active version and every version's offsets and scores.
type Op =
    | { op: "live"; n: number; crashAt?: { p: number; o: number } }
    | { op: "replay"; version: string; p: number; from: number }
    | { op: "rebuild"; version: string; n?: number }
    | { op: "switch"; to: string };
type Test = { log: PointsEvent[]; ops: Op[] };

const test: Test = JSON.parse(readFileSync(0, "utf8"));
const db = new FakeDb();
let store = new LeaderboardStore(db);
let livePos = 0;
let committedPos = 0;
const rebuildPos = new Map<string, number>();
const versions = new Set<string>(["v1"]);
const ev = (e: PointsEvent) => `p${e.p}#${e.o}`;

function feed(version: () => string, events: PointsEvent[], crashAt?: { p: number; o: number }) {
    const counts = { applied: 0, skipped: 0, rejected: 0, delivered: 0, crashed: null as PointsEvent | null };
    for (const e of events) {
        const v = version();
        const crashHere = !!crashAt && e.p === crashAt.p && e.o === crashAt.o;
        if (crashHere) db.armCrash();
        let result = "";
        try {
            result = store.apply(v, e);
        } catch (error) {
            if (!db.isDown()) throw error;
        }
        db.disarm();
        if (db.isDown()) { counts.crashed = e; break; }
        counts.delivered++;
        if (result === "applied") counts.applied++;
        else if (result === "skipped") counts.skipped++;
        else if (result === "rejected") counts.rejected++;
    }
    return counts;
}
const summary = (c: { applied: number; skipped: number; rejected: number }) => `applied ${c.applied}, skipped ${c.skipped}, rejected ${c.rejected}`;

for (const op of test.ops) {
    if (op.op === "live") {
        const events = test.log.slice(livePos, livePos + op.n);
        const c = feed(() => store.active(), events, op.crashAt);
        if (c.crashed) {
            db.restart();
            store = new LeaderboardStore(db);
            livePos = committedPos;
            console.log(`live ${op.n}: ${summary(c)}; crash after a commit while applying ${ev(c.crashed)}, restart from position ${livePos}`);
        } else {
            livePos += c.delivered;
            committedPos = livePos;
            console.log(`live ${op.n}: ${summary(c)} -> position ${livePos}/${test.log.length}`);
        }
    } else if (op.op === "replay") {
        versions.add(op.version);
        const events = test.log.filter((e) => e.p === op.p && e.o >= op.from);
        console.log(`replay ${op.version} p${op.p} from ${op.from}: ${summary(feed(() => op.version, events))}`);
    } else if (op.op === "rebuild") {
        versions.add(op.version);
        const from = rebuildPos.get(op.version) ?? 0;
        const events = test.log.slice(from, op.n === undefined ? undefined : from + op.n);
        const c = feed(() => op.version, events);
        rebuildPos.set(op.version, from + c.delivered);
        console.log(`rebuild ${op.version}: ${summary(c)} -> position ${from + c.delivered}/${test.log.length}`);
    } else if (op.op === "switch") {
        versions.add(op.to);
        const ok = store.switchTo(op.to);
        console.log(`switch to ${op.to}: ${ok ? "ok" : `refused, active stays ${store.active()}`}`);
    }
}
console.log(`active ${store.active()}`);
for (const v of [...versions].sort()) {
    const offsets = Object.entries(store.offsets(v)).sort((a, b) => Number(a[0]) - Number(b[0])).map(([p, o]) => `p${p}=${o}`);
    const scores = Object.entries(store.scores(v)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const total = scores.reduce((sum, [, s]) => sum + s, 0);
    const top = scores.slice(0, 3).map(([l, s]) => `${l}=${s}`).join(" ");
    console.log(`${v}: offsets ${offsets.join(" ") || "none"}; learners ${scores.length}, total ${total}; top ${top || "none"}`);
}
