// Harness: cooperative scheduler with priorities and time slicing
// Tasks are built from specs { name, units, cost, priority, spawn? }: each call logs
// "<name>:<unit>", advances the fake clock by `cost` ms and returns itself until all units ran.
// spawn: { atUnit, ...taskSpec } schedules another task from inside that unit.
// The harness is the host: it runs one queued host callback per turn. Before turn k it
// schedules every input.events entry with beforeTurn === k (input arriving between tasks).
// Output: the units logged in each host turn (turns that ran nothing are left out).
async function __harness(input) {
    let now = 0;
    const hostQueue = [];
    const host = {
        now: () => now,
        yieldToHost: (callback) => { hostQueue.push(callback); },
    };

    const scheduler = createScheduler({ sliceMs: input.sliceMs }, host);
    let current = null;

    function makeTask(spec) {
        let unit = 0;
        const step = () => {
            unit += 1;
            now += spec.cost;
            if (current) current.push(`${spec.name}:${unit}`);
            if (spec.spawn && spec.spawn.atUnit === unit) {
                scheduler.schedule(makeTask(spec.spawn), spec.spawn.priority);
            }
            return unit < spec.units ? step : undefined;
        };
        return step;
    }

    for (const spec of input.tasks || []) scheduler.schedule(makeTask(spec), spec.priority);

    const events = input.events || [];
    const turns = [];
    for (let turn = 0; turn < 200; turn++) {
        for (const ev of events.filter((e) => e.beforeTurn === turn)) scheduler.schedule(makeTask(ev), ev.priority);
        if (hostQueue.length === 0) {
            if (!events.some((e) => e.beforeTurn > turn)) break;
            continue;
        }
        current = [];
        hostQueue.shift()();
        if (current.length > 0) turns.push(current);
        current = null;
    }
    return turns;
}
