import { readFileSync } from "node:fs";

// A time-based cache with stale-while-revalidate, on a fake clock (whole seconds).
//
// Input: { ttl, swr, fetchSeconds, gets: [{ t, key }, ...] }, gets sorted by t (ties keep their order).
// An origin fetch for a key started at time s takes fetchSeconds (>= 1) and returns the value "v<s>"
// (the version is the second the fetch started). When it finishes at s + fetchSeconds, the entry for
// the key becomes { value: "v<s>", storedAt: s + fetchSeconds }.
//
// simulate(input) returns one line per get, then "origin fetches: <n>" (the number of fetches started).
// Before handling a get at time t, every fetch that finished at or before t is stored. Then, with
// age = t - storedAt of the key's entry:
//   - age < ttl (fresh):                  "t=<t> <key> HIT <value>"
//   - ttl <= age < ttl + swr (stale):     "t=<t> <key> STALE <value>" - the old value is served at once.
//       If no fetch for the key is in flight, start a background fetch now and add " +refresh".
//       If one is already in flight, start nothing (one fetch per key at a time).
//   - no entry, or age >= ttl + swr:      the request waits for the origin.
//       Join the fetch in flight for the key, or start one now if there is none.
//       "t=<t> <key> MISS <value of that fetch> waited <finish time - t>s"
// Keys are independent. Nothing happens between gets: a key nobody asks for is never refreshed.
// Do not change the types or the test runner.

type Get = { t: number; key: string };
type Input = { ttl: number; swr: number; fetchSeconds: number; gets: Get[] };

type Entry = { value: string; storedAt: number };
type Fetch = { start: number; done: number };

function simulate(input: Input): string[] {
    const entries = new Map<string, Entry>();
    const inFlight = new Map<string, Fetch>();
    const lines: string[] = [];
    let fetches = 0;

    const startFetch = (key: string, t: number): Fetch => {
        const f = { start: t, done: t + input.fetchSeconds };
        inFlight.set(key, f);
        fetches++;
        return f;
    };

    for (const { t, key } of input.gets) {
        for (const [k, f] of Array.from(inFlight)) {
            if (f.done <= t) {
                entries.set(k, { value: `v${f.start}`, storedAt: f.done });
                inFlight.delete(k);
            }
        }

        const entry = entries.get(key);
        const age = entry ? t - entry.storedAt : Infinity;
        if (entry && age < input.ttl) {
            lines.push(`t=${t} ${key} HIT ${entry.value}`);
        } else if (entry && age < input.ttl + input.swr) {
            const started = inFlight.has(key) ? "" : (startFetch(key, t), " +refresh");
            lines.push(`t=${t} ${key} STALE ${entry.value}${started}`);
        } else {
            const f = inFlight.get(key) ?? startFetch(key, t);
            lines.push(`t=${t} ${key} MISS v${f.start} waited ${f.done - t}s`);
        }
    }
    lines.push(`origin fetches: ${fetches}`);
    return lines;
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
for (const line of simulate(input)) console.log(line);
