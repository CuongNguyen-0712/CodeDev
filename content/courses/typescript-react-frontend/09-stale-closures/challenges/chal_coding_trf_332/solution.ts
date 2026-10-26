import { readFileSync } from "node:fs";

// Spot the AI Mistake: stale filter. The request sent to an AI coding assistant was:
//   "LiveCatalog shows the courses of the selected category. Refresh the list every 30 seconds
//    so courses published by instructors appear without a page reload."
// The assistant added the polling effect below. ESLint flagged it, so the assistant also added an
// eslint-disable comment, and the pull request was merged because the page looked right in review.
//
// Learners now report that the catalog "jumps back": they switch the category from React to
// Node, see the Node courses, and up to 30 seconds later the list shows React courses again.
// Support also sees React requests in the API logs from tabs that show Node.
//
// Fix LiveCatalog so that the list always shows the category it was last rendered with: one
// request when the category changes, then exactly one request per 30 seconds for the current
// category, and no requests at all after the component unmounts.
// Do not change the API stub, the runtime or the test runner.

type Course = { id: string; title: string; category: string };
type Props = { filter: string };

const CATALOG: Course[] = [
    { id: "c1", title: "React Basics", category: "react" },
    { id: "c2", title: "Hooks in Depth", category: "react" },
    { id: "c4", title: "Node Streams", category: "node" },
    { id: "c6", title: "SQL Joins", category: "sql" },
];

// Fake GET /courses?category=...: answers on the next microtask, like fetch + json().
const api = {
    requests: [] as string[],
    fetchCourses(category: string): Promise<Course[]> {
        api.requests.push(category);
        return Promise.resolve(CATALOG.filter((c) => c.category === category).map((c) => ({ ...c })));
    },
};

function LiveCatalog({ filter }: Props): string {
    const [courses, setCourses] = useState<Course[]>([]);

    useEffect(() => {
        api.fetchCourses(filter).then(setCourses);
    }, [filter]);

    // Refresh every 30 seconds so newly published courses show up.
    useEffect(() => {
        const id = timers.setInterval(() => {
            api.fetchCourses(filter).then(setCourses);
        }, 30_000);
        return () => timers.clearInterval(id);
    }, [filter]);

    return courses.length ? courses.map((c) => c.title).join(", ") : "no courses";
}
// ------------------------------------------------------------------ mini React runtime (do not change)
// Just enough of React to run one component without a browser. Hooks are stored in call order.
// An effect runs after the render when one of its dependencies changed (compared with Object.is,
// like React) or when it has no dependency array at all; its previous cleanup runs first.
// State updates re-render the component once per batch. Timers come from a fake clock (`timers`).
type Cleanup = void | (() => void);
type Slot = { value: unknown; deps?: readonly unknown[]; cleanup?: Cleanup; mounted?: boolean };

let slots: Slot[] = [];
let cursor = 0;
let pendingEffects: Array<() => void> = [];
let rerender: (() => void) | null = null;
let scheduled = false;

function slot(initial: () => unknown): Slot {
    const index = cursor++;
    if (slots.length <= index) slots.push({ value: initial() });
    return slots[index];
}

function depsChanged(prev: readonly unknown[] | undefined, next: readonly unknown[] | undefined): boolean {
    if (prev === undefined || next === undefined) return true;
    return prev.length !== next.length || next.some((dep, i) => !Object.is(dep, prev[i]));
}

function useState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void] {
    const s = slot(() => initial);
    const setState = (next: T | ((prev: T) => T)): void => {
        const value = typeof next === "function" ? (next as (prev: T) => T)(s.value as T) : next;
        if (Object.is(value, s.value)) return;
        s.value = value;
        if (!scheduled && rerender) {
            scheduled = true;
            queueMicrotask(() => {
                scheduled = false;
                rerender?.();
            });
        }
    };
    return [s.value as T, setState];
}

function useEffect(effect: () => Cleanup, deps?: readonly unknown[]): void {
    const s = slot(() => undefined);
    if (s.mounted && !depsChanged(s.deps, deps)) return;
    s.mounted = true;
    s.deps = deps;
    pendingEffects.push(() => {
        if (typeof s.cleanup === "function") s.cleanup();
        s.cleanup = effect();
    });
}

function useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
    const s = slot(() => undefined);
    if (!s.mounted || depsChanged(s.deps, deps)) {
        s.mounted = true;
        s.deps = deps;
        s.value = factory();
    }
    return s.value as T;
}

function useCallback<T>(fn: T, deps: readonly unknown[]): T {
    return useMemo(() => fn, deps);
}

function useRef<T>(initial: T): { current: T } {
    return slot(() => ({ current: initial })).value as { current: T };
}

type Timer = { id: number; at: number; every: number; fn: () => void };
const timers = {
    now: 0,
    nextId: 1,
    active: [] as Timer[],
    setTimeout(fn: () => void, ms: number): number {
        const id = timers.nextId++;
        timers.active.push({ id, at: timers.now + ms, every: 0, fn });
        return id;
    },
    setInterval(fn: () => void, ms: number): number {
        const id = timers.nextId++;
        timers.active.push({ id, at: timers.now + ms, every: ms, fn });
        return id;
    },
    clearTimeout(id: number): void {
        timers.active = timers.active.filter((t) => t.id !== id);
    },
    clearInterval(id: number): void {
        timers.clearTimeout(id);
    },
};

/** Lets pending promises and re-renders finish (real macrotask: every microtask runs first). */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Moves the fake clock forward, firing due timers in order and settling after each one. */
async function advance(ms: number): Promise<void> {
    const end = timers.now + ms;
    for (;;) {
        const due = timers.active.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        timers.now = due.at;
        if (due.every > 0) due.at += due.every;
        else timers.clearTimeout(due.id);
        due.fn();
        await settle();
    }
    timers.now = end;
}

function mount<P>(component: (props: P) => string, props: P) {
    let current = props;
    let output = "";
    const render = (): void => {
        cursor = 0;
        output = component(current);
        const effects = pendingEffects;
        pendingEffects = [];
        for (const run of effects) run();
    };
    slots = [];
    rerender = render;
    render();
    return {
        setProps(next: P): void {
            current = next;
            render();
        },
        screen: (): string => output,
        unmount(): void {
            for (const s of slots) if (typeof s.cleanup === "function") s.cleanup();
            rerender = null;
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of steps. { "filter": "react" } mounts LiveCatalog (first time) or re-renders it with
// that filter; { "advance": 30000 } moves the fake clock forward that many milliseconds;
// { "unmount": true } removes the component. After each step: the requests sent during the step
// and what the screen shows once everything settled.
type Step = { filter?: string; advance?: number; unmount?: boolean };

async function main(): Promise<void> {
    const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
    let view: ReturnType<typeof mount<Props>> | null = null;
    for (const step of steps) {
        api.requests = [];
        let label = "";
        if (step.filter !== undefined) {
            label = `filter ${step.filter}`;
            if (view) view.setProps({ filter: step.filter });
            else view = mount(LiveCatalog, { filter: step.filter });
        } else if (step.advance !== undefined) {
            label = `+${step.advance / 1000}s`;
            await advance(step.advance);
        } else if (step.unmount && view) {
            label = "unmount";
            view.unmount();
            view = null;
        }
        await settle();
        console.log(`${label}: requests ${api.requests.join(" ") || "none"}; screen "${view ? view.screen() : "(unmounted)"}"`);
    }
}
main();
