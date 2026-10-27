import { readFileSync } from "node:fs";

// CodeDev sign-in sessions in Redis.
//   sess:<sessionId>        hash: userId, device, createdAt (clock.now in ms, as a string)
//   user:<userId>:sessions  set of the user's session ids (an index, so "sign out everywhere" needs no SCAN)
//
// createSession(r, clock, sessionId, userId, device): boolean
//   false (and nothing written) when sess:<sessionId> already exists; else write the hash, give it a
//   TTL of IDLE_TTL_SECONDS, add the id to the index and set the index TTL to ABSOLUTE_LIFETIME_SECONDS.
// touchSession(r, clock, sessionId): Session | null      called on every authenticated request
//   null when the session is gone. Else slide the expiry: the new TTL is IDLE_TTL_SECONDS, but never past
//   createdAt + ABSOLUTE_LIFETIME_SECONDS (seconds left, rounded down). No time left: delete it, return null.
// deleteSession(r, sessionId): boolean                    sign out one device
//   false when the session does not exist; else delete the hash and remove the id from the user's index.
// deleteAllSessions(r, userId): number                    sign out everywhere
//   delete every session listed in the index and remove those ids from it (an empty set disappears);
//   return how many sessions still existed.
// listSessions(r, userId): Session[]                      the "Your devices" page
//   the live sessions, sorted by createdAt then id. Remove ids whose hash has expired from the index.
//   Listing is not activity: it must not change any TTL.
// Do not change the types, the constants or anything below the "do not change" line.

type Session = { id: string; userId: string; device: string; createdAt: number };

const IDLE_TTL_SECONDS = 1800; // 30 minutes without a request
const ABSOLUTE_LIFETIME_SECONDS = 43200; // 12 hours after sign-in, however active

const sessionKey = (id: string): string => `sess:${id}`;
const indexKey = (userId: string): string => `user:${userId}:sessions`;

function readSession(r: FakeRedis, id: string): Session | null {
    const h = r.hgetall(sessionKey(id));
    if (h.userId === undefined) return null;
    return { id, userId: h.userId, device: h.device, createdAt: Number(h.createdAt) };
}

function createSession(r: FakeRedis, clock: FakeClock, sessionId: string, userId: string, device: string): boolean {
    const key = sessionKey(sessionId);
    if (r.exists(key)) return false;
    r.hset(key, "userId", userId);
    r.hset(key, "device", device);
    r.hset(key, "createdAt", String(clock.now));
    r.expire(key, IDLE_TTL_SECONDS);
    r.sadd(indexKey(userId), sessionId);
    r.expire(indexKey(userId), ABSOLUTE_LIFETIME_SECONDS);
    return true;
}

function touchSession(r: FakeRedis, clock: FakeClock, sessionId: string): Session | null {
    const session = readSession(r, sessionId);
    if (session === null) return null;
    const leftSeconds = Math.floor((session.createdAt + ABSOLUTE_LIFETIME_SECONDS * 1000 - clock.now) / 1000);
    if (leftSeconds <= 0) {
        deleteSession(r, sessionId);
        return null;
    }
    r.expire(sessionKey(sessionId), Math.min(IDLE_TTL_SECONDS, leftSeconds));
    return session;
}

function deleteSession(r: FakeRedis, sessionId: string): boolean {
    const userId = r.hget(sessionKey(sessionId), "userId");
    if (userId === null) return false;
    r.del(sessionKey(sessionId));
    r.srem(indexKey(userId), sessionId);
    return true;
}

function deleteAllSessions(r: FakeRedis, userId: string): number {
    const ids = r.smembers(indexKey(userId));
    const removed = ids.length ? r.del(...ids.map(sessionKey)) : 0;
    for (const id of ids) r.srem(indexKey(userId), id); // only the ids we read: a sign-in racing with us keeps its entry
    return removed;
}

