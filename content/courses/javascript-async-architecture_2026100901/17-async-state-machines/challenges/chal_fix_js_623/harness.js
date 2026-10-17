// Harness: Fix the controller that lets a stale response win
// Drives the controller with a fake fetcher whose calls stay pending until a step
// settles them (in any order). The machine is a correct request-lifecycle reducer.
// Output: one "<status>#<requestId>" entry per notification, plus the final state.
//   { op: "load", params } | { op: "resolve", call, data } | { op: "reject", call, error } | { op: "cancel" }
async function __harness(input) {
    const MAX = 3;
    function __transition(state, event) {
        const isCurrent = state.status === "loading" && event.requestId === state.requestId;
        switch (event.type) {
            case "FETCH":
                return { status: "loading", requestId: state.requestId + 1, attempt: 1 };
            case "RESOLVE":
                return isCurrent ? { status: "success", requestId: state.requestId, data: event.data } : state;
            case "REJECT":
                return isCurrent ? { status: "error", requestId: state.requestId, attempt: state.attempt, error: event.error } : state;
            case "CANCEL":
                return state.status === "loading" ? { status: "cancelled", requestId: state.requestId } : state;
            case "RETRY":
                return state.status === "error" && state.attempt < MAX
                    ? { status: "loading", requestId: state.requestId + 1, attempt: state.attempt + 1 }
                    : state;
            default:
                return state;
        }
    }

    const calls = [];
    const fetcher = (params) => new Promise((resolve, reject) => { calls.push({ params, resolve, reject }); });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    const controller = createRequestController({ fetcher, transition: __transition });
    const renders = [];
    controller.subscribe((s) => renders.push(`${s.status}#${s.requestId}`));

    for (const step of input.steps || []) {
        if (step.op === "load") controller.load(step.params);
        else if (step.op === "resolve") calls[step.call].resolve(step.data);
        else if (step.op === "reject") calls[step.call].reject(new Error(step.error));
        else if (step.op === "cancel") controller.cancel();
        await settle();
    }

    return { renders, final: controller.getState() };
}
