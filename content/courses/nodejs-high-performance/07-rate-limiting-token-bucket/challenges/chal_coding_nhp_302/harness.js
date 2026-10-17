// Harness: Implement a token bucket with an injected clock
// Replays a timeline of requests against one bucket. The clock is fake: it only moves
// when the timeline says so, so every run is deterministic.
// Output: one entry per request -
//   "allow"            -> take() returned { allowed: true }
//   "deny:<seconds>"   -> take() returned { allowed: false }, with Retry-After = ceil(retryAfterMs / 1000)
//   "invalid"          -> take() did not return { allowed: boolean, retryAfterMs: number }
async function __harness(input) {
    let clock = 0;
    const bucket = createTokenBucket(
        { capacity: input.capacity, refillPerSecond: input.refillPerSecond },
        () => clock
    );

    const output = [];
    for (const request of input.requests || []) {
        clock = Number(request.at) || 0;
        const result = request.cost === undefined ? bucket.take() : bucket.take(request.cost);

        if (!result || typeof result.allowed !== "boolean") {
            output.push("invalid");
        } else if (result.allowed) {
            output.push("allow");
        } else if (typeof result.retryAfterMs !== "number" || !(result.retryAfterMs > 0)) {
            output.push("invalid");
        } else {
            output.push(`deny:${Math.ceil(result.retryAfterMs / 1000)}`);
        }
    }

    return output;
}
