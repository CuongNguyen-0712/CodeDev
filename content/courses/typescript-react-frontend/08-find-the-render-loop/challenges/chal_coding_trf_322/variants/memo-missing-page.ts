import { readFileSync } from "node:fs";

// Find the Render Loop. Since Friday's release the course catalog page of CodeDev never stops
// loading: the API logs show GET /courses?category=react&page=1 about 40 times a second from
// each open tab, the spinner flickers, and the rate limiter starts answering 429 after a minute.
// The release only moved the request parameters of CourseList into a `query` object.
//
// Fix CourseList so that it requests the courses once when it mounts, once more each time
// `category` or `page` changes, and never when the parent re-renders it with the same props.
// The screen must still show "loading" while a request is in flight and then the titles.
// Do not change the API stub, the runtime or the test runner.

type Course = { id: string; title: string; category: string };
type Query = { category: string; page: number };
type Props = { category: string; page: number };

const CATALOG: Course[] = [
    { id: "c1", title: "React Basics", category: "react" },
    { id: "c2", title: "Hooks in Depth", category: "react" },
    { id: "c3", title: "Testing React", category: "react" },
    { id: "c4", title: "Node Streams", category: "node" },
    { id: "c5", title: "Express to Fastify", category: "node" },
];
const PAGE_SIZE = 2;

// Fake GET /courses: answers on the next microtask with a new array every time, like fetch + json().
// After 20 requests in one step it stops answering, the way the rate limiter did.
const api = {
    requests: [] as Query[],
    fetchCourses(query: Query): Promise<Course[]> {
        api.requests.push({ ...query });
        if (api.requests.length > 20) return new Promise<Course[]>(() => {});
        const start = (query.page - 1) * PAGE_SIZE;
        const page = CATALOG.filter((c) => c.category === query.category).slice(start, start + PAGE_SIZE);
        return Promise.resolve(page.map((c) => ({ ...c })));
    },
};

function CourseList({ category, page }: Props): string {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);

    const query = useMemo<Query>(() => ({ category, page }), [category]);

    useEffect(() => {
        setLoading(true);
        api.fetchCourses(query).then((result) => {
            setCourses(result);
            setLoading(false);
        });
    }, [query]);

    if (loading) return "loading";
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
// Input: a list of props. The first mounts CourseList, each next one re-renders it with those props.
// After each step: the requests sent during the step, then what the screen shows once everything settled.
async function main(): Promise<void> {
    const steps: Props[] = JSON.parse(readFileSync(0, "utf8"));
    let view: ReturnType<typeof mount<Props>> | null = null;
    for (const props of steps) {
        api.requests = [];
        if (view) view.setProps(props);
        else view = mount(CourseList, props);
        const firstScreen = view.screen();
        await settle();
        const sent = api.requests.length > 20 ? "more than 20 (render loop)" : api.requests.map((q) => `${q.category}/${q.page}`).join(" ") || "none";
        console.log(`${props.category}/${props.page}: requests ${sent}; first screen "${firstScreen}"; then "${view.screen()}"`);
    }
}
main();
