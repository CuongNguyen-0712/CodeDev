import { readFileSync } from "node:fs";

// The catalog search box. Typing "react hooks" quickly sent 11 requests (one per keystroke), and the
// slow answer for "re" arrived last and replaced the right results.
//
// Write createDebouncedSearch(deps). The full rules are in the challenge description:
//   - send a request only after deps.debounceMs ms without typing, for the trimmed text;
//   - an empty or whitespace-only text shows [] at once and sends nothing;
//   - abort the previous in-flight request before sending a new one;
//   - never show a response (or an error) of a request that is no longer the latest one.
// Use only deps.clock for time and FakeAbortController for cancelling.
// Do not change the provided types, FakeAbortController or the test runner.

// ---------------------------------------------------------------- provided (do not change)
type Clock = {
    now(): number;
    setTimeout(fn: () => void, ms: number): number;
    clearTimeout(id: number): void;
};

// The same shape as the browser's AbortController / AbortSignal, small enough to fake.
class FakeAbortSignal {
    aborted = false;
    listeners: Array<() => void> = [];
    addEventListener(_type: "abort", listener: () => void): void {
        this.listeners.push(listener);
    }
}

class FakeAbortController {
    readonly signal = new FakeAbortSignal();
    abort(): void {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        for (const listener of this.signal.listeners) listener();
    }
}

type SearchDeps = {
    clock: Clock;
    debounceMs: number;
    /** GET /courses?search=... ; rejects with an error named "AbortError" when its signal is aborted. */
    search: (query: string, signal: FakeAbortSignal) => Promise<string[]>;
    show: (results: string[]) => void;
    showError: (message: string) => void;
};

type SearchBox = {
    onInput(text: string): void;
    dispose(): void;
};

// ---------------------------------------------------------------- your code
function createDebouncedSearch({ clock, debounceMs, search, show, showError }: SearchDeps): SearchBox {
    let timer: number | null = null;
    let inFlight: FakeAbortController | null = null;
    let latest = 0; // id of the only request whose answer may still be shown

    function cancelTimer(): void {
        if (timer !== null) clock.clearTimeout(timer);
        timer = null;
    }

    function abortInFlight(): void {
        inFlight?.abort();
        inFlight = null;
    }

    function send(query: string): void {
        abortInFlight();
        const id = ++latest;
        const controller = new FakeAbortController();
        inFlight = controller;
        search(query, controller.signal).then(
            (results) => {
                if (id !== latest) return; // a newer request, a cleared box or an unmount
                inFlight = null;
                show(results);
            },
            (error: unknown) => {
                if (id !== latest || (error instanceof Error && error.name === "AbortError")) return;
                inFlight = null;
                showError(error instanceof Error ? error.message : String(error));
            },
        );
    }

    return {
        onInput(text: string): void {
            cancelTimer();
            const query = text.trim();
            if (query === "") {
                latest++;
                abortInFlight();
                show([]);
                return;
            }
            send(query); // abort + stale guard are enough, no need to wait
        },
        dispose(): void {
            cancelTimer();
            latest++;
            abortInFlight();
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { debounceMs, latency: { "<query>": ms }, defaultLatency, ignoresAbort: [query], failing: [query], steps }
// Steps: { "input": "text" } sets the box to text; { "type": "abc", "every": 80 } types one character at a
// time, the clock moving `every` ms after each; { "advance": ms }; { "unmount": true }.
// After the last step the clock runs 10 more seconds. Output: the event log, as a JSON array.
type Step = { input?: string; type?: string; every?: number; advance?: number; unmount?: boolean };
type TestCase = {
    debounceMs: number;
    latency?: Record<string, number>;
    defaultLatency?: number;
    ignoresAbort?: string[];
    failing?: string[];
    steps: Step[];
};

const TITLES = [
    "React Basics",
    "React Hooks in Depth",
    "Testing React Hooks with Fake Timers",
    "Node Streams in Practice",
    "SQL Joins Without Fear",
    "Python for Data Pipelines",
    "DevOps: CI/CD from Scratch",
    "TypeScript for React Developers",
];

type Timer = { id: number; at: number; fn: () => void };
const timers = { now: 0, nextId: 1, active: [] as Timer[] };
const clock: Clock = {
    now: () => timers.now,
    setTimeout(fn, ms) {
        const id = timers.nextId++;
        timers.active.push({ id, at: timers.now + Math.max(0, ms), fn });
        return id;
    },
    clearTimeout(id) {
        timers.active = timers.active.filter((t) => t.id !== id);
    },
};

function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function advance(ms: number): Promise<void> {
    const end = timers.now + ms;
    for (;;) {
        const due = timers.active.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        timers.now = due.at;
        clock.clearTimeout(due.id);
        due.fn();
        await settle();
    }
    timers.now = end;
    await settle();
}

async function main(): Promise<void> {
    const test: TestCase = JSON.parse(readFileSync(0, "utf8"));
    const log: string[] = [];
    const at = (): string => `t=${timers.now}`;

    const search = (query: string, signal: FakeAbortSignal): Promise<string[]> => {
        log.push(`${at()} request "${query}"`);
        return new Promise((resolve, reject) => {
            const latency = test.latency?.[query] ?? test.defaultLatency ?? 200;
            const ignoresAbort = (test.ignoresAbort ?? []).includes(query);
            let pending = true;
            const timer = clock.setTimeout(() => {
                pending = false;
                log.push(`${at()} response "${query}"`);
                if ((test.failing ?? []).includes(query)) reject(new Error("HTTP 503"));
                else resolve(TITLES.filter((t) => t.toLowerCase().includes(query.toLowerCase())));
            }, latency);
            signal.addEventListener("abort", () => {
                if (!pending) return;
                log.push(`${at()} abort "${query}"${ignoresAbort ? " (ignored by the server)" : ""}`);
                if (ignoresAbort) return;
                pending = false;
                clock.clearTimeout(timer);
                const error = new Error("signal is aborted without reason");
                error.name = "AbortError";
                reject(error);
            });
        });
    };

    const box = createDebouncedSearch({
        clock,
        debounceMs: test.debounceMs,
        search,
        show: (results) => log.push(`${at()} show [${results.join(", ")}]`),
        showError: (message) => log.push(`${at()} error ${message}`),
    });

    let text = "";
    let mounted = true;
    for (const step of test.steps) {
        if (step.input !== undefined && mounted) {
            text = step.input;
            box.onInput(text);
            await settle();
        } else if (step.type !== undefined && mounted) {
            for (const ch of step.type) {
                text += ch;
                box.onInput(text);
                await settle();
                await advance(step.every ?? 0);
            }
        } else if (step.advance !== undefined) {
            await advance(step.advance);
        } else if (step.unmount && mounted) {
            mounted = false;
            box.dispose();
            log.push(`${at()} unmount`);
            await settle();
        }
    }
    await advance(10_000);
    console.log(JSON.stringify(log));
}
main();
