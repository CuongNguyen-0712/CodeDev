import { readFileSync } from "node:fs";

// Rice Rocket courier app: tapping "Delivered" updates the list at once, before the api answers
// (TanStack Query useMutation with onMutate / onError / onSettled). In the app `cache` is the
// QueryClient; here it is a stand-in with the same behaviour, synchronous for simplicity:
//   cache.cancel(key)       drops the result of a refetch of `key` that is still in flight
//   cache.get(key)          the cached list         cache.set(key, list)   replace it (re-renders)
//   cache.invalidate(key)   refetch `key` from the api (the answer lands a moment later)
interface Delivery { id: string; status: string }
interface Vars { id: string; status: string }
interface Context { previous?: Delivery; snapshot?: Delivery[] }
interface QueryCache {
    cancel(key: string): void;
    get(key: string): Delivery[];
    set(key: string, list: Delivery[]): void;
    invalidate(key: string): void;
}
interface MutationOptions {
    onMutate(vars: Vars): Context;
    onError(error: Error, vars: Vars, ctx: Context): void;
    onSettled(error: Error | null): void;
}

const KEY = "courier-deliveries";

function completeDeliveryOptions(cache: QueryCache): MutationOptions {
    return {
        onMutate(vars) {
            // [ ] Keep an in-flight refetch from overwriting the change
            // [ ] Show the new status now and remember the old one
        },
        onError(error, vars, ctx) {
            // [ ] Undo this delivery's change only
        },
        onSettled(error) {
            // [ ] Take the server's version afterwards
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// The api applies a request as soon as it arrives (at "mutate"); the answer comes back later
// ("respond"). A delivery the customer cancelled cannot be completed (409). A background refetch
// returns the server's list as it was when the refetch started; so does one started by invalidate,
// which lands at the end of the current step.
type Step =
    | { refetchStart: true } | { refetchLand: true } | { customerCancels: string }
    | { mutate: string; status: string } | { respond: string };
interface Case { deliveries: string[]; steps: Step[] }

const input = JSON.parse(readFileSync(0, "utf8")) as Case;
const server = new Map<string, string>(input.deliveries.map((id) => [id, "picked_up"]));
const serverList = (): Delivery[] => [...server].map(([id, status]) => ({ id, status }));
let cached: Delivery[] = serverList();
let inFlight: Delivery[] | null = null;
let requested: Delivery[] | null = null;
const timeline: string[] = [];
const show = (label: string): void => {
    if (requested) { cached = requested; requested = null; }
    timeline.push(`${label}: ${cached.map((d) => `${d.id}=${d.status}`).join(" ")}`);
};
const cache: QueryCache = {
    cancel: () => { inFlight = null; requested = null; },
    get: () => cached.map((d) => ({ ...d })),
    set: (_key, list) => { cached = list.map((d) => ({ ...d })); },
    invalidate: () => { inFlight = null; requested = serverList(); },
};
const options = completeDeliveryOptions(cache);
const pending = new Map<string, { vars: Vars; ctx: Context; error: Error | null }>();

show("start");
for (const step of input.steps) {
    if ("refetchStart" in step) { inFlight = serverList(); continue; }
    if ("refetchLand" in step) {
        if (inFlight) cached = inFlight;
        inFlight = null;
        show("refetch lands");
    } else if ("customerCancels" in step) {
        server.set(step.customerCancels, "cancelled");
        continue;
    } else if ("mutate" in step) {
        const vars: Vars = { id: step.mutate, status: step.status };
        const ctx = options.onMutate(vars);
        let error: Error | null = null;
        if (server.get(vars.id) === "cancelled") error = new Error(`409: delivery ${vars.id} was cancelled by the customer`);
        else server.set(vars.id, vars.status);
        pending.set(vars.id, { vars, ctx, error });
        show(`tap ${vars.id} ${vars.status}`);
    } else {
        const p = pending.get(step.respond);
        if (!p) continue;
        pending.delete(step.respond);
        if (p.error) {
            options.onError(p.error, p.vars, p.ctx);
            show(`${step.respond} rejected`);
        }
        options.onSettled(p.error);
        show(`${step.respond} settled`);
    }
}
console.log(JSON.stringify({ timeline }));
