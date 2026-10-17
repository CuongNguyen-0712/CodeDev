// Harness: Shed load on event loop lag or too many in-flight requests
// Replays a scenario: "lag" sets what getLag() returns, "req" calls admit(), "done"
// calls the release() of an earlier accepted request, "count" reads inFlight().
// Output: one entry per req ("accept" | "reject:lag" | "reject:in_flight" | "invalid")
// and per count (a number).
async function __harness(input) {
    let lag = 0;
    const shedder = createLoadShedder(input.limits, () => lag);
    const accepted = {};
    const output = [];

    for (const step of input.steps || []) {
        if (step.op === "lag") {
            lag = Number(step.ms) || 0;
        } else if (step.op === "req") {
            const decision = shedder.admit();
            if (decision && decision.accepted === true && typeof decision.release === "function") {
                accepted[step.id] = decision.release;
                output.push("accept");
            } else if (decision && decision.accepted === false && (decision.reason === "lag" || decision.reason === "in_flight")) {
                output.push(`reject:${decision.reason}`);
            } else {
                output.push("invalid");
            }
        } else if (step.op === "done") {
            if (accepted[step.id]) accepted[step.id]();
        } else if (step.op === "count") {
            output.push(shedder.inFlight());
        }
    }

    return output;
}
