import { readFileSync } from "node:fs";

// TTL and stale-while-revalidate for the CodeDev leaderboard API. The leaderboard query takes about
// two seconds. With a plain 60-second TTL, the first request after each expiry waits for it, and at the
// 09:00 peak forty requests arrive in that window and run forty queries. Write the cache that fixes both.
//
// new SwrCache(maxAge, staleWhileRevalidate, clock, origin); get(key) returns a Promise<Served>.
// age = clock.now() - the time the stored value was fetched (when its fetch completed).
//   age < maxAge                               -> HIT: the stored value, no fetch
//   maxAge <= age < maxAge + staleWhileRevalidate -> STALE: the stored value at once, and a background
//                                                 revalidation, unless one is already running for the key
//   no value, or age >= maxAge + staleWhileRevalidate -> MISS: wait for a fetch (join the running one if any)
// At most one fetch per key at a time. A successful fetch stores its value (fetched at completion time).
// A failed fetch stores nothing and keeps the old value: stale-if-error until the stale window ends,
// a later STALE request starts a new revalidation, and a MISS waiting on it gets the error.
// Do not change the types, the fake clock, the origin or the test runner.

type Clock = { now(): number };
type Origin = { fetch(key: string): Promise<string> };
type Status = "HIT" | "STALE" | "MISS";
type Served = { status: Status; value: string | null; error: string | null; fetchesStarted: number };

class SwrCache {
    private readonly maxAge: number;
    private readonly staleWhileRevalidate: number;
    private readonly clock: Clock;
    private readonly origin: Origin;

    constructor(maxAge: number, staleWhileRevalidate: number, clock: Clock, origin: Origin) {
        this.maxAge = maxAge;
        this.staleWhileRevalidate = staleWhileRevalidate;
        this.clock = clock;
        this.origin = origin;
    }

    async get(key: string): Promise<Served> {
        // 1. how old is the stored value of this key, if there is one?
        // 2. HIT, STALE (answer now, revalidate once in the background) or MISS (wait for a fetch)?
        // 3. never two fetches for the same key at the same time
        return { status: "MISS", value: null, error: "not implemented", fetchesStarted: 0 };
    }
}

// ---------------------------------------------------------------- fake clock and origin (do not change)
// Input: { "maxAge": s, "staleWhileRevalidate": s, "origin": { "<key>": [{ "value": "v1", "takes": s } | { "error": "...", "takes": s }] },
//          "requests": [{ "at": s, "key": "<key>" }, ...] }
// The n-th fetch of a key gets the n-th scripted answer of that key, `takes` seconds after it starts.
// Fetches that complete at time t are processed before requests that arrive at time t.
type Step = { value?: string; error?: string; takes: number };
const input: { maxAge: number; staleWhileRevalidate: number; origin: Record<string, Step[]>; requests: { at: number; key: string }[] } =
    JSON.parse(readFileSync(0, "utf8"));

let time = 0;
const clock: Clock = { now: () => time };
type Timer = { at: number; seq: number; fire: () => void };
const timers: Timer[] = [];
let seq = 0;
const fetchCount: Record<string, number> = {};
const origin: Origin = {
    fetch(key: string): Promise<string> {
        fetchCount[key] = (fetchCount[key] ?? 0) + 1;
        const step = input.origin[key]?.[fetchCount[key] - 1];
        return new Promise<string>((resolve, reject) => {
            if (!step) return reject(new Error("origin script exhausted"));
            timers.push({ at: time + step.takes, seq: seq++, fire: () => (step.error !== undefined ? reject(new Error(step.error)) : resolve(step.value ?? "")) });
        });
    },
};

// ---------------------------------------------------------------- test runner (do not change)
const settle = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));

async function runUntil(t: number): Promise<void> {
    for (;;) {
        timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const next = timers[0];
        if (!next || next.at > t) return;
        timers.shift();
        time = next.at;
        next.fire();
        await settle();
    }
}

async function main(): Promise<void> {
    let cache: SwrCache;
    try {
        cache = new SwrCache(input.maxAge, input.staleWhileRevalidate, clock, origin);
    } catch (error) {
        console.log(`error: ${(error as Error).message}`);
        return;
    }
    const requests = [...input.requests].sort((a, b) => a.at - b.at);
    const lines: string[] = [];
    const answers: Promise<void>[] = [];
    for (const [i, r] of requests.entries()) {
        await runUntil(r.at);
        time = r.at;
        answers.push(cache.get(r.key).then((s) => {
            const what = s.error !== null ? `error "${s.error}"` : `"${s.value}"`;
            lines[i] = `t=${r.at} ${r.key}: ${s.status} ${what} fetches=${s.fetchesStarted} answered t=${time}`;
        }));
        await settle();
    }
    await runUntil(Infinity);
    await Promise.all(answers);
    for (const line of lines) console.log(line);
    console.log(`origin fetches: ${Object.keys(fetchCount).sort().map((k) => `${k}=${fetchCount[k]}`).join(" ") || "none"}`);
}
main();
