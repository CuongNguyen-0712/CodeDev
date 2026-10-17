// Harness: Write a request-lifecycle transition function
// Folds input.events through transition(), starting from idle. Output:
//   statuses - the status after each event
//   ignored  - how many events returned the very same state object
//   mutated  - true if any state object was changed in place (the reducer must be pure)
//   final    - the last state
async function __harness(input) {
    let state = { status: "idle", requestId: 0 };
    const statuses = [];
    let ignored = 0;
    let mutated = false;

    for (const event of input.events || []) {
        const before = JSON.stringify(state);
        const next = transition(state, { ...event });
        if (JSON.stringify(state) !== before) mutated = true;
        if (next === state) ignored += 1;
        state = next;
        statuses.push(state && state.status);
    }

    return { statuses, ignored, mutated, final: state };
}