function listSessions(r: FakeRedis, userId: string): Session[] {
    const sessions: Session[] = [];
    for (const id of r.smembers(indexKey(userId))) {
        const session = touchSession(r, clock, id);
        if (session === null) r.srem(indexKey(userId), id);
        else sessions.push(session);
    }
    return sessions.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------- in-memory Redis (do not change)
// A small model of the Redis commands used here. The clock is in milliseconds; expiry is lazy: a key
// whose expiry time is <= clock.now behaves as missing. smembers returns members sorted (real Redis
// gives no order). An empty hash or set is removed, like in Redis.
class FakeClock {
    now = 0;
    advance(ms: number): void {
        this.now += ms;
    }
}

type Value = string | Map<string, string> | Set<string>;
type Entry = { value: Value; expiresAt: number | null };

class FakeRedis {
    private data = new Map<string, Entry>();
    private clock: FakeClock;
    calls: Record<string, number> = {};
    constructor(clock: FakeClock) {
        this.clock = clock;
    }

    private count(command: string): void {
        this.calls[command] = (this.calls[command] ?? 0) + 1;
    }
    private live(key: string): Entry | undefined {
        const entry = this.data.get(key);
        if (entry && entry.expiresAt !== null && entry.expiresAt <= this.clock.now) {
            this.data.delete(key);
            return undefined;
        }
        return entry;
    }
    private typed<T extends Value>(key: string, kind: "hash" | "set"): T | undefined {
        const entry = this.live(key);
        if (!entry) return undefined;
        const ok = kind === "hash" ? entry.value instanceof Map : entry.value instanceof Set;
        if (!ok) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
        return entry.value as T;
    }

    del(...keys: string[]): number {
        this.count("del");
        let removed = 0;
        for (const key of keys) if (this.live(key) && this.data.delete(key)) removed++;
        return removed;
    }
    exists(key: string): 0 | 1 {
        this.count("exists");
        return this.live(key) ? 1 : 0;
    }
    expire(key: string, seconds: number): 0 | 1 {
        this.count("expire");
        const entry = this.live(key);
        if (!entry) return 0;
        if (!Number.isInteger(seconds)) throw new Error("ERR value is not an integer or out of range");
        if (seconds <= 0) {
            this.data.delete(key);
            return 1;
        }
        entry.expiresAt = this.clock.now + seconds * 1000;
        return 1;
    }
    /** -2 when the key is missing, -1 when it has no expiry, else the whole seconds left (rounded up). */
    ttl(key: string): number {
        this.count("ttl");
        const entry = this.live(key);
        if (!entry) return -2;
        if (entry.expiresAt === null) return -1;
        return Math.ceil((entry.expiresAt - this.clock.now) / 1000);
    }
    hset(key: string, field: string, value: string): number {
        this.count("hset");
        let hash = this.typed<Map<string, string>>(key, "hash");
        if (!hash) {
            hash = new Map();
            this.data.set(key, { value: hash, expiresAt: null });
        }
        const added = hash.has(field) ? 0 : 1;
        hash.set(field, String(value));
        return added;
    }
    hget(key: string, field: string): string | null {
        this.count("hget");
        return this.typed<Map<string, string>>(key, "hash")?.get(field) ?? null;
    }
    hgetall(key: string): Record<string, string> {
        this.count("hgetall");
        return Object.fromEntries(this.typed<Map<string, string>>(key, "hash") ?? []);
    }
    sadd(key: string, member: string): number {
        this.count("sadd");
        let set = this.typed<Set<string>>(key, "set");
        if (!set) {
            set = new Set();
            this.data.set(key, { value: set, expiresAt: null });
        }
        const added = set.has(member) ? 0 : 1;
        set.add(String(member));
        return added;
    }
    srem(key: string, member: string): number {
        this.count("srem");
        const set = this.typed<Set<string>>(key, "set");
        if (!set || !set.delete(member)) return 0;
        if (set.size === 0) this.data.delete(key);
        return 1;
    }
    smembers(key: string): string[] {
        this.count("smembers");
        return [...(this.typed<Set<string>>(key, "set") ?? [])].sort();
    }
    /** For the test runner only: every live key with its TTL and, for sets, its members. */
    dump(): string[] {
        const keys = [...this.data.keys()].filter((key) => this.live(key)).sort();
        return keys.map((key) => {
            const entry = this.data.get(key)!;
            const ttl = entry.expiresAt === null ? "none" : String(Math.ceil((entry.expiresAt - this.clock.now) / 1000));
            const members = entry.value instanceof Set ? ` {${[...entry.value].sort().join(",")}}` : "";
            return `${key} ttl=${ttl}${members}`;
        });
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of steps run on one fake clock. Each step prints one line; advance prints nothing.
type Step =
    | { op: "create"; id: string; userId: string; device: string }
    | { op: "use"; id: string }
    | { op: "delete"; id: string }
    | { op: "deleteAll"; userId: string }
    | { op: "list"; userId: string }
    | { op: "advance"; ms: number }
    | { op: "keys" };

const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
const clock = new FakeClock();
const redis = new FakeRedis(clock);
const out: string[] = [];
const show = (s: Session): string => `${s.id}(${s.userId} ${s.device} @${s.createdAt})`;
for (const step of steps) {
    try {
        switch (step.op) {
            case "create":
                out.push(`create ${step.id} -> ${createSession(redis, clock, step.id, step.userId, step.device)}`);
                break;
            case "use": {
                const s = touchSession(redis, clock, step.id);
                out.push(`use ${step.id} -> ${s ? show(s) : "signed out"}`);
                break;
            }
            case "delete":
                out.push(`delete ${step.id} -> ${deleteSession(redis, step.id)}`);
                break;
            case "deleteAll":
                out.push(`deleteAll ${step.userId} -> ${deleteAllSessions(redis, step.userId)}`);
                break;
            case "list": {
                const list = listSessions(redis, step.userId);
                out.push(`list ${step.userId} -> ${list.map(show).join(", ") || "none"}`);
                break;
            }
            case "advance":
                clock.advance(step.ms);
                break;
            case "keys":
                out.push(`keys @${clock.now}: ${redis.dump().join(" | ") || "none"}`);
                break;
        }
    } catch (error) {
        out.push(`${step.op} -> error: ${(error as Error).message}`);
    }
}
console.log(out.join("\n"));
